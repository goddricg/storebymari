import { createHash, randomUUID } from "crypto";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import pool from "@/lib/mysql";
import { getSiteId } from "@/lib/site";
import { isAdminRole } from "@/lib/auth/roles";
import { getEffectiveUserTier } from "@/lib/auth/tier";
import { getPriceByTier } from "@/lib/utils/pricing";
import { getAccountInventory, type StockAccount } from "@/lib/products/stock-utils";
import {
  createCaseHeaderWithinTransaction,
  finalizeCaseWithinTransaction,
} from "@/lib/purchase-cases/repository";
import type { PurchaseCaseSummary } from "@/lib/purchase-cases/types";
import { MAX_CART_LINE_ITEMS } from "@/lib/cart/limits";

export { MAX_CART_LINE_ITEMS } from "@/lib/cart/limits";

export type CartCheckoutLine = {
  typeId: string;
  quantity: number;
};

export type CartCheckoutPayload = {
  lines: CartCheckoutLine[];
};

export type CartCheckoutOrder = {
  id: string;
  productName: string;
  productDetails: string | null;
  accountEmail: string | null;
  accountPassword: string | null;
  price: number;
  purchaseDate: string;
};

export type CartCheckoutSuccessBody = {
  ok: true;
  message: string;
  caseOrder: PurchaseCaseSummary;
  orders: CartCheckoutOrder[];
  points: number;
  quantity: number;
};

export type CartCheckoutErrorBody = {
  ok: false;
  message: string;
  retryable?: boolean;
  status?: "PROCESSING";
};

export type CartCheckoutResult = {
  status: number;
  body: CartCheckoutSuccessBody | CartCheckoutErrorBody;
  replayed?: boolean;
};

type CheckoutRequestRow = RowDataPacket & {
  id: string;
  request_fingerprint: string;
  status: "PROCESSING" | "SUCCEEDED" | "FAILED";
  processing_token: string;
  lease_expires_at: Date | string | null;
  response_status: number | null;
  saved_response: string | null;
};

type UserRow = RowDataPacket & {
  id: string;
  email: string;
  display_name: string | null;
  is_active: number | boolean;
  is_admin: number | boolean;
  role: string | null;
  is_banned: number | boolean;
  points: number | string | null;
  user_tier: string | null;
  tier_expires_at: Date | string | null;
};

type ProductRow = RowDataPacket & {
  id: string;
  site_id: string;
  is_local: number | boolean;
  type_id: string;
  name: string | null;
  image_url: string | null;
  details: string | null;
  price: number | string | null;
  price_vip: number | string | null;
  price_walkin: number | string | null;
  site_retail_price: number | string | null;
  site_price_vip: number | string | null;
  site_price_walkin: number | string | null;
  cost_price: number | string | null;
  stock: number | string | null;
  type_menu: string | null;
  account_email: string | null;
  account_password: string | null;
  account_data: unknown;
  api_provider_id: string | null;
  is_published: number | boolean;
};

type NormalizedCartLine = CartCheckoutLine;
type ExistingCheckoutDecision =
  | { kind: "conflict" }
  | { kind: "processing" }
  | { kind: "replay"; result: CartCheckoutResult };

export class CartCheckoutError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "CartCheckoutError";
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY";
}

function leaseExpired(value: Date | string | null): boolean {
  if (!value) return true;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) || date.getTime() <= Date.now();
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function asIso(value: Date): string {
  return value.toISOString();
}

function normalizedLines(payload: CartCheckoutPayload): NormalizedCartLine[] {
  const merged = new Map<string, number>();
  for (const line of payload.lines) {
    const typeId = line.typeId.trim();
    const quantity = Number(line.quantity);
    if (!typeId || !Number.isSafeInteger(quantity) || quantity < 1) {
      throw new CartCheckoutError("ข้อมูลตะกร้าไม่ถูกต้อง", 422);
    }
    const nextQuantity = (merged.get(typeId) ?? 0) + quantity;
    if (!Number.isSafeInteger(nextQuantity)) {
      throw new CartCheckoutError("จำนวนสินค้าในตะกร้ามากเกินไป", 422);
    }
    merged.set(typeId, nextQuantity);
  }

  const lines = [...merged.entries()].map(([typeId, quantity]) => ({ typeId, quantity }));
  if (lines.length === 0) throw new CartCheckoutError("กรุณาเพิ่มสินค้าในตะกร้าก่อนชำระเงิน", 422);
  if (lines.length > MAX_CART_LINE_ITEMS) {
    throw new CartCheckoutError("ตะกร้ารองรับสินค้าได้ไม่เกิน 10 รายการต่อครั้ง และไม่จำกัดจำนวนชิ้นต่อรายการ (ตามสต็อก)", 422);
  }
  return lines;
}

export function normalizeCartPayload(payload: CartCheckoutPayload): CartCheckoutPayload {
  return { lines: normalizedLines(payload) };
}

export function createCartCheckoutFingerprint(payload: CartCheckoutPayload): string {
  const normalized = normalizeCartPayload(payload);
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function parseSavedResponse(value: string | null): CartCheckoutResult["body"] | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as CartCheckoutResult["body"];
  } catch {
    return null;
  }
}

function processingResult(): CartCheckoutResult {
  return {
    status: 202,
    body: {
      ok: false,
      message: "ระบบกำลังดำเนินการสั่งซื้อ กรุณาลองใหม่ด้วยคำขอเดิม",
      retryable: true,
      status: "PROCESSING",
    },
  };
}

function errorResult(status: number, message: string): CartCheckoutResult {
  return { status, body: { ok: false, message } };
}

async function findExistingRequest(
  siteId: string,
  buyerUserId: string,
  idempotencyKey: string,
): Promise<CheckoutRequestRow | null> {
  const [rows] = await pool.execute<CheckoutRequestRow[]>(
    `SELECT *
     FROM cart_checkout_requests
     WHERE site_id = ? AND buyer_user_id = ? AND idempotency_key = ?
     LIMIT 1`,
    [siteId, buyerUserId, idempotencyKey],
  );
  return rows[0] ?? null;
}

function decideExistingRequest(
  row: CheckoutRequestRow,
  requestFingerprint: string,
): ExistingCheckoutDecision {
  if (row.request_fingerprint !== requestFingerprint) return { kind: "conflict" };
  if (row.status === "PROCESSING") return { kind: "processing" };
  const body = parseSavedResponse(row.saved_response);
  if (!body) return { kind: "replay", result: errorResult(500, "ไม่พบผลลัพธ์การสั่งซื้อที่บันทึกไว้") };
  return {
    kind: "replay",
    result: { status: row.response_status ?? (body.ok ? 200 : 400), body, replayed: true },
  };
}

export async function claimCartCheckout(input: {
  siteId: string;
  buyerUserId: string;
  idempotencyKey: string;
  requestFingerprint: string;
}): Promise<
  | { kind: "claimed"; requestId: string; processingToken: string }
  | { kind: "existing"; decision: ExistingCheckoutDecision }
> {
  const requestId = randomUUID();
  const processingToken = randomUUID();
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + 5 * 60_000);

  try {
    await pool.execute(
      `INSERT INTO cart_checkout_requests (
         id, site_id, buyer_user_id, idempotency_key, request_fingerprint,
         status, processing_token, lease_expires_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 'PROCESSING', ?, ?, ?, ?)`,
      [
        requestId,
        input.siteId,
        input.buyerUserId,
        input.idempotencyKey,
        input.requestFingerprint,
        processingToken,
        leaseExpiresAt,
        now,
        now,
      ],
    );
    return { kind: "claimed", requestId, processingToken };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const existing = await findExistingRequest(input.siteId, input.buyerUserId, input.idempotencyKey);
    if (!existing) return { kind: "existing", decision: { kind: "processing" } };
    const decision = decideExistingRequest(existing, input.requestFingerprint);
    if (
      decision.kind === "processing" &&
      existing.status === "PROCESSING" &&
      leaseExpired(existing.lease_expires_at)
    ) {
      const [result] = await pool.execute<ResultSetHeader>(
        `UPDATE cart_checkout_requests
         SET processing_token = ?, lease_expires_at = ?, updated_at = ?
         WHERE id = ? AND request_fingerprint = ? AND status = 'PROCESSING'
           AND (lease_expires_at IS NULL OR lease_expires_at <= ?)`,
        [
          processingToken,
          leaseExpiresAt,
          now,
          existing.id,
          input.requestFingerprint,
          now,
        ],
      );
      if (result.affectedRows === 1) {
        return { kind: "claimed", requestId: existing.id, processingToken };
      }
    }
    return {
      kind: "existing",
      decision,
    };
  }
}

export async function waitForCartCheckout(input: {
  siteId: string;
  buyerUserId: string;
  idempotencyKey: string;
  requestFingerprint: string;
}): Promise<CartCheckoutResult> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const existing = await findExistingRequest(input.siteId, input.buyerUserId, input.idempotencyKey);
    if (!existing) return processingResult();
    const decision = decideExistingRequest(existing, input.requestFingerprint);
    if (decision.kind === "conflict") return errorResult(409, "Idempotency key ถูกใช้กับข้อมูลตะกร้าอื่นแล้ว");
    if (decision.kind === "replay") return decision.result;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return processingResult();
}

async function lockUser(connection: PoolConnection, siteId: string, userId: string): Promise<UserRow | null> {
  const [rows] = await connection.execute<UserRow[]>(
    `SELECT id, email, display_name, is_active, is_admin, role, is_banned,
            points, user_tier, tier_expires_at
     FROM users
     WHERE id = ? AND site_id = ?
     LIMIT 1
     FOR UPDATE`,
    [userId, siteId],
  );
  return rows[0] ?? null;
}

async function lockProduct(
  connection: PoolConnection,
  siteId: string,
  typeId: string,
): Promise<ProductRow | null> {
  const [rows] = await connection.execute<ProductRow[]>(
    `SELECT p.*,
       spp.retail_price AS site_retail_price,
       spp.price_vip AS site_price_vip,
       spp.price_walkin AS site_price_walkin
     FROM products p
     LEFT JOIN site_product_prices spp
       ON spp.product_id = p.id AND spp.site_id = ?
     WHERE p.type_id = ?
       AND p.is_published = 1
       AND (p.is_local = 0 OR (p.is_local = 1 AND p.site_id = ?))
     LIMIT 1
     FOR UPDATE`,
    [siteId, typeId, siteId],
  );
  return rows[0] ?? null;
}

function unitPrice(product: ProductRow, user: UserRow): number {
  const isAdmin = isAdminRole(user.role) || user.is_admin === 1 || user.is_admin === true;
  const retailPrice = product.site_retail_price ?? product.price;
  const priceVip = product.site_price_vip ?? product.price_vip;
  const priceWalkin = product.site_price_walkin ?? product.price_walkin;
  const selected = isAdmin && product.price != null
    ? product.price
    : getPriceByTier(
        retailPrice == null ? null : Number(retailPrice),
        priceVip == null ? null : Number(priceVip),
        priceWalkin == null ? null : Number(priceWalkin),
        getEffectiveUserTier(user.user_tier ?? "normal", user.tier_expires_at),
      );
  return Math.max(0, Number(selected ?? 0));
}

function stockForProduct(product: ProductRow, inventory: StockAccount[]): number {
  if (inventory.length > 0) return inventory.length;
  if (product.account_email || product.account_password) return Math.max(0, Math.trunc(Number(product.stock ?? 0)));
  return 0;
}

function accountDetails(account: StockAccount, fallback: string | null): string | null {
  if (account.details) return account.details;
  const details = [
    account.email ? `Email: ${account.email}` : "",
    account.password ? `Pass: ${account.password}` : "",
    fallback || "",
  ].filter(Boolean);
  return details.length > 0 ? details.join("\n") : null;
}

async function insertOrder(
  connection: PoolConnection,
  input: {
    caseOrderId: string;
    caseItemIndex: number;
    siteId: string;
    user: UserRow;
    product: ProductRow;
    account: StockAccount;
    price: number;
    createdAt: Date;
  },
): Promise<CartCheckoutOrder> {
  const costPrice = input.siteId === "main"
    ? Number(input.product.cost_price ?? 0)
    : Number(input.product.price ?? 0);
  const productDetails = accountDetails(input.account, input.product.details);
  const id = randomUUID();
  await connection.execute(
    `INSERT INTO orders (
       id, case_order_id, case_item_index, product_type_id, product_name,
       product_image, product_details, price, type_menu, purchase_date,
       username_buy, buyer_user_id, raw_response, created_at, cost_price,
       profit, buyer_email, buyer_display_name, api_provider_id,
       account_email, account_password, site_id, is_local
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.caseOrderId,
      input.caseItemIndex,
      input.product.type_id,
      input.product.name || input.product.type_id,
      input.product.image_url || null,
      productDetails,
      input.price,
      input.product.type_menu || null,
      input.createdAt,
      input.user.display_name || input.user.email,
      input.user.id,
      JSON.stringify({ source: "cart-checkout", typeId: input.product.type_id }),
      input.createdAt,
      costPrice,
      input.price - costPrice,
      input.user.email,
      input.user.display_name || null,
      null,
      input.account.email || null,
      input.account.password || null,
      input.siteId,
      input.product.is_local ? 1 : 0,
    ],
  );

  return {
    id,
    productName: input.product.name || input.product.type_id,
    productDetails,
    accountEmail: input.account.email || null,
    accountPassword: input.account.password || null,
    price: input.price,
    purchaseDate: asIso(input.createdAt),
  };
}

export async function executeCartCheckout(input: {
  requestId: string;
  processingToken: string;
  siteId?: string;
  buyerUserId: string;
  payload: CartCheckoutPayload;
}): Promise<CartCheckoutResult> {
  const siteId = input.siteId ?? getSiteId();
  const payload = normalizeCartPayload(input.payload);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [requestRows] = await connection.execute<CheckoutRequestRow[]>(
      `SELECT *
       FROM cart_checkout_requests
       WHERE id = ? AND processing_token = ?
       LIMIT 1
       FOR UPDATE`,
      [input.requestId, input.processingToken],
    );
    if (!requestRows[0] || requestRows[0].status !== "PROCESSING") {
      await connection.rollback();
      return processingResult();
    }

    const user = await lockUser(connection, siteId, input.buyerUserId);
    if (!user || !user.is_active || user.is_banned) {
      throw new CartCheckoutError("บัญชีผู้ใช้ไม่พร้อมใช้งาน", 401);
    }

    const sortedLines = [...payload.lines].sort((a, b) => a.typeId.localeCompare(b.typeId));
    const productMap = new Map<string, ProductRow>();
    for (const line of sortedLines) {
      const product = await lockProduct(connection, siteId, line.typeId);
      if (!product) throw new CartCheckoutError(`ไม่พบสินค้า ${line.typeId}`, 404);
      if (product.api_provider_id) {
        throw new CartCheckoutError(
          `สินค้า ${product.name || line.typeId} ต้องซื้อทันที เนื่องจากการจัดส่งผ่าน External Provider ยังไม่รองรับในตะกร้า`,
          409,
        );
      }
      productMap.set(line.typeId, product);
    }

    let totalPoints = 0;
    let totalQuantity = 0;
    for (const line of payload.lines) {
      const product = productMap.get(line.typeId)!;
      const inventory = getAccountInventory(product);
      const stock = stockForProduct(product, inventory);
      if (stock < line.quantity) {
        throw new CartCheckoutError(
          `${product.name || line.typeId} มีสต็อกไม่เพียงพอ (ต้องการ ${line.quantity} ชิ้น แต่มี ${stock} ชิ้น)`,
          409,
        );
      }
      const hasDeliverableAccount = inventory.length > 0 || Boolean(product.account_email || product.account_password);
      if (!hasDeliverableAccount) {
        throw new CartCheckoutError(`สินค้า ${product.name || line.typeId} ยังไม่มีข้อมูลสำหรับจัดส่ง`, 409);
      }
      const price = unitPrice(product, user);
      if (!Number.isFinite(price) || price < 0) {
        throw new CartCheckoutError(`สินค้ายังไม่ได้ตั้งราคาพ้อยท์อย่างถูกต้อง`, 400);
      }
      const lineTotal = price * line.quantity;
      const nextTotalPoints = totalPoints + lineTotal;
      const nextTotalQuantity = totalQuantity + line.quantity;
      if (!Number.isFinite(lineTotal) || !Number.isFinite(nextTotalPoints) || !Number.isSafeInteger(nextTotalQuantity)) {
        throw new CartCheckoutError("จำนวนสินค้าในตะกร้ามากเกินไป", 422);
      }
      totalPoints = nextTotalPoints;
      totalQuantity = nextTotalQuantity;
    }
    totalPoints = roundCurrency(totalPoints);

    const currentPoints = Number(user.points ?? 0);
    if (!Number.isFinite(currentPoints) || currentPoints < totalPoints) {
      throw new CartCheckoutError(
        `พ้อยท์ไม่เพียงพอ (ต้องการ ${totalPoints.toLocaleString("th-TH")} พ้อยท์ แต่มี ${Math.max(0, currentPoints).toLocaleString("th-TH")} พ้อยท์)`,
        400,
      );
    }

    const createdAt = new Date();
    const header = await createCaseHeaderWithinTransaction(connection, {
      siteId,
      buyerUserId: input.buyerUserId,
      createdAt,
      totalPoints,
    });
    const deliveredOrders: CartCheckoutOrder[] = [];
    let caseItemIndex = 1;

    for (const line of payload.lines) {
      const product = productMap.get(line.typeId)!;
      const inventory = getAccountInventory(product);
      const price = unitPrice(product, user);
      let accounts: StockAccount[];

      if (inventory.length > 0) {
        accounts = inventory.slice(0, line.quantity);
        const remaining = inventory.slice(line.quantity);
        await connection.execute(
          `UPDATE products
           SET account_data = ?, stock = ?, updated_at = ?
           WHERE id = ? AND site_id = ?`,
          [JSON.stringify(remaining), remaining.length, createdAt, product.id, product.site_id],
        );
      } else {
        const staticAccount: StockAccount = {
          email: product.account_email || undefined,
          password: product.account_password || undefined,
          details: product.details || undefined,
        };
        accounts = Array.from({ length: line.quantity }, () => ({ ...staticAccount }));
        const [updated] = await connection.execute<ResultSetHeader>(
          `UPDATE products
           SET stock = stock - ?, updated_at = ?
           WHERE id = ? AND site_id = ? AND stock >= ?`,
          [line.quantity, createdAt, product.id, product.site_id, line.quantity],
        );
        if (updated.affectedRows !== 1) {
          throw new CartCheckoutError("สต็อกเปลี่ยนระหว่างกำลังสั่งซื้อ กรุณาลองใหม่", 409);
        }
      }

      for (const account of accounts) {
        deliveredOrders.push(await insertOrder(connection, {
          caseOrderId: header.id,
          caseItemIndex,
          siteId,
          user,
          product,
          account,
          price,
          createdAt,
        }));
      }
      caseItemIndex += 1;
    }

    const [balanceUpdate] = await connection.execute<ResultSetHeader>(
      `UPDATE users
       SET points = points - ?, updated_at = ?
       WHERE id = ? AND site_id = ? AND points >= ?`,
      [totalPoints, createdAt, input.buyerUserId, siteId, totalPoints],
    );
    if (balanceUpdate.affectedRows !== 1) {
      throw new CartCheckoutError("ยอดพ้อยท์เปลี่ยนระหว่างกำลังสั่งซื้อ กรุณาลองใหม่", 409);
    }

    const caseOrder = await finalizeCaseWithinTransaction(connection, {
      caseOrderId: header.id,
      siteId,
      buyerUserId: input.buyerUserId,
      totalPoints,
      completedAt: createdAt,
    });
    const remainingPoints = roundCurrency(currentPoints - totalPoints);
    const body: CartCheckoutSuccessBody = {
      ok: true,
      message: `สั่งซื้อสินค้าสำเร็จ ${totalQuantity} ชิ้น`,
      caseOrder,
      orders: deliveredOrders,
      points: remainingPoints,
      quantity: totalQuantity,
    };
    await connection.execute(
      `UPDATE cart_checkout_requests
       SET status = 'SUCCEEDED', case_order_id = ?, response_status = 200,
           saved_response = ?, lease_expires_at = NULL, updated_at = ?
       WHERE id = ? AND processing_token = ?`,
      [header.id, JSON.stringify(body), new Date(), input.requestId, input.processingToken],
    );
    await connection.commit();
    return { status: 200, body };
  } catch (error) {
    await connection.rollback();
    console.error("Cart checkout transaction failed:", error);
    const status = error instanceof CartCheckoutError ? error.status : 500;
    const message = error instanceof CartCheckoutError
      ? error.message
      : "ไม่สามารถดำเนินการสั่งซื้อจากตะกร้าได้ กรุณาลองใหม่";
    const body: CartCheckoutErrorBody = { ok: false, message };
    try {
      await pool.execute(
        `UPDATE cart_checkout_requests
         SET status = 'FAILED', response_status = ?, saved_response = ?,
             lease_expires_at = NULL, updated_at = ?
         WHERE id = ? AND processing_token = ? AND status = 'PROCESSING'`,
        [status, JSON.stringify(body), new Date(), input.requestId, input.processingToken],
      );
    } catch {
      // Keep the original checkout failure. A later retry can recover stale state.
    }
    return { status, body };
  } finally {
    connection.release();
  }
}
