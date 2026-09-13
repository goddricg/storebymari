import { createHash, randomUUID } from "crypto";
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import pool from "@/lib/mysql";
import { getSiteId } from "@/lib/site";
import {
  safeParseJson,
  type Separator,
} from "@/lib/products/account-parser";
import type { ProductAccount, StockDeliveryType } from "@/lib/products/types";
import { findProductByTypeId, syncProductToFirestore } from "@/lib/products/repository";
import {
  canUpgradeStockDeliveryType,
  DEFAULT_STOCK_DELIVERY_TYPE,
  getStockDeliveryIdentity,
  getStockDeliveryIdentityIssue,
  parseStockDeliveryType,
} from "@/lib/products/stock-delivery-type";
import {
  previewStockAppend,
  type StockAppendAccount,
  type StockAppendFormat,
} from "@/lib/products/stock-append-preview";

export {
  STOCK_APPEND_MAX_INPUT_LENGTH,
  STOCK_APPEND_MAX_ACCOUNTS,
  previewStockAppend,
} from "@/lib/products/stock-append-preview";
export type {
  StockAppendAccount,
  StockAppendFormat,
  StockAppendPreview,
  StockAppendPreviewInput,
} from "@/lib/products/stock-append-preview";

export type StockAppendInput = {
  productId: string;
  typeId?: string;
  rawInput: string;
  dataFormat: StockAppendFormat;
  separator: Separator;
  stockDeliveryType?: StockDeliveryType;
  siteId?: string;
  actorId: string;
  idempotencyKey: string;
};

export type StockAppendResponse = {
  success: true;
  operation: "append-account";
  replayed?: boolean;
  productId: string;
  typeId: string;
  productName: string;
  addedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  previousStock: number;
  remainingStock: number;
};

export type StockAppendOutcome =
  | { kind: "success"; status: 200; body: StockAppendResponse }
  | { kind: "conflict"; status: 409; body: { success: false; code: string; message: string } }
  | { kind: "processing"; status: 202; body: { success: false; code: "PROCESSING"; message: string } };

export class StockAppendError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "StockAppendError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function normalize(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function accountKey(
  account: StockAppendAccount | ProductAccount,
  productName = "",
  stockDeliveryType: StockDeliveryType = DEFAULT_STOCK_DELIVERY_TYPE,
): string | null {
  return getStockDeliveryIdentity(
    {
      email: normalize(account.email || ""),
      password: normalize(account.password || ""),
      details: normalize(account.details || ""),
    },
    productName,
    stockDeliveryType,
  );
}

function requestFingerprint(input: {
  productId: string;
  typeId?: string;
  stockDeliveryType: StockDeliveryType;
  accounts: StockAppendAccount[];
}): string {
  return createHash("sha256")
    .update(JSON.stringify({
      productId: input.productId,
      typeId: input.typeId || "",
      stockDeliveryType: input.stockDeliveryType,
      // Keep idempotency tied to the exact normalized payload even when the
      // selected delivery type intentionally disables duplicate detection.
      accounts: input.accounts.map((account) => ({
        email: normalize(account.email || ""),
        password: normalize(account.password || ""),
        details: normalize(account.details || ""),
      })),
    }))
    .digest("hex");
}

/*
function parseInput(input: Pick<StockAppendInput, "rawInput" | "dataFormat" | "separator">): StockAppendPreview {
  if (!input.rawInput.trim()) {
    return {
      detectedCount: 0,
      validAccounts: [],
      invalidCount: 0,
      invalidReasons: [],
    };
  }

  const parsed = input.dataFormat === "short"
    ? parseShortAccountData(input.rawInput)
    : parseAccountData(input.rawInput, input.separator);
  const validAccounts: StockAppendAccount[] = [];
  const invalidReasons: string[] = [];

  parsed.forEach((account, index) => {
    const normalized = {
      email: normalize(account.email || ""),
      password: normalize(account.password || ""),
      details: normalize(account.details || account.rawLines.join("\n")),
    };

    // Some products deliver a token or link in details without email/password.
    // Treat a non-empty details block as valid delivery data.
    if (!normalized.details && (!normalized.email || !normalized.password)) {
      invalidReasons.push(`รายการที่ ${index + 1}: ไม่มีข้อมูลสำหรับส่งมอบ`);
      return;
    }

    validAccounts.push(normalized);
  });

  return {
    detectedCount: parsed.length,
    validAccounts,
    invalidCount: invalidReasons.length,
    invalidReasons,
  };
}

export function previewStockAppend(
  input: Pick<StockAppendInput, "rawInput" | "dataFormat" | "separator">,
): StockAppendPreview {
  if (input.rawInput.length > STOCK_APPEND_MAX_INPUT_LENGTH) {
    return {
      detectedCount: 0,
      validAccounts: [],
      invalidCount: 1,
      invalidReasons: [`ข้อมูลยาวเกิน ${STOCK_APPEND_MAX_INPUT_LENGTH.toLocaleString()} ตัวอักษร`],
    };
  }

  const preview = parseInput(input);
  if (preview.detectedCount > STOCK_APPEND_MAX_ACCOUNTS) {
    return {
      ...preview,
      invalidCount: preview.invalidCount + 1,
      invalidReasons: [
        ...preview.invalidReasons,
        `เพิ่มได้ครั้งละไม่เกิน ${STOCK_APPEND_MAX_ACCOUNTS.toLocaleString()} Account`,
      ],
    };
  }
  return preview;
}
*/

function parseSavedResponse(value: string | null): (StockAppendResponse | { success: false; code?: string; message?: string }) | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as StockAppendResponse;
  } catch {
    return null;
  }
}

function isDuplicateEntry(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ER_DUP_ENTRY",
  );
}

async function markRequestFailed(
  requestId: string,
  status: number,
  body: { success: false; code: string; message: string },
): Promise<void> {
  await pool.execute(
    `UPDATE stock_append_requests
     SET status = 'FAILED', response_status = ?, saved_response = ?, updated_at = ?
     WHERE id = ? AND status = 'PROCESSING'`,
    [status, JSON.stringify(body), new Date(), requestId],
  );
}

async function rollback(connection: PoolConnection, open: boolean): Promise<void> {
  if (open) {
    await connection.rollback().catch(() => undefined);
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForExistingRequest(input: {
  siteId: string;
  actorId: string;
  idempotencyKey: string;
  requestFingerprint: string;
}): Promise<StockAppendOutcome> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const [requestRows] = await pool.execute<RowDataPacket[]>(
      `SELECT request_fingerprint, status, response_status, saved_response
       FROM stock_append_requests
       WHERE site_id = ? AND actor_id = ? AND idempotency_key = ?
       LIMIT 1`,
      [input.siteId, input.actorId, input.idempotencyKey],
    );
    const existing = requestRows[0];

    if (!existing) {
      await sleep(25);
      continue;
    }
    if (existing.request_fingerprint !== input.requestFingerprint) {
      return {
        kind: "conflict",
        status: 409,
        body: {
          success: false,
          code: "IDEMPOTENCY_CONFLICT",
          message: "Idempotency-Key เดิมถูกใช้กับข้อมูล Account คนละชุด",
        },
      };
    }

    const saved = parseSavedResponse(existing.saved_response ?? null);
    if (existing.status === "SUCCEEDED" && saved && saved.success) {
      return { kind: "success", status: 200, body: { ...saved, replayed: true } };
    }
    if (existing.status === "FAILED" && saved && !saved.success) {
      throw new StockAppendError(
        Number(existing.response_status) || 422,
        saved.code || "PREVIOUS_APPEND_FAILED",
        saved.message || "คำขอเดิมไม่สำเร็จ",
      );
    }

    await sleep(25);
  }

  return {
    kind: "processing",
    status: 202,
    body: {
      success: false,
      code: "PROCESSING",
      message: "คำขอเพิ่ม Account เดิมกำลังประมวลผล กรุณารอสักครู่แล้วลองใหม่ด้วย Idempotency-Key เดิม",
    },
  };
}

export async function appendProductAccounts(input: StockAppendInput): Promise<StockAppendOutcome> {
  const siteId = input.siteId || getSiteId();
  const key = input.idempotencyKey.trim();
  if (!key || key.length > 128) {
    throw new StockAppendError(422, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key ไม่ถูกต้อง");
  }
  if (!input.productId.trim()) {
    throw new StockAppendError(422, "INVALID_PRODUCT", "กรุณาระบุสินค้า");
  }

  const preview = previewStockAppend(input);
  if (preview.invalidCount > 0 || preview.validAccounts.length === 0) {
    throw new StockAppendError(
      422,
      "INVALID_ACCOUNT_DATA",
      preview.validAccounts.length === 0 ? "ไม่พบ Account ที่พร้อมเพิ่ม" : "มีข้อมูล Account ที่ต้องแก้ไขก่อนเพิ่ม",
      preview.invalidReasons,
    );
  }

  const requestedDeliveryType = input.stockDeliveryType ?? DEFAULT_STOCK_DELIVERY_TYPE;
  const fingerprint = requestFingerprint({
    productId: input.productId,
    typeId: input.typeId,
    stockDeliveryType: requestedDeliveryType,
    accounts: preview.validAccounts,
  });
  const requestId = randomUUID();
  let connection: PoolConnection | null = null;
  let transactionOpen = false;
  let claimed = false;

  try {
    try {
      await pool.execute(
        `INSERT INTO stock_append_requests (
           id, site_id, actor_id, product_id, type_id, idempotency_key,
           request_fingerprint, status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PROCESSING', ?, ?)`,
        [
          requestId,
          siteId,
          input.actorId,
          input.productId,
          input.typeId || "",
          key,
          fingerprint,
          new Date(),
          new Date(),
        ],
      );
      claimed = true;
    } catch (error) {
      if (!isDuplicateEntry(error)) throw error;
      return waitForExistingRequest({
        siteId,
        actorId: input.actorId,
        idempotencyKey: key,
        requestFingerprint: fingerprint,
      });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionOpen = true;

    const [productRows] = await connection.execute<RowDataPacket[]>(
      `SELECT *
       FROM products
       WHERE id = ?
         AND (is_local = 0 OR (is_local = 1 AND site_id = ?))
       LIMIT 1
       FOR UPDATE`,
      [input.productId, siteId],
    );
    const product = productRows[0];
    if (!product) {
      throw new StockAppendError(404, "PRODUCT_NOT_FOUND", "ไม่พบสินค้าที่เลือก");
    }
    if (input.typeId && input.typeId !== product.type_id) {
      throw new StockAppendError(409, "PRODUCT_CHANGED", "สินค้าที่เลือกเปลี่ยนแปลงแล้ว กรุณาโหลดรายการใหม่");
    }

    const existingAccounts = safeParseJson<ProductAccount[]>(product.account_data) ?? [];
    if (!Array.isArray(existingAccounts)) {
      throw new StockAppendError(409, "ACCOUNT_DATA_INVALID", "ข้อมูล Account เดิมของสินค้าต้องตรวจสอบก่อนเพิ่ม");
    }

    const storedDeliveryType = parseStockDeliveryType(product.stock_delivery_type);
    if (
      existingAccounts.length > 0 &&
      requestedDeliveryType !== storedDeliveryType &&
      !canUpgradeStockDeliveryType(storedDeliveryType, requestedDeliveryType)
    ) {
      throw new StockAppendError(
        409,
        "STOCK_DELIVERY_TYPE_CONFLICT",
        "สินค้านี้มี Stock อยู่แล้ว จึงเปลี่ยนประเภท Stock เป็นประเภทนี้ไม่ได้",
      );
    }
    const deliveryType = requestedDeliveryType;

    if (product.api_provider_id || product.account_email || product.account_password) {
      throw new StockAppendError(
        409,
        "PRODUCT_NOT_ACCOUNT_POOL",
        "สินค้านี้ใช้ Stock แบบ Provider หรือ Static Account จึงไม่สามารถเพิ่ม Account แบบ Pool ได้",
      );
    }

    const productName = String(product.name ?? "");
    const identityIssues = [
      ...(deliveryType === "account-screen-pool"
        ? existingAccounts.map((account, index) => {
            const issue = getStockDeliveryIdentityIssue(account, productName, deliveryType);
            return issue ? `รายการเดิม #${index + 1}: ${issue}` : null;
          })
        : []),
      ...(deliveryType === "account-screen-pool"
        ? preview.validAccounts.map((account, index) => {
            const issue = getStockDeliveryIdentityIssue(account, productName, deliveryType);
            return issue ? `รายการใหม่ #${index + 1}: ${issue}` : null;
          })
        : []),
    ].filter((issue): issue is string => Boolean(issue));
    if (identityIssues.length > 0) {
      throw new StockAppendError(
        422,
        "INVALID_ACCOUNT_IDENTITY",
        "ข้อมูล Account ยังไม่ครบตามกติกาของประเภท Stock ที่เลือก",
        identityIssues,
      );
    }

    const existingKeys = new Set(
      existingAccounts
        .map((account) => accountKey(account, productName, deliveryType))
        .filter((key): key is string => key !== null),
    );
    if (deliveryType === "account-screen-pool" && existingKeys.size !== existingAccounts.length) {
      throw new StockAppendError(
        409,
        "STOCK_IDENTITY_CONFLICT",
        "ข้อมูล Stock เดิมมีจอหรือโปรไฟล์ซ้ำกัน กรุณาแก้ไขรายการเดิมก่อนเพิ่มต่อ",
      );
    }
    const batchKeys = new Set<string>();
    const accountsToAppend: StockAppendAccount[] = [];
    let duplicateCount = 0;
    for (const account of preview.validAccounts) {
      const keyForAccount = accountKey(account, productName, deliveryType);
      if (
        keyForAccount !== null &&
        (existingKeys.has(keyForAccount) || batchKeys.has(keyForAccount))
      ) {
        duplicateCount += 1;
        continue;
      }

      if (keyForAccount !== null) batchKeys.add(keyForAccount);
      accountsToAppend.push(account);
    }

    const nextAccounts = [...existingAccounts, ...accountsToAppend];
    const response: StockAppendResponse = {
      success: true,
      operation: "append-account",
      productId: product.id,
      typeId: product.type_id,
      productName: product.name,
      addedCount: accountsToAppend.length,
      duplicateCount,
      rejectedCount: 0,
      previousStock: existingAccounts.length,
      remainingStock: nextAccounts.length,
    };

    if (accountsToAppend.length > 0 || deliveryType !== storedDeliveryType) {
      await connection.execute<ResultSetHeader>(
        `UPDATE products
         SET account_data = ?, stock = ?, stock_delivery_type = ?, updated_at = ?
         WHERE id = ?
           AND (is_local = 0 OR (is_local = 1 AND site_id = ?))`,
        [
          JSON.stringify(nextAccounts),
          nextAccounts.length,
          deliveryType,
          new Date(),
          product.id,
          siteId,
        ],
      );
    }

    await connection.execute(
      `UPDATE stock_append_requests
       SET status = 'SUCCEEDED', response_status = 200, saved_response = ?,
           accepted_count = ?, duplicate_count = ?, invalid_count = 0, updated_at = ?
       WHERE id = ?`,
      [JSON.stringify(response), response.addedCount, response.duplicateCount, new Date(), requestId],
    );
    await connection.commit();
    transactionOpen = false;

    // Keep the existing Firestore projection behavior outside the DB lock.
    if (response.addedCount > 0) {
      try {
        const refreshedProduct = await findProductByTypeId(product.type_id);
        if (refreshedProduct) {
          await syncProductToFirestore(refreshedProduct);
        }
      } catch (error) {
        const syncError = error as { code?: string; errno?: number; sqlState?: string };
        console.error("[stock-append] post-commit projection failed", {
          code: syncError.code,
          errno: syncError.errno,
          sqlState: syncError.sqlState,
        });
      }
    }

    return { kind: "success", status: 200, body: response };
  } catch (error) {
    if (error && typeof error === "object" && !(error instanceof StockAppendError)) {
      const dbError = error as { code?: string; errno?: number; sqlState?: string };
      console.error("[stock-append] database operation failed", {
        code: dbError.code,
        errno: dbError.errno,
        sqlState: dbError.sqlState,
      });
    }
    if (connection) {
      await rollback(connection, transactionOpen);
    }
    transactionOpen = false;

    const mapped = error instanceof StockAppendError
      ? error
      : new StockAppendError(500, "STOCK_APPEND_FAILED", "ไม่สามารถเพิ่ม Account ได้ กรุณาลองใหม่");
    if (claimed) {
      await markRequestFailed(requestId, mapped.status, {
        success: false,
        code: mapped.code,
        message: mapped.message,
      }).catch(() => undefined);
    }
    throw mapped;
  } finally {
    connection?.release();
  }
}
