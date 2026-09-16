import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { randomUUID } from "crypto";

import pool from "@/lib/mysql";
import { getSiteId } from "@/lib/site";
import { createPurchaseFingerprint } from "@/lib/purchases/idempotency";
import { createCompletedCaseFromOrderIds } from "@/lib/purchase-cases/repository";
import {
  getAppByMariProductRowById,
  getAppByMariProductRowForPurchase,
  type AppByMariProductRow,
} from "./repository";
import {
  buyAppByMariProduct,
  getAppByMariProvider,
  AppByMariApiError,
} from "./client";
import {
  parseAppByMariStorefrontTypeId,
  toAppByMariStorefrontTypeId,
  type AppByMariPurchaseBody,
  type AppByMariPurchaseDelivery,
  type AppByMariPurchaseErrorBody,
  type AppByMariPurchaseResult,
} from "./types";

const PROCESSING_LEASE_MS = 5 * 60_000;

type PurchaseRequestRow = RowDataPacket & {
  id: string;
  site_id: string;
  buyer_user_id: string;
  idempotency_key: string;
  request_fingerprint: string;
  source_type_id: string;
  product_id: string | null;
  quantity: number | string;
  unit_price: number | string | null;
  reserved_amount: number | string | null;
  status: "PROCESSING" | "SUCCEEDED" | "FAILED";
  processing_stage: string;
  processing_token: string;
  lease_expires_at: Date | string | null;
  upstream_order_id: string | null;
  upstream_payload: string | null;
  response_status: number | null;
  saved_response: string | null;
};

type UserRow = RowDataPacket & {
  id: string;
  email: string | null;
  display_name: string | null;
  is_active: number | boolean;
  is_banned: number | boolean;
  points: number | string | null;
};

type PurchaseOrder = {
  id: string;
  productName: string;
  productDetails: string | null;
  accountEmail: string | null;
  accountPassword: string | null;
  price: number;
  purchaseDate: string;
};

type ReservedPurchase = {
  request: PurchaseRequestRow;
  product: AppByMariProductRow;
  user: UserRow;
  unitPrice: number;
  deliveries: AppByMariPurchaseDelivery[];
};

type ExistingDecision =
  | { kind: "conflict" }
  | { kind: "processing" }
  | { kind: "replay"; status: number; body: AppByMariPurchaseBody | AppByMariPurchaseErrorBody };

function asNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY";
}

function errorCode(error: unknown): string {
  if (error instanceof AppByMariApiError) return `api_${error.status}`;
  if (typeof error === "object" && error !== null && "code" in error) return String(error.code);
  return "UNKNOWN";
}

function processingResult(): AppByMariPurchaseResult {
  return {
    status: 202,
    body: {
      ok: false,
      message: "ระบบกำลังยืนยันการสั่งซื้อกับร้านหลัก กรุณาลองใหม่ด้วยคำขอเดิม",
      retryable: true,
      status: "PROCESSING",
    },
  };
}

function failureResult(status: number, message: string, retryable = false): AppByMariPurchaseResult {
  const body: AppByMariPurchaseErrorBody = { ok: false, message };
  if (retryable) body.retryable = true;
  return { status, body };
}

function parseSavedResponse(value: string | null): AppByMariPurchaseBody | AppByMariPurchaseErrorBody | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as AppByMariPurchaseBody | AppByMariPurchaseErrorBody;
    return parsed && typeof parsed === "object" && "ok" in parsed ? parsed : null;
  } catch {
    return null;
  }
}

function decideExisting(row: PurchaseRequestRow, fingerprint: string): ExistingDecision {
  if (row.request_fingerprint && row.request_fingerprint !== fingerprint) {
    return { kind: "conflict" };
  }
  const body = parseSavedResponse(row.saved_response);
  if ((row.status === "SUCCEEDED" || row.status === "FAILED") && body && row.response_status) {
    return { kind: "replay", status: row.response_status, body };
  }
  return { kind: "processing" };
}

async function findRequest(siteId: string, buyerUserId: string, idempotencyKey: string): Promise<PurchaseRequestRow | null> {
  const [rows] = await pool.execute<PurchaseRequestRow[]>(
    `SELECT * FROM appbymari_purchase_requests
     WHERE site_id = ? AND buyer_user_id = ? AND idempotency_key = ?
     LIMIT 1`,
    [siteId, buyerUserId, idempotencyKey],
  );
  return rows[0] ?? null;
}

async function claimRequest(input: {
  siteId: string;
  buyerUserId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  sourceTypeId: string;
  quantity: number;
}): Promise<
  | { kind: "claimed"; requestId: string; processingToken: string }
  | { kind: "existing"; decision: ExistingDecision }
> {
  const requestId = randomUUID();
  const processingToken = randomUUID();
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + PROCESSING_LEASE_MS);

  try {
    await pool.execute(
      `INSERT INTO appbymari_purchase_requests (
         id, site_id, buyer_user_id, idempotency_key, request_fingerprint,
         source_type_id, quantity, status, processing_stage, processing_token,
         lease_expires_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PROCESSING', 'CLAIMED', ?, ?, ?, ?)`,
      [
        requestId,
        input.siteId,
        input.buyerUserId,
        input.idempotencyKey,
        input.requestFingerprint,
        input.sourceTypeId,
        input.quantity,
        processingToken,
        leaseExpiresAt,
        now,
        now,
      ],
    );
    return { kind: "claimed", requestId, processingToken };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const existing = await findRequest(input.siteId, input.buyerUserId, input.idempotencyKey);
    if (!existing) return { kind: "existing", decision: { kind: "processing" } };

    const decision = decideExisting(existing, input.requestFingerprint);
    if (decision.kind !== "processing") {
      return { kind: "existing", decision };
    }

    const leaseExpired = !existing.lease_expires_at || new Date(existing.lease_expires_at).getTime() <= Date.now();
    const canRecover = existing.status === "PROCESSING" && (
      existing.processing_stage === "RECONCILIATION_REQUIRED" || leaseExpired
    );
    if (canRecover) {
      const [updated] = await pool.execute<ResultSetHeader>(
        `UPDATE appbymari_purchase_requests
         SET processing_token = ?, lease_expires_at = ?, updated_at = ?
         WHERE id = ? AND status = 'PROCESSING'
           AND (processing_stage = 'RECONCILIATION_REQUIRED' OR lease_expires_at IS NULL OR lease_expires_at <= NOW(6))`,
        [processingToken, leaseExpiresAt, now, existing.id],
      );
      if (updated.affectedRows === 1) {
        return { kind: "claimed", requestId: existing.id, processingToken };
      }
    }
    return { kind: "existing", decision: { kind: "processing" } };
  }
}

async function lockRequest(
  connection: PoolConnection,
  requestId: string,
  processingToken: string,
): Promise<PurchaseRequestRow | null> {
  const [rows] = await connection.execute<PurchaseRequestRow[]>(
    `SELECT * FROM appbymari_purchase_requests
     WHERE id = ? AND processing_token = ?
     LIMIT 1 FOR UPDATE`,
    [requestId, processingToken],
  );
  return rows[0] ?? null;
}

async function lockUser(connection: PoolConnection, userId: string): Promise<UserRow | null> {
  const [rows] = await connection.execute<UserRow[]>(
    `SELECT id, email, display_name, is_active, is_banned, points
     FROM users WHERE id = ? AND site_id = ? LIMIT 1 FOR UPDATE`,
    [userId, getSiteId()],
  );
  return rows[0] ?? null;
}

function responseOrder(input: {
  id: string;
  productName: string;
  details: string | null;
  email: string | null;
  password: string | null;
  price: number;
  date: string;
}): PurchaseOrder {
  return {
    id: input.id,
    productName: input.productName,
    productDetails: input.details,
    accountEmail: input.email,
    accountPassword: input.password,
    price: input.price,
    purchaseDate: input.date,
  };
}

function accountDetails(value: Record<string, unknown>): string | null {
  const details = typeof value.details === "string" ? value.details.trim() : "";
  if (details) return details;
  const email = typeof value.email === "string" ? value.email.trim() : "";
  const password = typeof value.password === "string" ? value.password.trim() : "";
  const parts = [email ? `Email: ${email}` : "", password ? `Pass: ${password}` : ""].filter(Boolean);
  return parts.length > 0 ? parts.join("\n") : null;
}

function normalizeDeliveries(input: {
  accountData: unknown;
  productName: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  remoteOrderId: string | null;
}): AppByMariPurchaseDelivery[] | null {
  const raw = Array.isArray(input.accountData)
    ? input.accountData
    : input.accountData && typeof input.accountData === "object"
      ? [input.accountData]
      : typeof input.accountData === "string" && input.accountData.trim()
        ? [{ details: input.accountData.trim() }]
        : [];
  if (raw.length !== input.quantity) return null;

  return raw.map((value) => {
    const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const email = typeof record.email === "string" && record.email.trim() ? record.email.trim() : null;
    const password = typeof record.password === "string" && record.password.trim() ? record.password.trim() : null;
    return {
      uid: input.remoteOrderId,
      name: input.productName,
      imageapi: input.imageUrl,
      textdb: accountDetails(record),
      point: input.unitPrice,
      date: new Date().toISOString(),
      accountEmail: email,
      accountPassword: password,
    };
  });
}

async function saveFailure(
  connection: PoolConnection,
  requestId: string,
  status: number,
  body: AppByMariPurchaseErrorBody,
): Promise<void> {
  const serialized = JSON.stringify(body);
  await connection.execute(
    `UPDATE appbymari_purchase_requests
     SET status = 'FAILED', processing_stage = 'FAILED', response_status = ?,
         saved_response = ?, lease_expires_at = NULL, updated_at = ?
     WHERE id = ? AND status = 'PROCESSING'`,
    [status, serialized, new Date(), requestId],
  );
}

async function failClaimedRequest(input: {
  requestId: string;
  processingToken: string;
  status: number;
  message: string;
}): Promise<AppByMariPurchaseResult> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const request = await lockRequest(connection, input.requestId, input.processingToken);
    if (!request || request.status !== "PROCESSING") {
      await connection.rollback();
      return processingResult();
    }
    const result = failureResult(input.status, input.message);
    await saveFailure(connection, input.requestId, result.status, result.body as AppByMariPurchaseErrorBody);
    await connection.commit();
    return result;
  } catch {
    await connection.rollback();
    return failureResult(500, "ไม่สามารถตรวจสอบการเชื่อมต่อร้านหลักได้ กรุณาลองใหม่");
  } finally {
    connection.release();
  }
}

async function reservePurchase(input: {
  requestId: string;
  processingToken: string;
  buyerUserId: string;
  sourceTypeId: string;
  quantity: number;
}): Promise<ReservedPurchase | AppByMariPurchaseResult> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const request = await lockRequest(connection, input.requestId, input.processingToken);
    if (!request || request.status !== "PROCESSING") {
      await connection.rollback();
      return processingResult();
    }

    const user = await lockUser(connection, input.buyerUserId);
    if (!user || user.is_active === 0 || user.is_active === false || user.is_banned === 1 || user.is_banned === true) {
      const result = failureResult(401, "ไม่พบบัญชีผู้ใช้หรือบัญชีไม่พร้อมใช้งาน");
      await saveFailure(connection, request.id, result.status, result.body as AppByMariPurchaseErrorBody);
      await connection.commit();
      return result;
    }

    if (request.processing_stage !== "CLAIMED" && request.product_id && request.reserved_amount != null) {
      const product = await getAppByMariProductRowById({
        id: request.product_id,
        siteId: getSiteId(),
        connection,
        lock: true,
      });
      if (!product) {
        await connection.rollback();
        return processingResult();
      }
      await connection.commit();
      return {
        request,
        product,
        user,
        unitPrice: Math.max(0, asNumber(request.unit_price)),
        deliveries: parseDeliveries(request.upstream_payload),
      };
    }

    const product = await getAppByMariProductRowForPurchase({
      sourceTypeId: input.sourceTypeId,
      siteId: getSiteId(),
      connection,
      lock: true,
    });
    if (!product) {
      const result = failureResult(400, "ไม่พบสินค้า หรือสินค้านี้ถูกปิดการแสดงผล");
      await saveFailure(connection, request.id, result.status, result.body as AppByMariPurchaseErrorBody);
      await connection.commit();
      return result;
    }

    const unitPrice = Math.max(0, asNumber(product.sale_price, NaN));
    if (!Number.isFinite(unitPrice)) {
      const result = failureResult(400, "สินค้านี้ยังไม่ได้กำหนดราคาขาย");
      await saveFailure(connection, request.id, result.status, result.body as AppByMariPurchaseErrorBody);
      await connection.commit();
      return result;
    }

    const availableStock = Math.max(0, Math.trunc(asNumber(product.stock) - asNumber(product.reserved_stock)));
    if (availableStock < input.quantity) {
      const result = failureResult(400, `สินค้านี้มีสต็อกไม่เพียงพอ (เหลือ ${availableStock} ชิ้น)`);
      await saveFailure(connection, request.id, result.status, result.body as AppByMariPurchaseErrorBody);
      await connection.commit();
      return result;
    }

    const totalPrice = roundCurrency(unitPrice * input.quantity);
    const currentPoints = Math.max(0, asNumber(user.points));
    if (currentPoints < totalPrice) {
      const result = failureResult(400, `พ้อยท์ของคุณไม่เพียงพอ (ต้องการ ${totalPrice.toLocaleString("th-TH")} พ้อยท์)`);
      await saveFailure(connection, request.id, result.status, result.body as AppByMariPurchaseErrorBody);
      await connection.commit();
      return result;
    }

    const [stockReservation] = await connection.execute<ResultSetHeader>(
      `UPDATE appbymari_products
       SET reserved_stock = reserved_stock + ?, updated_at = ?
       WHERE id = ? AND site_id = ? AND is_enabled = 1
         AND stock - reserved_stock >= ?`,
      [input.quantity, new Date(), product.id, getSiteId(), input.quantity],
    );
    if (stockReservation.affectedRows !== 1) {
      await connection.rollback();
      return failureResult(409, "สต็อกสินค้าเปลี่ยนแปลงระหว่างสั่งซื้อ กรุณาลองใหม่");
    }

    const [balanceUpdate] = await connection.execute<ResultSetHeader>(
      `UPDATE users SET points = points - ?, updated_at = ?
       WHERE id = ? AND site_id = ? AND points >= ?`,
      [totalPrice, new Date(), user.id, getSiteId(), totalPrice],
    );
    if (balanceUpdate.affectedRows !== 1) {
      await connection.rollback();
      return failureResult(409, "ยอดพ้อยท์เปลี่ยนแปลงระหว่างสั่งซื้อ กรุณาลองใหม่");
    }

    await connection.execute(
      `UPDATE appbymari_purchase_requests
       SET product_id = ?, unit_price = ?, reserved_amount = ?,
           processing_stage = 'RESERVED', lease_expires_at = ?, updated_at = ?
       WHERE id = ? AND processing_token = ?`,
      [
        product.id,
        unitPrice,
        totalPrice,
        new Date(Date.now() + 10 * 60_000),
        new Date(),
        request.id,
        input.processingToken,
      ],
    );
    await connection.commit();
    return { request, product, user, unitPrice, deliveries: [] };
  } catch (error) {
    await connection.rollback();
    console.error("[AppByMari] reserve purchase failed", { requestId: input.requestId, code: errorCode(error) });
    return failureResult(500, "ไม่สามารถเตรียมการสั่งซื้อได้ กรุณาลองใหม่", true);
  } finally {
    connection.release();
  }
}

function parseDeliveries(value: string | null): AppByMariPurchaseDelivery[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is AppByMariPurchaseDelivery => Boolean(item && typeof item === "object"));
  } catch {
    return [];
  }
}

async function saveUpstreamProgress(input: {
  requestId: string;
  processingToken: string;
  remoteOrderId: string | null;
  deliveries: AppByMariPurchaseDelivery[];
}): Promise<void> {
  await pool.execute(
    `UPDATE appbymari_purchase_requests
     SET processing_stage = 'FULFILLING', upstream_order_id = ?, upstream_payload = ?,
         lease_expires_at = ?, updated_at = ?
     WHERE id = ? AND processing_token = ? AND status = 'PROCESSING'`,
    [
      input.remoteOrderId,
      JSON.stringify(input.deliveries),
      new Date(Date.now() + 10 * 60_000),
      new Date(),
      input.requestId,
      input.processingToken,
    ],
  );
}

async function markReconciliationRequired(requestId: string, processingToken: string): Promise<void> {
  await pool.execute(
    `UPDATE appbymari_purchase_requests
     SET processing_stage = 'RECONCILIATION_REQUIRED', lease_expires_at = NULL, updated_at = ?
     WHERE id = ? AND processing_token = ? AND status = 'PROCESSING'`,
    [new Date(), requestId, processingToken],
  );
}

async function releaseReservation(input: {
  requestId: string;
  processingToken: string;
  message: string;
  status: number;
}): Promise<AppByMariPurchaseResult> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const request = await lockRequest(connection, input.requestId, input.processingToken);
    if (!request || request.status !== "PROCESSING") {
      await connection.rollback();
      return processingResult();
    }
    const amount = Math.max(0, asNumber(request.reserved_amount));
    const quantity = Math.max(0, Math.trunc(asNumber(request.quantity)));
    if (request.product_id && quantity > 0) {
      await connection.execute(
        `UPDATE appbymari_products
         SET reserved_stock = GREATEST(0, reserved_stock - ?), updated_at = ?
         WHERE id = ? AND site_id = ?`,
        [quantity, new Date(), request.product_id, getSiteId()],
      );
    }
    if (amount > 0) {
      await connection.execute(
        `UPDATE users SET points = points + ?, updated_at = ?
         WHERE id = ? AND site_id = ?`,
        [amount, new Date(), request.buyer_user_id, getSiteId()],
      );
    }
    const result = failureResult(input.status, input.message);
    await saveFailure(connection, request.id, result.status, result.body as AppByMariPurchaseErrorBody);
    await connection.commit();
    return result;
  } catch {
    await connection.rollback();
    return processingResult();
  } finally {
    connection.release();
  }
}

async function insertOrder(
  connection: PoolConnection,
  input: {
    requestId: string;
    itemIndex: number;
    product: AppByMariProductRow;
    user: UserRow;
    delivery: AppByMariPurchaseDelivery;
    unitPrice: number;
  },
): Promise<PurchaseOrder> {
  const id = randomUUID();
  const date = input.delivery.date ? new Date(input.delivery.date) : new Date();
  const costPrice = Math.max(0, asNumber(input.product.cost_price));
  const safeDelivery = {
    uid: input.delivery.uid ?? null,
    name: input.delivery.name,
    imageapi: input.delivery.imageapi,
    textdb: input.delivery.textdb,
    point: input.unitPrice,
    date: date.toISOString(),
  };
  await connection.execute(
    `INSERT INTO orders (
       id, purchase_request_id, purchase_item_index, external_uid,
       product_type_id, product_name, product_image, product_details,
       price, type_menu, purchase_date, username_buy, buyer_user_id,
       raw_response, created_at, cost_price, profit, buyer_email,
       buyer_display_name, api_provider_id, account_email, account_password,
       site_id, is_local
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
    [
      id,
      input.requestId,
      input.itemIndex,
      input.delivery.uid ?? null,
      toAppByMariStorefrontTypeId(input.product.source_type_id),
      input.delivery.name || input.product.name,
      input.delivery.imageapi || input.product.image_url,
      input.delivery.textdb,
      input.unitPrice,
      input.product.category_name,
      date,
      input.user.display_name || input.user.email || input.user.id,
      input.user.id,
      JSON.stringify(safeDelivery),
      new Date(),
      costPrice,
      roundCurrency(input.unitPrice - costPrice),
      input.user.email,
      input.user.display_name,
      input.product.api_provider_id,
      input.delivery.accountEmail,
      input.delivery.accountPassword,
      getSiteId(),
      0,
    ],
  );
  return responseOrder({
    id,
    productName: input.delivery.name || input.product.name,
    details: input.delivery.textdb,
    email: input.delivery.accountEmail,
    password: input.delivery.accountPassword,
    price: input.unitPrice,
    date: date.toISOString(),
  });
}

async function finalizePurchase(input: {
  requestId: string;
  processingToken: string;
  reserved: ReservedPurchase;
  deliveries: AppByMariPurchaseDelivery[];
  remoteOrderId: string | null;
  fallbackRemainingStock: number;
}): Promise<AppByMariPurchaseResult & { orderIds?: string[] }> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const request = await lockRequest(connection, input.requestId, input.processingToken);
    if (!request) {
      await connection.rollback();
      return processingResult();
    }
    if (request.status === "SUCCEEDED" || request.status === "FAILED") {
      const body = parseSavedResponse(request.saved_response);
      await connection.rollback();
      return body && request.response_status
        ? { status: request.response_status, body, orderIds: [] }
        : processingResult();
    }

    const product = request.product_id
      ? await getAppByMariProductRowById({ id: request.product_id, siteId: getSiteId(), connection, lock: true })
      : null;
    const user = await lockUser(connection, request.buyer_user_id);
    if (!product || !user) {
      await connection.rollback();
      return processingResult();
    }
    const deliveries = input.deliveries.length > 0 ? input.deliveries : parseDeliveries(request.upstream_payload);
    if (deliveries.length !== Number(request.quantity)) {
      await connection.rollback();
      return processingResult();
    }

    const orders: PurchaseOrder[] = [];
    for (let index = 0; index < deliveries.length; index += 1) {
      orders.push(await insertOrder(connection, {
        requestId: request.id,
        itemIndex: index,
        product,
        user,
        delivery: deliveries[index],
        unitPrice: Math.max(0, asNumber(request.unit_price)),
      }));
    }

    const remainingStock = Math.max(0, Math.trunc(input.fallbackRemainingStock));
    await connection.execute(
      `UPDATE appbymari_products
       SET stock = ?, reserved_stock = GREATEST(0, reserved_stock - ?), updated_at = ?
       WHERE id = ? AND site_id = ?`,
      [remainingStock, Number(request.quantity), new Date(), product.id, getSiteId()],
    );

    const body: AppByMariPurchaseBody = {
      ok: true,
      message: orders.length > 1 ? `สั่งซื้อสินค้าสำเร็จ ${orders.length} ชิ้น` : "สั่งซื้อสินค้าสำเร็จ",
      order: orders.length === 1 ? orders[0] : orders,
      orders,
      points: Math.max(0, asNumber(user.points)),
      quantity: orders.length,
    };
    const serialized = JSON.stringify(body);
    await connection.execute(
      `UPDATE appbymari_purchase_requests
       SET status = 'SUCCEEDED', processing_stage = 'SUCCEEDED',
           upstream_order_id = COALESCE(?, upstream_order_id), response_status = 200,
           saved_response = ?, lease_expires_at = NULL, updated_at = ?
       WHERE id = ? AND status = 'PROCESSING'`,
      [input.remoteOrderId, serialized, new Date(), request.id],
    );
    await connection.commit();
    return { status: 200, body, orderIds: orders.map((order) => order.id) };
  } catch (error) {
    await connection.rollback();
    await markReconciliationRequired(input.requestId, input.processingToken);
    console.error("[AppByMari] finalization needs reconciliation", { requestId: input.requestId, code: errorCode(error) });
    return processingResult();
  } finally {
    connection.release();
  }
}

async function executeClaim(input: {
  requestId: string;
  processingToken: string;
  buyerUserId: string;
  sourceTypeId: string;
  quantity: number;
}): Promise<AppByMariPurchaseResult & { orderIds?: string[] }> {
  const provider = await getAppByMariProvider();
  if (!provider || !provider.isActive || !provider.apiKey) {
    return failClaimedRequest({
      requestId: input.requestId,
      processingToken: input.processingToken,
      status: 503,
      message: "การเชื่อมต่อร้านหลักยังไม่พร้อมใช้งาน กรุณาให้ผู้ดูแลทดสอบ API key ก่อน",
    });
  }

  const reserved = await reservePurchase(input);
  if (!("request" in reserved)) return reserved;

  let deliveries = reserved.deliveries;
  let remoteOrderId: string | null = reserved.request.upstream_order_id;
  let remainingStock = Math.max(0, Math.trunc(asNumber(reserved.product.stock) - asNumber(reserved.product.reserved_stock)));

  if (deliveries.length === 0) {
    try {
      const remote = await buyAppByMariProduct({
        provider,
        sourceTypeId: input.sourceTypeId,
        quantity: input.quantity,
        idempotencyKey: reserved.request.idempotency_key,
      });
      remoteOrderId = remote.orderId;
      const normalized = normalizeDeliveries({
        accountData: remote.accountData,
        productName: remote.productName || reserved.product.name,
        imageUrl: reserved.product.image_url,
        unitPrice: reserved.unitPrice,
        quantity: input.quantity,
        remoteOrderId,
      });
      if (!normalized) {
        await markReconciliationRequired(input.requestId, input.processingToken);
        return processingResult();
      }
      deliveries = normalized;
      if (remote.remainingStock != null) remainingStock = remote.remainingStock;
      await saveUpstreamProgress({
        requestId: input.requestId,
        processingToken: input.processingToken,
        remoteOrderId,
        deliveries,
      });
    } catch (error) {
      if (error instanceof AppByMariApiError && !error.retryable) {
        return releaseReservation({
          requestId: input.requestId,
          processingToken: input.processingToken,
          status: error.status === 401 || error.status === 403 ? 503 : 400,
          message: error.status === 401 || error.status === 403
            ? "API key ของร้านหลักไม่สามารถใช้งานได้"
            : "ร้านหลักไม่สามารถรับคำสั่งซื้อนี้ได้ สต็อกหรือ Master Point อาจไม่เพียงพอ",
        });
      }
      await markReconciliationRequired(input.requestId, input.processingToken);
      console.error("[AppByMari] upstream outcome needs reconciliation", { requestId: input.requestId, code: errorCode(error) });
      return processingResult();
    }
  }

  return finalizePurchase({
    requestId: input.requestId,
    processingToken: input.processingToken,
    reserved,
    deliveries,
    remoteOrderId,
    fallbackRemainingStock: remainingStock,
  });
}

export async function executeAppByMariStorefrontPurchase(input: {
  buyerUserId: string;
  typeId: string;
  quantity: number;
  idempotencyKey: string;
}): Promise<AppByMariPurchaseResult & { orderIds?: string[]; replayed?: boolean }> {
  const siteId = getSiteId();
  const sourceTypeId = parseAppByMariStorefrontTypeId(input.typeId);
  if (siteId !== "main" || !sourceTypeId) {
    return failureResult(400, "สินค้านี้ไม่ใช่สินค้าจากร้านหลักที่รองรับ");
  }
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100) {
    return failureResult(400, "กรุณาระบุจำนวนสินค้าระหว่าง 1-100 ชิ้น");
  }
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 128) {
    return failureResult(400, "Idempotency-Key ไม่ถูกต้อง");
  }

  const requestFingerprint = createPurchaseFingerprint({ typeId: input.typeId, quantity: input.quantity });
  const claim = await claimRequest({
    siteId,
    buyerUserId: input.buyerUserId,
    idempotencyKey: input.idempotencyKey.trim(),
    requestFingerprint,
    sourceTypeId,
    quantity: input.quantity,
  });

  if (claim.kind === "existing") {
    if (claim.decision.kind === "conflict") {
      return failureResult(409, "Idempotency key ถูกใช้กับข้อมูลการสั่งซื้ออื่นแล้ว");
    }
    if (claim.decision.kind === "replay") {
      return { status: claim.decision.status, body: claim.decision.body, orderIds: [], replayed: true };
    }
    return processingResult();
  }

  return executeClaim({
    requestId: claim.requestId,
    processingToken: claim.processingToken,
    buyerUserId: input.buyerUserId,
    sourceTypeId,
    quantity: input.quantity,
  });
}

export async function attachAppByMariCase(input: {
  buyerUserId: string;
  orderIds: string[];
}) {
  if (input.orderIds.length === 0) return null;
  try {
    return await createCompletedCaseFromOrderIds({
      siteId: getSiteId(),
      buyerUserId: input.buyerUserId,
      orderIds: input.orderIds,
    });
  } catch (error) {
    console.error("[AppByMari] case attachment failed", { code: errorCode(error) });
    return null;
  }
}
