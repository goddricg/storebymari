import { createHash, randomUUID } from "crypto";
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import pool from "@/lib/mysql";
import type { ValidatedApiKey } from "@/lib/auth/api-key";
import { isAdminRole } from "@/lib/auth/roles";
import { getApiProviderById } from "@/lib/api-providers/repository";
import { buyExternalProduct } from "@/lib/products/external";
import {
  getAccountInventory,
  getEffectiveStockFromRecord,
  type StockAccount,
} from "@/lib/products/stock-utils";
import { getSiteId } from "@/lib/site";
import {
  decideExistingPurchase,
  type ExistingPurchaseDecision,
  type PurchasePayload,
} from "@/lib/purchases/idempotency";

const PURCHASE_SCOPE = "MASTER_API";
const PROCESSING_WAIT_MS = 5_000;
const PROCESSING_POLL_MS = 50;

type PurchaseSuccessBody = {
  success: true;
  productName: string;
  accountData: StockAccount[];
  remainingStock: number;
  orderId: string;
};

type PurchaseErrorBody = {
  ok: false;
  message: string;
  retryable?: boolean;
  status?: "PROCESSING";
};

export type MasterPurchaseBody = PurchaseSuccessBody | PurchaseErrorBody;

export type MasterPurchaseResult = {
  status: number;
  body: MasterPurchaseBody;
  replayed?: boolean;
};

type ClaimResult =
  | {
      kind: "claimed";
      requestId: string;
      processingToken: string;
    }
  | {
      kind: "existing";
      decision: ExistingPurchaseDecision;
    };

type PurchaseRequestRow = RowDataPacket & {
  id: string;
  tenant_id: string | null;
  idempotency_key: string;
  request_fingerprint: string | null;
  status: string;
  processing_stage: string | null;
  processing_token: string | null;
  response_status: number | null;
  response_json: string | null;
  saved_response: string | null;
  fulfillment_payload: string | null;
};

type UserRow = RowDataPacket & {
  id: string;
  email: string | null;
  display_name: string | null;
  is_active: number | boolean;
  is_admin: number | boolean;
  role: string | null;
  points: number | string | null;
};

type ProductRow = RowDataPacket & {
  id: string;
  site_id: string | null;
  is_local: number | boolean;
  type_id: string;
  name: string | null;
  image_url: string | null;
  details: string | null;
  price: number | string | null;
  site_retail_price: number | string | null;
  cost_price: number | string | null;
  stock: number | string | null;
  type_menu: string | null;
  account_email: string | null;
  account_password: string | null;
  account_data: unknown;
  api_provider_id: string | null;
};

type ExternalDelivery = {
  uid?: number | null;
  name: string;
  imageapi: string | null;
  textdb: string | null;
  point: number;
  date?: string | null;
};

type ReservedExternalPurchase = {
  product: ProductRow;
  user: UserRow;
  unitPrice: number;
  remainingStock: number;
};

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY"
  );
}

function parseSavedResponse(value: string | null): MasterPurchaseBody | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as MasterPurchaseBody;
  } catch {
    return null;
  }
}

function processingResult(): MasterPurchaseResult {
  return {
    status: 202,
    body: {
      ok: false,
      message: "Purchase is still processing. Retry with the same idempotency key.",
      retryable: true,
      status: "PROCESSING",
    },
  };
}

function errorResult(status: number, message: string): MasterPurchaseResult {
  return {
    status,
    body: { ok: false, message },
  };
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function purchaseUnitPrice(product: ProductRow, user: UserRow): number {
  const isAdmin =
    isAdminRole(user.role) ||
    user.is_admin === 1 ||
    user.is_admin === true;
  const rawPrice = isAdmin
    ? product.price
    : (product.site_retail_price ?? product.price);
  return Math.max(0, Number(rawPrice ?? 0));
}

function accountDetails(account: StockAccount): string | null {
  if (account.details) return account.details;
  const parts = [
    account.email ? `Email: ${account.email}` : "",
    account.password ? `Pass: ${account.password}` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("\n") : null;
}

async function findExistingRequest(
  tenantId: string,
  idempotencyKey: string
): Promise<PurchaseRequestRow | null> {
  const [rows] = await pool.execute<PurchaseRequestRow[]>(
    `SELECT *
     FROM purchase_requests
     WHERE tenant_id = ? AND idempotency_key = ?
     LIMIT 1`,
    [tenantId, idempotencyKey]
  );
  return rows[0] ?? null;
}

export async function claimMasterPurchase(input: {
  auth: ValidatedApiKey;
  idempotencyKey: string;
  requestFingerprint: string;
  payload: PurchasePayload;
}): Promise<ClaimResult> {
  const requestId = randomUUID();
  const processingToken = randomUUID();
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + 5 * 60_000);
  const siteId = getSiteId();

  try {
    await pool.execute(
      `INSERT INTO purchase_requests (
        id, tenant_id, scope, site_id, actor_id, idempotency_key,
        request_fingerprint, product_type_id, quantity, status,
        processing_stage, processing_token, lease_expires_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROCESSING', 'CLAIMED', ?, ?, ?, ?)`,
      [
        requestId,
        input.auth.tenant_id,
        PURCHASE_SCOPE,
        siteId,
        input.auth.user_id,
        input.idempotencyKey,
        input.requestFingerprint,
        input.payload.typeId,
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
      input.auth.tenant_id,
      input.idempotencyKey
    );
    if (!existing) {
      return { kind: "existing", decision: { kind: "processing" } };
    }

    return {
      kind: "existing",
      decision: decideExistingPurchase(
        {
          requestFingerprint: existing.request_fingerprint,
          status: existing.status,
          responseStatus: existing.response_status,
          savedResponse: existing.saved_response ?? existing.response_json,
        },
        input.requestFingerprint
      ),
    };
  }
}

export async function waitForMasterPurchase(input: {
  tenantId: string;
  idempotencyKey: string;
  requestFingerprint: string;
}): Promise<MasterPurchaseResult> {
  const deadline = Date.now() + PROCESSING_WAIT_MS;

  while (Date.now() < deadline) {
    const existing = await findExistingRequest(
      input.tenantId,
      input.idempotencyKey
    );

    if (!existing) return processingResult();

    const decision = decideExistingPurchase(
      {
        requestFingerprint: existing.request_fingerprint,
        status: existing.status,
        responseStatus: existing.response_status,
        savedResponse: existing.saved_response ?? existing.response_json,
      },
      input.requestFingerprint
    );

    if (decision.kind === "conflict") {
      return errorResult(
        409,
        "Idempotency key was already used with a different payload."
      );
    }
    if (decision.kind === "replay") {
      return {
        status: decision.status,
        body: decision.body as MasterPurchaseBody,
        replayed: true,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, PROCESSING_POLL_MS));
  }

  return processingResult();
}

async function lockPurchaseRequest(
  connection: PoolConnection,
  requestId: string,
  processingToken: string
): Promise<PurchaseRequestRow | null> {
  const [rows] = await connection.execute<PurchaseRequestRow[]>(
    `SELECT *
     FROM purchase_requests
     WHERE id = ? AND processing_token = ?
     LIMIT 1
     FOR UPDATE`,
    [requestId, processingToken]
  );
  return rows[0] ?? null;
}

async function lockUser(
  connection: PoolConnection,
  userId: string
): Promise<UserRow | null> {
  const [rows] = await connection.execute<UserRow[]>(
    `SELECT id, email, display_name, is_active, is_admin, role, points
     FROM users
     WHERE id = ?
     LIMIT 1
     FOR UPDATE`,
    [userId]
  );
  return rows[0] ?? null;
}

async function findProduct(
  connection: PoolConnection,
  typeId: string,
  lock: boolean
): Promise<ProductRow | null> {
  const siteId = getSiteId();
  const lockClause = lock ? " FOR UPDATE" : "";
  const [rows] = await connection.execute<ProductRow[]>(
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
     LIMIT 1${lockClause}`,
    [siteId, typeId, siteId]
  );
  return rows[0] ?? null;
}

async function completeRequest(
  connection: PoolConnection,
  requestId: string,
  status: "SUCCEEDED" | "FAILED",
  responseStatus: number,
  body: MasterPurchaseBody,
  orderId: string | null
): Promise<void> {
  const serialized = JSON.stringify(body);
  await connection.execute(
    `UPDATE purchase_requests
     SET status = ?, processing_stage = ?, order_id = ?,
         response_status = ?, response_json = ?, saved_response = ?,
         lease_expires_at = NULL, updated_at = ?
     WHERE id = ?`,
    [
      status,
      status,
      orderId,
      responseStatus,
      serialized,
      serialized,
      new Date(),
      requestId,
    ]
  );
}

async function completeExpectedFailure(
  connection: PoolConnection,
  requestId: string,
  status: number,
  message: string
): Promise<MasterPurchaseResult> {
  const result = errorResult(status, message);
  await completeRequest(
    connection,
    requestId,
    "FAILED",
    result.status,
    result.body,
    null
  );
  await connection.commit();
  return result;
}

async function markUnexpectedFailure(requestId: string): Promise<void> {
  const body = errorResult(500, "Internal purchase processing error.");
  const serialized = JSON.stringify(body.body);
  await pool.execute(
    `UPDATE purchase_requests
     SET status = 'FAILED', processing_stage = 'FAILED',
         response_status = 500, response_json = ?, saved_response = ?,
         lease_expires_at = NULL, updated_at = ?
     WHERE id = ? AND status = 'PROCESSING' AND processing_stage = 'CLAIMED'`,
    [serialized, serialized, new Date(), requestId]
  );
}

async function insertOrder(
  connection: PoolConnection,
  input: {
    purchaseRequestId: string;
    itemIndex: number;
    product: ProductRow;
    user: UserRow;
    siteName: string;
    unitPrice: number;
    delivery: ExternalDelivery;
    account: StockAccount;
  }
): Promise<string> {
  const orderId = randomUUID();
  const details = input.delivery.textdb ?? accountDetails(input.account);
  const costPrice = Number(input.product.cost_price ?? 0);
  const profit = roundCurrency(input.unitPrice - costPrice);
  const purchaseDate = input.delivery.date
    ? new Date(input.delivery.date)
    : new Date();

  await connection.execute(
    `INSERT INTO orders (
      id, purchase_request_id, purchase_item_index, external_uid,
      product_type_id, product_name, product_image, product_details,
      price, type_menu, purchase_date, username_buy, buyer_user_id,
      raw_response, created_at, cost_price, profit, buyer_email,
      buyer_display_name, api_provider_id, account_email, account_password,
      site_id, is_local
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orderId,
      input.purchaseRequestId,
      input.itemIndex,
      input.delivery.uid != null ? String(input.delivery.uid) : null,
      input.product.type_id,
      input.product.name,
      input.delivery.imageapi || input.product.image_url,
      details,
      input.unitPrice,
      input.product.type_menu,
      purchaseDate,
      `[Tenant] ${input.siteName}`,
      input.user.id,
      JSON.stringify(input.delivery),
      new Date(),
      costPrice,
      profit,
      input.user.email,
      input.user.display_name || input.siteName,
      input.product.api_provider_id,
      input.account.email || null,
      input.account.password || null,
      getSiteId(),
      input.product.is_local ? 1 : 0,
    ]
  );

  return orderId;
}

async function executeDatabaseFulfillment(input: {
  requestId: string;
  processingToken: string;
  auth: ValidatedApiKey;
  payload: PurchasePayload;
}): Promise<MasterPurchaseResult> {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const requestRow = await lockPurchaseRequest(
      connection,
      input.requestId,
      input.processingToken
    );
    if (!requestRow || requestRow.status !== "PROCESSING") {
      await connection.rollback();
      return processingResult();
    }

    const user = await lockUser(connection, input.auth.user_id);
    if (!user || user.is_active === 0 || user.is_active === false) {
      return completeExpectedFailure(
        connection,
        input.requestId,
        401,
        "Buyer account is unavailable."
      );
    }

    const product = await findProduct(connection, input.payload.typeId, true);
    if (!product || product.price == null) {
      return completeExpectedFailure(
        connection,
        input.requestId,
        400,
        "Product was not found or has no sale price."
      );
    }
    if (product.api_provider_id) {
      return completeExpectedFailure(
        connection,
        input.requestId,
        409,
        "Product fulfillment mode changed. Retry with a new idempotency key."
      );
    }

    const unitPrice = purchaseUnitPrice(product, user);
    const totalPrice = roundCurrency(unitPrice * input.payload.quantity);
    const currentPoints = Number(user.points ?? 0);
    if (currentPoints < totalPrice) {
      return completeExpectedFailure(
        connection,
        input.requestId,
        400,
        "Buyer balance is insufficient."
      );
    }

    const effectiveStock = getEffectiveStockFromRecord(product);
    if (effectiveStock < input.payload.quantity) {
      return completeExpectedFailure(
        connection,
        input.requestId,
        400,
        `Product is out of stock. Remaining stock: ${effectiveStock}.`
      );
    }

    const inventory = getAccountInventory(product);
    let deliveredAccounts: StockAccount[];
    let remainingStock: number;

    if (inventory.length > 0) {
      deliveredAccounts = inventory.slice(0, input.payload.quantity);
      const remainingAccounts = inventory.slice(input.payload.quantity);
      remainingStock = remainingAccounts.length;
      await connection.execute(
        `UPDATE products
         SET account_data = ?, stock = ?, updated_at = ?
         WHERE id = ?`,
        [
          JSON.stringify(remainingAccounts),
          remainingStock,
          new Date(),
          product.id,
        ]
      );
    } else if (product.account_email || product.account_password) {
      const staticAccount: StockAccount = {
        email: product.account_email || undefined,
        password: product.account_password || undefined,
        details: product.details || undefined,
      };
      deliveredAccounts = Array.from(
        { length: input.payload.quantity },
        () => ({ ...staticAccount })
      );
      const [stockUpdate] = await connection.execute<ResultSetHeader>(
        `UPDATE products
         SET stock = stock - ?, updated_at = ?
         WHERE id = ? AND stock >= ?`,
        [
          input.payload.quantity,
          new Date(),
          product.id,
          input.payload.quantity,
        ]
      );
      if (stockUpdate.affectedRows !== 1) {
        await connection.rollback();
        return errorResult(409, "Stock changed while processing the purchase.");
      }
      remainingStock = effectiveStock - input.payload.quantity;
    } else {
      return completeExpectedFailure(
        connection,
        input.requestId,
        400,
        "Product has no deliverable account data."
      );
    }

    const [balanceUpdate] = await connection.execute<ResultSetHeader>(
      `UPDATE users
       SET points = points - ?, updated_at = ?
       WHERE id = ? AND points >= ?`,
      [totalPrice, new Date(), user.id, totalPrice]
    );
    if (balanceUpdate.affectedRows !== 1) {
      await connection.rollback();
      return errorResult(409, "Balance changed while processing the purchase.");
    }

    const orderIds: string[] = [];
    for (let index = 0; index < deliveredAccounts.length; index += 1) {
      const account = deliveredAccounts[index];
      const details = accountDetails(account);
      orderIds.push(
        await insertOrder(connection, {
          purchaseRequestId: input.requestId,
          itemIndex: index,
          product,
          user,
          siteName: input.auth.site_name,
          unitPrice,
          account,
          delivery: {
            uid: null,
            name: product.name || input.payload.typeId,
            imageapi: product.image_url,
            textdb: details,
            point: unitPrice,
            date: new Date().toISOString(),
          },
        })
      );
    }

    const body: PurchaseSuccessBody = {
      success: true,
      productName: product.name || input.payload.typeId,
      accountData: deliveredAccounts,
      remainingStock,
      orderId: orderIds[0],
    };
    await completeRequest(
      connection,
      input.requestId,
      "SUCCEEDED",
      200,
      body,
      orderIds[0]
    );
    await connection.commit();
    return { status: 200, body };
  } catch {
    await connection.rollback();
    await markUnexpectedFailure(input.requestId);
    console.error("[master-purchase] database fulfillment failed", {
      purchaseRequestId: input.requestId,
    });
    return errorResult(500, "Internal purchase processing error.");
  } finally {
    connection.release();
  }
}

async function reserveExternalPurchase(input: {
  requestId: string;
  processingToken: string;
  auth: ValidatedApiKey;
  payload: PurchasePayload;
}): Promise<ReservedExternalPurchase | MasterPurchaseResult> {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const requestRow = await lockPurchaseRequest(
      connection,
      input.requestId,
      input.processingToken
    );
    if (!requestRow || requestRow.status !== "PROCESSING") {
      await connection.rollback();
      return processingResult();
    }

    const user = await lockUser(connection, input.auth.user_id);
    if (!user || user.is_active === 0 || user.is_active === false) {
      return completeExpectedFailure(
        connection,
        input.requestId,
        401,
        "Buyer account is unavailable."
      );
    }

    const product = await findProduct(connection, input.payload.typeId, true);
    if (!product || !product.api_provider_id || product.price == null) {
      return completeExpectedFailure(
        connection,
        input.requestId,
        400,
        "External product is unavailable."
      );
    }

    const unitPrice = purchaseUnitPrice(product, user);
    const totalPrice = roundCurrency(unitPrice * input.payload.quantity);
    const currentPoints = Number(user.points ?? 0);
    const effectiveStock = getEffectiveStockFromRecord(product);

    if (currentPoints < totalPrice) {
      return completeExpectedFailure(
        connection,
        input.requestId,
        400,
        "Buyer balance is insufficient."
      );
    }
    if (effectiveStock < input.payload.quantity) {
      return completeExpectedFailure(
        connection,
        input.requestId,
        400,
        `Product is out of stock. Remaining stock: ${effectiveStock}.`
      );
    }

    const [stockUpdate] = await connection.execute<ResultSetHeader>(
      `UPDATE products
       SET stock = stock - ?, updated_at = ?
       WHERE id = ? AND stock >= ?`,
      [
        input.payload.quantity,
        new Date(),
        product.id,
        input.payload.quantity,
      ]
    );
    const [balanceUpdate] = await connection.execute<ResultSetHeader>(
      `UPDATE users
       SET points = points - ?, updated_at = ?
       WHERE id = ? AND points >= ?`,
      [totalPrice, new Date(), user.id, totalPrice]
    );

    if (stockUpdate.affectedRows !== 1 || balanceUpdate.affectedRows !== 1) {
      await connection.rollback();
      return errorResult(409, "Stock or balance changed during reservation.");
    }

    await connection.execute(
      `UPDATE purchase_requests
       SET product_id = ?, reserved_amount = ?, processing_stage = 'RESERVED',
           lease_expires_at = ?, updated_at = ?
       WHERE id = ?`,
      [
        product.id,
        totalPrice,
        new Date(Date.now() + 10 * 60_000),
        new Date(),
        input.requestId,
      ]
    );
    await connection.commit();

    return {
      product,
      user,
      unitPrice,
      remainingStock: effectiveStock - input.payload.quantity,
    };
  } catch {
    await connection.rollback();
    await markUnexpectedFailure(input.requestId);
    return errorResult(500, "Internal purchase processing error.");
  } finally {
    connection.release();
  }
}

function externalItemKey(requestId: string, itemIndex: number): string {
  return createHash("sha256")
    .update(`${requestId}:${itemIndex}`)
    .digest("hex");
}

async function saveExternalProgress(input: {
  requestId: string;
  processingToken: string;
  deliveries: ExternalDelivery[];
}): Promise<void> {
  await pool.execute(
    `UPDATE purchase_requests
     SET processing_stage = 'FULFILLING', fulfillment_payload = ?,
         lease_expires_at = ?, updated_at = ?
     WHERE id = ? AND processing_token = ? AND status = 'PROCESSING'`,
    [
      JSON.stringify(input.deliveries),
      new Date(Date.now() + 10 * 60_000),
      new Date(),
      input.requestId,
      input.processingToken,
    ]
  );
}

async function markReconciliationRequired(
  requestId: string,
  processingToken: string
): Promise<void> {
  await pool.execute(
    `UPDATE purchase_requests
     SET processing_stage = 'RECONCILIATION_REQUIRED',
         lease_expires_at = NULL, updated_at = ?
     WHERE id = ? AND processing_token = ? AND status = 'PROCESSING'`,
    [new Date(), requestId, processingToken]
  );
}

async function finalizeExternalPurchase(input: {
  requestId: string;
  processingToken: string;
  auth: ValidatedApiKey;
  reserved: ReservedExternalPurchase;
  deliveries: ExternalDelivery[];
}): Promise<MasterPurchaseResult> {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const requestRow = await lockPurchaseRequest(
      connection,
      input.requestId,
      input.processingToken
    );
    if (!requestRow || requestRow.status !== "PROCESSING") {
      await connection.rollback();
      const replay = parseSavedResponse(
        requestRow?.saved_response ?? requestRow?.response_json ?? null
      );
      return replay && requestRow?.response_status
        ? {
            status: requestRow.response_status,
            body: replay,
            replayed: true,
          }
        : processingResult();
    }

    const orderIds: string[] = [];
    const responseAccounts: StockAccount[] = [];
    for (let index = 0; index < input.deliveries.length; index += 1) {
      const delivery = input.deliveries[index];
      const account: StockAccount = {
        details: delivery.textdb || undefined,
      };
      responseAccounts.push(account);
      orderIds.push(
        await insertOrder(connection, {
          purchaseRequestId: input.requestId,
          itemIndex: index,
          product: input.reserved.product,
          user: input.reserved.user,
          siteName: input.auth.site_name,
          unitPrice: input.reserved.unitPrice,
          delivery,
          account,
        })
      );
    }

    const body: PurchaseSuccessBody = {
      success: true,
      productName:
        input.reserved.product.name || input.reserved.product.type_id,
      accountData: responseAccounts,
      remainingStock: input.reserved.remainingStock,
      orderId: orderIds[0],
    };
    await completeRequest(
      connection,
      input.requestId,
      "SUCCEEDED",
      200,
      body,
      orderIds[0]
    );
    await connection.commit();
    return { status: 200, body };
  } catch {
    await connection.rollback();
    await markReconciliationRequired(
      input.requestId,
      input.processingToken
    );
    console.error("[master-purchase] external finalization needs reconciliation", {
      purchaseRequestId: input.requestId,
    });
    return processingResult();
  } finally {
    connection.release();
  }
}

async function executeExternalFulfillment(input: {
  requestId: string;
  processingToken: string;
  auth: ValidatedApiKey;
  payload: PurchasePayload;
  providerId: string;
}): Promise<MasterPurchaseResult> {
  let provider: Awaited<ReturnType<typeof getApiProviderById>>;
  try {
    provider = await getApiProviderById(input.providerId);
  } catch {
    await markUnexpectedFailure(input.requestId);
    return errorResult(500, "Internal purchase processing error.");
  }
  if (!provider || !provider.isActive) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await lockPurchaseRequest(
        connection,
        input.requestId,
        input.processingToken
      );
      return completeExpectedFailure(
        connection,
        input.requestId,
        400,
        "API provider is unavailable."
      );
    } finally {
      connection.release();
    }
  }

  const reserved = await reserveExternalPurchase(input);
  if ("status" in reserved) return reserved;

  const deliveries: ExternalDelivery[] = [];
  try {
    for (let index = 0; index < input.payload.quantity; index += 1) {
      const itemKey = externalItemKey(input.requestId, index);
      const external = await buyExternalProduct({
        typeId: input.payload.typeId,
        usernameBuy: `[Tenant] ${input.auth.site_name}`,
        provider,
        reference: `MASTER_${input.requestId}_${index}`,
        idempotencyKey: itemKey,
        requestId: itemKey,
      });
      deliveries.push(external.data);
      await saveExternalProgress({
        requestId: input.requestId,
        processingToken: input.processingToken,
        deliveries,
      });
    }
  } catch {
    await markReconciliationRequired(
      input.requestId,
      input.processingToken
    );
    console.error("[master-purchase] provider outcome requires reconciliation", {
      purchaseRequestId: input.requestId,
    });
    return processingResult();
  }

  return finalizeExternalPurchase({
    requestId: input.requestId,
    processingToken: input.processingToken,
    auth: input.auth,
    reserved,
    deliveries,
  });
}

export async function executeMasterPurchase(input: {
  requestId: string;
  processingToken: string;
  auth: ValidatedApiKey;
  payload: PurchasePayload;
}): Promise<MasterPurchaseResult> {
  try {
    const connection = await pool.getConnection();
    let product: ProductRow | null = null;
    try {
      product = await findProduct(connection, input.payload.typeId, false);
    } finally {
      connection.release();
    }

    if (product?.api_provider_id) {
      return executeExternalFulfillment({
        ...input,
        providerId: product.api_provider_id,
      });
    }

    return executeDatabaseFulfillment(input);
  } catch {
    await markUnexpectedFailure(input.requestId);
    console.error("[master-purchase] preflight failed", {
      purchaseRequestId: input.requestId,
    });
    return errorResult(500, "Internal purchase processing error.");
  }
}
