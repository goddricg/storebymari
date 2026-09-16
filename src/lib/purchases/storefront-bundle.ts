import { createHash, randomUUID } from "crypto";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import pool from "@/lib/mysql";
import type { PublicUser } from "@/lib/auth/user";
import { isAdminRole } from "@/lib/auth/roles";
import { getPriceByTier } from "@/lib/utils/pricing";
import { getEffectiveUserTier } from "@/lib/auth/tier";
import { getSiteId } from "@/lib/site";
import {
  getAccountInventory,
  type StockAccount,
} from "@/lib/products/stock-utils";
import {
  lockPurchaseOptionForProduct,
  purchaseOptionRowToPublic,
} from "@/lib/purchase-options/repository";

const PROCESSING_WAIT_MS = 5_000;
const PROCESSING_POLL_MS = 50;

export type StorefrontBundlePayload = {
  typeId: string;
  purchaseOptionId: string;
  quantity: number;
  giftTypeId?: string;
};

export type StorefrontBundleOrder = {
  id: string;
  productName: string;
  productDetails: string | null;
  accountEmail: string | null;
  accountPassword: string | null;
  price: number | null;
  purchaseDate: string | null;
  purchaseOptionId?: string;
  purchaseOptionName?: string;
  purchaseOptionQuantity?: number;
};

type StorefrontBundleSuccessBody = {
  ok: true;
  message: string;
  order: StorefrontBundleOrder | StorefrontBundleOrder[];
  orders: StorefrontBundleOrder[];
  orderId: string;
  points: number;
  quantity: number;
  purchaseOption: {
    id: string;
    name: string;
    quantity: number;
    totalPrice: number;
  };
};

type StorefrontBundleErrorBody = {
  ok: false;
  message: string;
  retryable?: boolean;
  status?: "PROCESSING";
};

export type StorefrontBundleBody =
  | StorefrontBundleSuccessBody
  | StorefrontBundleErrorBody;

export type StorefrontBundleResult = {
  status: number;
  body: StorefrontBundleBody;
  replayed?: boolean;
};

type ExistingDecision =
  | { kind: "conflict" }
  | { kind: "processing" }
  | { kind: "replay"; status: number; body: StorefrontBundleBody };

type ClaimResult =
  | { kind: "claimed"; requestId: string; processingToken: string }
  | { kind: "existing"; decision: ExistingDecision };

type StorefrontRequestRow = RowDataPacket & {
  id: string;
  site_id: string;
  buyer_user_id: string;
  idempotency_key: string;
  request_fingerprint: string;
  product_id: string;
  product_type_id: string;
  purchase_option_id: string;
  quantity: number | string;
  status: string;
  processing_token: string;
  lease_expires_at: Date | string | null;
  order_id: string | null;
  response_status: number | null;
  saved_response: string | null;
};

type LockedUserRow = RowDataPacket & {
  id: string;
  email: string;
  display_name: string | null;
  is_active: number | boolean;
  is_admin: number | boolean;
  role: string | null;
  user_tier: "normal" | "vip" | "walkin" | null;
  tier_expires_at: Date | string | null;
  is_banned: number | boolean;
  points: number | string | null;
};

type LockedProductRow = RowDataPacket & {
  id: string;
  site_id: string | null;
  is_local: number | boolean;
  type_id: string;
  name: string | null;
  image_url: string | null;
  details: string | null;
  price: number | string | null;
  price_vip: number | string | null;
  price_walkin: number | string | null;
  site_retail_price: number | string | null;
  cost_price: number | string | null;
  stock: number | string | null;
  type_menu: string | null;
  account_email: string | null;
  account_password: string | null;
  account_data: unknown;
  api_provider_id: string | null;
};

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY"
  );
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseSavedResponse(value: string | null): StorefrontBundleBody | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as StorefrontBundleBody;
  } catch {
    return null;
  }
}

function processingResult(): StorefrontBundleResult {
  return {
    status: 202,
    body: {
      ok: false,
      message: "กำลังประมวลผลรายการซื้อ กรุณาลองใหม่ด้วยคำขอเดิม",
      retryable: true,
      status: "PROCESSING",
    },
  };
}

function errorResult(status: number, message: string): StorefrontBundleResult {
  return { status, body: { ok: false, message } };
}

function accountDetails(account: StockAccount): string | null {
  if (account.details) return account.details;
  const parts = [
    account.email ? `Email: ${account.email}` : "",
    account.password ? `Pass: ${account.password}` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("\n") : null;
}

function isAdmin(user: LockedUserRow): boolean {
  return (
    isAdminRole(user.role) ||
    user.is_admin === 1 ||
    user.is_admin === true
  );
}

function optionPrice(
  option: { price: number | string; price_vip: number | string | null; price_walkin: number | string | null },
  user: LockedUserRow
): number {
  if (isAdmin(user)) return Math.max(0, Number(option.price));
  return Math.max(
    0,
    Number(
      getPriceByTier(
        Number(option.price),
        option.price_vip == null ? null : Number(option.price_vip),
        option.price_walkin == null ? null : Number(option.price_walkin),
        getEffectiveUserTier(user.user_tier ?? "normal", user.tier_expires_at)
      ) ?? 0
    )
  );
}

function allocateLinePrice(total: number, quantity: number, index: number): number {
  if (quantity <= 1) return roundCurrency(total);
  if (index < quantity - 1) return roundCurrency(total / quantity);
  const previous = roundCurrency(total / quantity) * (quantity - 1);
  return roundCurrency(total - previous);
}

export function createStorefrontBundleFingerprint(payload: StorefrontBundlePayload): string {
  const canonical = JSON.stringify({
    purchaseOptionId: payload.purchaseOptionId,
    quantity: payload.quantity,
    typeId: payload.typeId,
    giftTypeId: payload.giftTypeId ?? null,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

async function findExistingRequest(
  siteId: string,
  buyerUserId: string,
  idempotencyKey: string
): Promise<StorefrontRequestRow | null> {
  const [rows] = await pool.execute<StorefrontRequestRow[]>(
    `SELECT *
     FROM storefront_purchase_requests
     WHERE site_id = ? AND buyer_user_id = ? AND idempotency_key = ?
     LIMIT 1`,
    [siteId, buyerUserId, idempotencyKey]
  );
  return rows[0] ?? null;
}

function decideExistingRequest(
  row: StorefrontRequestRow,
  fingerprint: string
): ExistingDecision {
  if (row.request_fingerprint !== fingerprint) return { kind: "conflict" };
  if ((row.status === "SUCCEEDED" || row.status === "FAILED") && row.response_status) {
    const body = parseSavedResponse(row.saved_response);
    if (body) return { kind: "replay", status: row.response_status, body };
  }
  return { kind: "processing" };
}

export async function claimStorefrontBundlePurchase(input: {
  siteId: string;
  buyerUserId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  payload: StorefrontBundlePayload;
}): Promise<ClaimResult> {
  const requestId = randomUUID();
  const processingToken = randomUUID();
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + 10 * 60_000);

  try {
    await pool.execute(
      `INSERT INTO storefront_purchase_requests (
         id, site_id, buyer_user_id, idempotency_key, request_fingerprint,
         product_id, product_type_id, purchase_option_id, quantity, status,
         processing_token, lease_expires_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, 'PROCESSING', ?, ?, ?, ?)`,
      [
        requestId,
        input.siteId,
        input.buyerUserId,
        input.idempotencyKey,
        input.requestFingerprint,
        input.payload.typeId,
        input.payload.purchaseOptionId,
        input.payload.quantity,
        processingToken,
        leaseExpiresAt,
        now,
        now,
      ]
    );
    return { kind: "claimed", requestId, processingToken };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const existing = await findExistingRequest(
      input.siteId,
      input.buyerUserId,
      input.idempotencyKey
    );
    if (!existing) return { kind: "existing", decision: { kind: "processing" } };
    return {
      kind: "existing",
      decision: decideExistingRequest(existing, input.requestFingerprint),
    };
  }
}

export async function waitForStorefrontBundlePurchase(input: {
  siteId: string;
  buyerUserId: string;
  idempotencyKey: string;
  requestFingerprint: string;
}): Promise<StorefrontBundleResult> {
  const deadline = Date.now() + PROCESSING_WAIT_MS;
  while (Date.now() < deadline) {
    const existing = await findExistingRequest(
      input.siteId,
      input.buyerUserId,
      input.idempotencyKey
    );
    if (!existing) return processingResult();
    const decision = decideExistingRequest(existing, input.requestFingerprint);
    if (decision.kind === "conflict") {
      return errorResult(409, "Idempotency key was already used with a different payload.");
    }
    if (decision.kind === "replay") {
      return { status: decision.status, body: decision.body, replayed: true };
    }
    await new Promise((resolve) => setTimeout(resolve, PROCESSING_POLL_MS));
  }
  return processingResult();
}

async function lockRequest(
  connection: PoolConnection,
  requestId: string,
  processingToken: string
): Promise<StorefrontRequestRow | null> {
  const [rows] = await connection.execute<StorefrontRequestRow[]>(
    `SELECT *
     FROM storefront_purchase_requests
     WHERE id = ? AND processing_token = ?
     LIMIT 1
     FOR UPDATE`,
    [requestId, processingToken]
  );
  return rows[0] ?? null;
}

async function lockUser(
  connection: PoolConnection,
  userId: string,
  siteId: string
): Promise<LockedUserRow | null> {
  const [rows] = await connection.execute<LockedUserRow[]>(
    `SELECT id, email, display_name, is_active, is_admin, role, user_tier, tier_expires_at, is_banned, points
     FROM users
     WHERE id = ? AND site_id = ?
     LIMIT 1
     FOR UPDATE`,
    [userId, siteId]
  );
  return rows[0] ?? null;
}

async function lockProduct(
  connection: PoolConnection,
  typeId: string,
  siteId: string
): Promise<LockedProductRow | null> {
  const [rows] = await connection.execute<LockedProductRow[]>(
    `SELECT p.*,
       (
         SELECT spp.retail_price
         FROM site_product_prices spp
         WHERE spp.product_id = p.id AND spp.site_id = ?
         LIMIT 1
       ) AS site_retail_price
     FROM products p
     WHERE p.type_id = ?
       AND p.is_published = 1
       AND (p.is_local = 0 OR (p.is_local = 1 AND p.site_id = ?))
     LIMIT 1
     FOR UPDATE`,
    [siteId, typeId, siteId]
  );
  return rows[0] ?? null;
}

async function markFailedAfterRollback(
  requestId: string,
  processingToken: string,
  status: number,
  message: string
): Promise<StorefrontBundleResult> {
  const body: StorefrontBundleErrorBody = { ok: false, message };
  const serialized = JSON.stringify(body);
  await pool.execute(
    `UPDATE storefront_purchase_requests
     SET status = 'FAILED', response_status = ?, saved_response = ?,
         lease_expires_at = NULL, updated_at = ?
     WHERE id = ? AND processing_token = ? AND status = 'PROCESSING'`,
    [status, serialized, new Date(), requestId, processingToken]
  );
  return { status, body };
}

async function completeExpectedFailure(
  connection: PoolConnection,
  requestId: string,
  status: number,
  message: string
): Promise<StorefrontBundleResult> {
  const result = errorResult(status, message);
  const serialized = JSON.stringify(result.body);
  await connection.execute(
    `UPDATE storefront_purchase_requests
     SET status = 'FAILED', response_status = ?, saved_response = ?,
         lease_expires_at = NULL, updated_at = ?
     WHERE id = ?`,
    [status, serialized, new Date(), requestId]
  );
  await connection.commit();
  return result;
}

async function insertOrder(
  connection: PoolConnection,
  input: {
    requestId: string;
    itemIndex: number;
    product: LockedProductRow;
    user: LockedUserRow;
    option: ReturnType<typeof purchaseOptionRowToPublic>;
    account: StockAccount;
    linePrice: number;
    totalPrice: number;
  }
): Promise<StorefrontBundleOrder> {
  const orderId = randomUUID();
  const details = accountDetails(input.account);
  const costPrice = Number(input.product.cost_price ?? 0);
  const profit = roundCurrency(input.linePrice - costPrice);
  const purchaseDate = new Date();

  await connection.execute(
    `INSERT INTO orders (
       id, purchase_request_id, purchase_item_index, purchase_option_id,
       purchase_option_name, purchase_option_quantity, external_uid,
       product_type_id, product_name, product_image, product_details,
       price, type_menu, purchase_date, username_buy, buyer_user_id,
       raw_response, created_at, cost_price, profit, buyer_email,
       buyer_display_name, api_provider_id, account_email, account_password,
       site_id, is_local
     ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orderId,
      input.requestId,
      input.itemIndex,
      input.option.id,
      input.option.name,
      input.option.quantity,
      input.product.type_id,
      input.product.name,
      input.product.image_url,
      details,
      input.linePrice,
      input.product.type_menu,
      purchaseDate,
      input.user.display_name || input.user.email,
      input.user.id,
      JSON.stringify({
        name: input.product.name || input.product.type_id,
        imageapi: input.product.image_url,
        textdb: details,
        point: input.linePrice,
        date: purchaseDate.toISOString(),
        purchaseOptionId: input.option.id,
        purchaseOptionName: input.option.name,
        purchaseOptionQuantity: input.option.quantity,
        packageTotal: input.totalPrice,
      }),
      purchaseDate,
      costPrice,
      profit,
      input.user.email,
      input.user.display_name || input.user.email,
      null,
      input.account.email || null,
      input.account.password || null,
      getSiteId(),
      input.product.is_local ? 1 : 0,
    ]
  );

  return {
    id: orderId,
    productName: input.product.name || input.product.type_id,
    productDetails: details,
    accountEmail: input.account.email || null,
    accountPassword: input.account.password || null,
    price: input.linePrice,
    purchaseDate: purchaseDate.toISOString(),
    purchaseOptionId: input.option.id,
    purchaseOptionName: input.option.name,
    purchaseOptionQuantity: input.option.quantity,
  };
}

export async function executeStorefrontBundlePurchase(input: {
  requestId: string;
  processingToken: string;
  user: PublicUser;
  payload: StorefrontBundlePayload;
}): Promise<StorefrontBundleResult> {
  const connection = await pool.getConnection();
  const siteId = getSiteId();

  try {
    await connection.beginTransaction();
    const requestRow = await lockRequest(
      connection,
      input.requestId,
      input.processingToken
    );
    if (!requestRow || requestRow.status !== "PROCESSING") {
      await connection.rollback();
      return processingResult();
    }

    if (input.payload.giftTypeId) {
      return completeExpectedFailure(
        connection,
        input.requestId,
        409,
        "แพ็กเกจซื้อหลายชิ้นยังไม่รองรับการเลือกของแถม กรุณาซื้อแบบปกติ"
      );
    }

    const user = await lockUser(connection, input.user.id, siteId);
    if (!user || user.is_active === 0 || user.is_active === false || user.is_banned === 1 || user.is_banned === true) {
      return completeExpectedFailure(connection, input.requestId, 401, "Buyer account is unavailable.");
    }

    const product = await lockProduct(connection, input.payload.typeId, siteId);
    if (!product || product.price == null) {
      return completeExpectedFailure(connection, input.requestId, 400, "Product was not found or has no sale price.");
    }
    if (product.api_provider_id) {
      return completeExpectedFailure(
        connection,
        input.requestId,
        409,
        "แพ็กเกจนี้ยังไม่รองรับสินค้าที่ส่งมอบผ่าน API Provider"
      );
    }

    const optionRow = await lockPurchaseOptionForProduct(connection, {
      typeId: input.payload.typeId,
      optionId: input.payload.purchaseOptionId,
      siteId,
    });
    if (!optionRow || optionRow.product_id !== product.id) {
      return completeExpectedFailure(connection, input.requestId, 404, "Purchase option was not found.");
    }

    const option = purchaseOptionRowToPublic(optionRow);
    if (input.payload.quantity !== option.quantity) {
      return completeExpectedFailure(
        connection,
        input.requestId,
        409,
        "Purchase option quantity does not match the request."
      );
    }

    const totalPrice = optionPrice(optionRow, user);
    if (!Number.isFinite(totalPrice) || totalPrice < 0) {
      return completeExpectedFailure(connection, input.requestId, 400, "Purchase option price is invalid.");
    }

    const inventory = getAccountInventory(product);
    const quantity = option.quantity;
    const effectiveStock = inventory.length > 0
      ? inventory.length
      : Number(product.stock ?? 0);
    if (!Number.isFinite(effectiveStock) || effectiveStock < quantity) {
      return completeExpectedFailure(
        connection,
        input.requestId,
        400,
        `แพ็กเกจนี้ต้องใช้ Stock ${quantity} ชิ้น แต่มีเหลือ ${Math.max(0, Math.trunc(effectiveStock || 0))} ชิ้น`
      );
    }

    const currentPoints = Number(user.points ?? 0);
    if (!Number.isFinite(currentPoints) || currentPoints < totalPrice) {
      return completeExpectedFailure(connection, input.requestId, 400, "Buyer balance is insufficient.");
    }

    let deliveredAccounts: StockAccount[];
    if (inventory.length > 0) {
      deliveredAccounts = inventory.slice(0, quantity);
      const remainingAccounts = inventory.slice(quantity);
      await connection.execute(
        `UPDATE products
         SET account_data = ?, stock = ?, updated_at = ?
         WHERE id = ?`,
        [JSON.stringify(remainingAccounts), remainingAccounts.length, new Date(), product.id]
      );
    } else if (product.account_email || product.account_password) {
      const staticAccount: StockAccount = {
        email: product.account_email || undefined,
        password: product.account_password || undefined,
        details: product.details || undefined,
      };
      deliveredAccounts = Array.from({ length: quantity }, () => ({ ...staticAccount }));
      const [stockUpdate] = await connection.execute<ResultSetHeader>(
        `UPDATE products
         SET stock = stock - ?, updated_at = ?
         WHERE id = ? AND stock >= ?`,
        [quantity, new Date(), product.id, quantity]
      );
      if (stockUpdate.affectedRows !== 1) {
        await connection.rollback();
        return markFailedAfterRollback(
          input.requestId,
          input.processingToken,
          409,
          "Stock changed while processing the purchase."
        );
      }
    } else {
      return completeExpectedFailure(connection, input.requestId, 400, "Product has no deliverable account data.");
    }

    const [balanceUpdate] = await connection.execute<ResultSetHeader>(
      `UPDATE users
       SET points = points - ?, updated_at = ?
       WHERE id = ? AND points >= ?`,
      [totalPrice, new Date(), user.id, totalPrice]
    );
    if (balanceUpdate.affectedRows !== 1) {
      await connection.rollback();
      return markFailedAfterRollback(
        input.requestId,
        input.processingToken,
        409,
        "Balance changed while processing the purchase."
      );
    }

    const orders: StorefrontBundleOrder[] = [];
    for (let index = 0; index < deliveredAccounts.length; index += 1) {
      orders.push(
        await insertOrder(connection, {
          requestId: input.requestId,
          itemIndex: index,
          product,
          user,
          option,
          account: deliveredAccounts[index],
          linePrice: allocateLinePrice(totalPrice, deliveredAccounts.length, index),
          totalPrice,
        })
      );
    }

    const remainingPoints = roundCurrency(currentPoints - totalPrice);
    const body: StorefrontBundleSuccessBody = {
      ok: true,
      message: `ซื้อแพ็กเกจ ${option.name} สำเร็จ`,
      order: orders.length > 1 ? orders : orders[0],
      orders,
      orderId: orders[0].id,
      points: remainingPoints,
      quantity,
      purchaseOption: {
        id: option.id,
        name: option.name,
        quantity,
        totalPrice,
      },
    };

    const serialized = JSON.stringify(body);
    await connection.execute(
      `UPDATE storefront_purchase_requests
       SET product_id = ?, status = 'SUCCEEDED', order_id = ?, response_status = 200,
           saved_response = ?, lease_expires_at = NULL, updated_at = ?
       WHERE id = ?`,
      [product.id, orders[0].id, serialized, new Date(), input.requestId]
    );
    await connection.commit();
    return { status: 200, body };
  } catch {
    await connection.rollback();
    const body: StorefrontBundleErrorBody = {
      ok: false,
      message: "ไม่สามารถดำเนินการซื้อแพ็กเกจได้ กรุณาลองใหม่ด้วยคำขอเดิม",
    };
    const serialized = JSON.stringify(body);
    await pool.execute(
      `UPDATE storefront_purchase_requests
       SET status = 'FAILED', response_status = 500, saved_response = ?,
           lease_expires_at = NULL, updated_at = ?
       WHERE id = ? AND processing_token = ? AND status = 'PROCESSING'`,
      [serialized, new Date(), input.requestId, input.processingToken]
    );
    return { status: 500, body };
  } finally {
    connection.release();
  }
}
