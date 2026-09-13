import { randomUUID } from "crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

import pool from "@/lib/mysql";
import { getSiteId } from "@/lib/site";
import {
  createCashReceiptWithinTransaction,
  isReceiptEligible,
  toCashReceipt,
} from "@/lib/receipts/repository";
import type { CashReceiptSummary, ReceiptLineSnapshot } from "@/lib/receipts/types";
import type {
  PurchaseCaseItemSummary,
  PurchaseCaseStatus,
  PurchaseCaseSummary,
} from "@/lib/purchase-cases/types";

type CaseRow = RowDataPacket & {
  id: string;
  site_id: string;
  case_order_no: string;
  buyer_user_id: string;
  status: PurchaseCaseStatus;
  total_points: number | string;
  created_at: Date | string;
  completed_at: Date | string | null;
  buyer_email?: string | null;
  buyer_display_name?: string | null;
  site_name?: string | null;
};

type CaseItemRow = RowDataPacket & {
  id: string;
  case_order_id: string;
  line_index: number;
  product_type_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number | string;
  line_total: number | string;
  order_ids: string | null;
};

type OrderRow = RowDataPacket & {
  id: string;
  purchase_request_id?: string | null;
  case_order_id: string | null;
  product_type_id: string | null;
  product_name: string | null;
  price: number | string | null;
  created_at: Date | string | null;
  buyer_user_id: string | null;
  site_id: string;
};

function asIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asDate(value: Date | string | null | undefined, fallback = new Date()): Date {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function parseOrderIds(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
  return [];
}

function caseOrderNo(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? String(date.getUTCFullYear());
  const month = parts.find((part) => part.type === "month")?.value ?? String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = parts.find((part) => part.type === "day")?.value ?? String(date.getUTCDate()).padStart(2, "0");
  return `CO-${year}${month}${day}-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function toCaseItem(row: CaseItemRow): PurchaseCaseItemSummary {
  return {
    id: row.id,
    lineIndex: Number(row.line_index),
    productTypeId: row.product_type_id ?? null,
    productName: row.product_name,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price ?? 0),
    amount: Number(row.line_total ?? 0),
    orderIds: parseOrderIds(row.order_ids),
  };
}

async function listItems(
  connection: PoolConnection,
  caseOrderId: string,
): Promise<PurchaseCaseItemSummary[]> {
  const [rows] = await connection.execute<CaseItemRow[]>(
    `SELECT *
     FROM purchase_case_items
     WHERE case_order_id = ?
     ORDER BY line_index ASC`,
    [caseOrderId],
  );
  return rows.map(toCaseItem);
}

async function getReceiptInTransaction(
  connection: PoolConnection,
  caseOrderId: string,
): Promise<CashReceiptSummary | null> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT * FROM cash_receipts WHERE case_order_id = ? LIMIT 1`,
    [caseOrderId],
  );
  if (!rows[0]) return null;
  return toCashReceipt(rows[0] as never);
}

async function toSummary(
  connection: PoolConnection,
  row: CaseRow,
): Promise<PurchaseCaseSummary> {
  return {
    id: row.id,
    siteId: row.site_id,
    caseOrderNo: row.case_order_no,
    buyerUserId: row.buyer_user_id,
    status: row.status,
    totalPoints: Number(row.total_points ?? 0),
    createdAt: asIso(row.created_at) ?? new Date().toISOString(),
    completedAt: asIso(row.completed_at),
    items: await listItems(connection, row.id),
    receipt: await getReceiptInTransaction(connection, row.id),
    ...(row.buyer_email !== undefined ? { buyerEmail: row.buyer_email } : {}),
    ...(row.buyer_display_name !== undefined ? { buyerDisplayName: row.buyer_display_name } : {}),
    ...(row.site_name !== undefined ? { siteName: row.site_name } : {}),
  };
}

export async function createCaseHeaderWithinTransaction(
  connection: PoolConnection,
  input: {
    siteId: string;
    buyerUserId: string;
    createdAt?: Date;
    totalPoints?: number;
  },
): Promise<{ id: string; caseOrderNo: string; createdAt: Date }> {
  const id = randomUUID();
  const createdAt = input.createdAt ?? new Date();
  const now = new Date();
  const caseOrderNo = caseOrderNoValue(createdAt);

  await connection.execute(
    `INSERT INTO purchase_cases (
       id, site_id, case_order_no, buyer_user_id, status,
       total_points, created_at, completed_at, updated_at
     ) VALUES (?, ?, ?, ?, 'PROCESSING', ?, ?, NULL, ?)`,
    [id, input.siteId, caseOrderNo, input.buyerUserId, input.totalPoints ?? 0, createdAt, now],
  );

  return { id, caseOrderNo, createdAt };
}

function caseOrderNoValue(date: Date): string {
  return caseOrderNo(date);
}

export async function finalizeCaseWithinTransaction(
  connection: PoolConnection,
  input: {
    caseOrderId: string;
    siteId: string;
    buyerUserId: string;
    totalPoints: number;
    completedAt?: Date;
  },
): Promise<PurchaseCaseSummary> {
  const [caseRows] = await connection.execute<CaseRow[]>(
    `SELECT *
     FROM purchase_cases
     WHERE id = ? AND site_id = ? AND buyer_user_id = ?
     LIMIT 1
     FOR UPDATE`,
    [input.caseOrderId, input.siteId, input.buyerUserId],
  );
  const caseRow = caseRows[0];
  if (!caseRow) throw new Error("ไม่พบ Case Order");

  const [orderRows] = await connection.execute<OrderRow[]>(
    `SELECT id, case_order_id, product_type_id, product_name, price,
            created_at, buyer_user_id, site_id
     FROM orders
     WHERE case_order_id = ? AND site_id = ? AND buyer_user_id = ?
     ORDER BY created_at ASC, id ASC
     FOR UPDATE`,
    [input.caseOrderId, input.siteId, input.buyerUserId],
  );
  if (orderRows.length === 0) throw new Error("Case Order ยังไม่มีรายการสินค้า");

  const [existingItems] = await connection.execute<RowDataPacket[]>(
    `SELECT id FROM purchase_case_items WHERE case_order_id = ? LIMIT 1`,
    [input.caseOrderId],
  );
  if (existingItems.length === 0) {
    const groups = new Map<string, {
      productTypeId: string | null;
      productName: string;
      unitPrice: number;
      orderIds: string[];
    }>();

    for (const order of orderRows) {
      const productTypeId = order.product_type_id ?? null;
      const productName = order.product_name ?? "สินค้า";
      const unitPrice = Number(order.price ?? 0);
      const key = `${productTypeId ?? ""}\u0000${productName}\u0000${unitPrice.toFixed(2)}`;
      const current = groups.get(key) ?? {
        productTypeId,
        productName,
        unitPrice,
        orderIds: [],
      };
      current.orderIds.push(order.id);
      groups.set(key, current);
    }

    let lineIndex = 1;
    for (const group of groups.values()) {
      const quantity = group.orderIds.length;
      await connection.execute(
        `INSERT INTO purchase_case_items (
           id, case_order_id, line_index, product_type_id, product_name,
           quantity, unit_price, line_total, order_ids, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          input.caseOrderId,
          lineIndex,
          group.productTypeId,
          group.productName,
          quantity,
          group.unitPrice,
          group.unitPrice * quantity,
          JSON.stringify(group.orderIds),
          new Date(),
        ],
      );
      lineIndex += 1;
    }
  }

  const items = await listItems(connection, input.caseOrderId);
  const receiptLines: ReceiptLineSnapshot[] = items.map((item) => ({
    productTypeId: item.productTypeId,
    productName: item.productName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    amount: item.amount,
  }));
  const completedAt = input.completedAt ?? new Date();
  const shouldIssueReceipt = isReceiptEligible(completedAt);
  let receipt = await getReceiptInTransaction(connection, input.caseOrderId);
  if (!receipt && shouldIssueReceipt) {
    receipt = await createCashReceiptWithinTransaction(connection, {
      siteId: input.siteId,
      caseOrderId: input.caseOrderId,
      buyerUserId: input.buyerUserId,
      issuedAt: completedAt,
      totalAmount: input.totalPoints,
      lines: receiptLines,
    });
  }

  await connection.execute(
    `UPDATE purchase_cases
     SET status = 'COMPLETED', total_points = ?, completed_at = ?, updated_at = ?
     WHERE id = ? AND site_id = ? AND buyer_user_id = ?`,
    [input.totalPoints, completedAt, new Date(), input.caseOrderId, input.siteId, input.buyerUserId],
  );

  const [updatedRows] = await connection.execute<CaseRow[]>(
    `SELECT * FROM purchase_cases WHERE id = ? LIMIT 1`,
    [input.caseOrderId],
  );
  const updated = updatedRows[0] ?? caseRow;
  return {
    ...(await toSummary(connection, updated)),
    receipt,
  };
}

export async function createCompletedCaseFromOrderIds(input: {
  siteId?: string;
  buyerUserId: string;
  orderIds: string[];
}): Promise<PurchaseCaseSummary> {
  const siteId = input.siteId ?? getSiteId();
  const orderIds = [...new Set(input.orderIds.filter((id) => typeof id === "string" && id.length > 0))];
  if (orderIds.length === 0) throw new Error("ไม่พบ Order สำหรับสร้าง Case Order");

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const placeholders = orderIds.map(() => "?").join(", ");
    const [orders] = await connection.execute<OrderRow[]>(
      `SELECT id, case_order_id, product_type_id, product_name, price,
              created_at, buyer_user_id, site_id
       FROM orders
       WHERE site_id = ? AND buyer_user_id = ? AND id IN (${placeholders})
       ORDER BY created_at ASC, id ASC
       FOR UPDATE`,
      [siteId, input.buyerUserId, ...orderIds],
    );
    if (orders.length !== orderIds.length) throw new Error("ไม่พบ Order บางรายการของผู้ซื้อ");

    const existingCaseIds = [...new Set(orders.map((order) => order.case_order_id).filter(Boolean))] as string[];
    if (existingCaseIds.length > 0) {
      if (existingCaseIds.length !== 1 || orders.some((order) => order.case_order_id !== existingCaseIds[0])) {
        throw new Error("Order ถูกผูกกับ Case Order มากกว่าหนึ่งรายการ");
      }
      const [caseRows] = await connection.execute<CaseRow[]>(
        `SELECT * FROM purchase_cases WHERE id = ? AND site_id = ? AND buyer_user_id = ? LIMIT 1`,
        [existingCaseIds[0], siteId, input.buyerUserId],
      );
      if (!caseRows[0]) throw new Error("ไม่พบ Case Order เดิม");
      await connection.commit();
      return toSummary(connection, caseRows[0]);
    }

    const createdAt = asDate(orders[0]?.created_at);
    const completedAt = asDate(orders[orders.length - 1]?.created_at, createdAt);
    const header = await createCaseHeaderWithinTransaction(connection, {
      siteId,
      buyerUserId: input.buyerUserId,
      createdAt,
      totalPoints: orders.reduce((sum, order) => sum + Number(order.price ?? 0), 0),
    });
    await connection.execute(
      `UPDATE orders
       SET case_order_id = ?
       WHERE site_id = ? AND buyer_user_id = ? AND id IN (${placeholders})
         AND case_order_id IS NULL`,
      [header.id, siteId, input.buyerUserId, ...orderIds],
    );
    const totalPoints = orders.reduce((sum, order) => sum + Number(order.price ?? 0), 0);
    const result = await finalizeCaseWithinTransaction(connection, {
      caseOrderId: header.id,
      siteId,
      buyerUserId: input.buyerUserId,
      totalPoints,
      completedAt,
    });
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function loadCase(
  connection: PoolConnection,
  caseOrderId: string,
  siteId: string,
  buyerUserId?: string,
): Promise<PurchaseCaseSummary | null> {
  const where = buyerUserId
    ? "id = ? AND site_id = ? AND buyer_user_id = ?"
    : "id = ? AND site_id = ?";
  const params = buyerUserId ? [caseOrderId, siteId, buyerUserId] : [caseOrderId, siteId];
  const [rows] = await connection.execute<CaseRow[]>(
    `SELECT * FROM purchase_cases WHERE ${where} LIMIT 1`,
    params,
  );
  return rows[0] ? toSummary(connection, rows[0]) : null;
}

export async function getPurchaseCaseForUser(
  caseOrderId: string,
  buyerUserId: string,
  siteId = getSiteId(),
): Promise<PurchaseCaseSummary | null> {
  const connection = await pool.getConnection();
  try {
    return await loadCase(connection, caseOrderId, siteId, buyerUserId);
  } finally {
    connection.release();
  }
}

export async function getPurchaseCaseForAdmin(
  caseOrderId: string,
  siteId?: string,
): Promise<PurchaseCaseSummary | null> {
  const connection = await pool.getConnection();
  try {
    const currentSiteId = getSiteId();
    if (currentSiteId === "main" && !siteId) {
      const [rows] = await connection.execute<CaseRow[]>(
        `SELECT * FROM purchase_cases WHERE id = ? LIMIT 1`,
        [caseOrderId],
      );
      return rows[0] ? toSummary(connection, rows[0]) : null;
    }
    const selectedSiteId = siteId || currentSiteId;
    return await loadCase(connection, caseOrderId, selectedSiteId);
  } finally {
    connection.release();
  }
}

export async function listPurchaseCasesByUser(
  buyerUserId: string,
  limit = 200,
  siteId = getSiteId(),
): Promise<PurchaseCaseSummary[]> {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.execute<CaseRow[]>(
      `SELECT *
       FROM purchase_cases
       WHERE site_id = ? AND buyer_user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [siteId, buyerUserId, String(Math.min(Math.max(limit, 1), 500))],
    );
    return Promise.all(rows.map((row) => toSummary(connection, row)));
  } finally {
    connection.release();
  }
}

export type AdminPurchaseCaseFilters = {
  siteId?: string | null;
  status?: PurchaseCaseStatus | null;
  search?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  limit?: number;
  offset?: number;
};

export async function listPurchaseCasesForAdmin(
  filters: AdminPurchaseCaseFilters = {},
): Promise<{ cases: PurchaseCaseSummary[]; total: number }> {
  const currentSiteId = getSiteId();
  const where: string[] = [];
  const params: Array<string | number | Date> = [];
  if (currentSiteId !== "main") {
    where.push("c.site_id = ?");
    params.push(currentSiteId);
  } else if (filters.siteId && filters.siteId !== "all") {
    where.push("c.site_id = ?");
    params.push(filters.siteId);
  }
  const search = filters.search?.trim();
  if (search) {
    where.push("(c.case_order_no LIKE ? OR r.receipt_no LIKE ? OR u.email LIKE ? OR u.display_name LIKE ?)");
    const pattern = `%${search}%`;
    params.push(pattern, pattern, pattern, pattern);
  }
  if (filters.status) {
    where.push("c.status = ?");
    params.push(filters.status);
  }
  if (filters.startDate) {
    where.push("c.created_at >= ?");
    params.push(new Date(filters.startDate));
  }
  if (filters.endDate) {
    where.push("c.created_at <= ?");
    params.push(new Date(filters.endDate));
  }
  const whereClause = where.length > 0 ? where.join(" AND ") : "1=1";
  const [countRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM purchase_cases c
     LEFT JOIN cash_receipts r ON r.site_id = c.site_id AND r.case_order_id = c.id
     LEFT JOIN users u ON u.site_id = c.site_id AND u.id = c.buyer_user_id
     WHERE ${whereClause}`,
    params,
  );
  const total = Number(countRows[0]?.total ?? 0);
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);
  const [rows] = await pool.execute<CaseRow[]>(
    `SELECT c.*, u.email AS buyer_email, u.display_name AS buyer_display_name,
            s.value AS site_name
     FROM purchase_cases c
     LEFT JOIN cash_receipts r ON r.site_id = c.site_id AND r.case_order_id = c.id
     LEFT JOIN users u ON u.site_id = c.site_id AND u.id = c.buyer_user_id
     LEFT JOIN settings s ON s.site_id = c.site_id AND s.key = 'site_name'
     WHERE ${whereClause}
     ORDER BY c.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, String(limit), String(offset)],
  );
  const connection = await pool.getConnection();
  try {
    return {
      total,
      cases: await Promise.all(rows.map((row) => toSummary(connection, row))),
    };
  } finally {
    connection.release();
  }
}

export async function backfillPurchaseCasesFromDate(input: {
  siteId?: string;
  from: Date;
  limit?: number;
}): Promise<{ scanned: number; created: number; skipped: number; failed: number }> {
  const siteId = input.siteId ?? getSiteId();
  const [rows] = await pool.execute<OrderRow[]>(
    `SELECT id, purchase_request_id, case_order_id, product_type_id, product_name, price,
            created_at, buyer_user_id, site_id
     FROM orders
     WHERE site_id = ? AND created_at >= ?
     ORDER BY created_at ASC, id ASC
     LIMIT ?`,
    [siteId, input.from, String(Math.min(Math.max(input.limit ?? 10000, 1), 50000))],
  );
  let created = 0;
  let skipped = 0;
  let failed = 0;
  const groups = new Map<string, { buyerUserId: string; orderIds: string[] }>();
  for (const row of rows) {
    if (!row.buyer_user_id || row.case_order_id) {
      skipped += 1;
      continue;
    }
    // Master/API and bundle purchases share purchase_request_id. Keep those
    // rows as one Case Order; legacy Buy Now rows without it stay separate.
    const groupKey = `${row.buyer_user_id}\u0000${row.purchase_request_id || row.id}`;
    const group = groups.get(groupKey) ?? { buyerUserId: row.buyer_user_id, orderIds: [] };
    group.orderIds.push(row.id);
    groups.set(groupKey, group);
  }
  for (const group of groups.values()) {
    try {
      await createCompletedCaseFromOrderIds({
        siteId,
        buyerUserId: group.buyerUserId,
        orderIds: group.orderIds,
      });
      created += 1;
    } catch (error) {
      failed += 1;
      console.error("Purchase case backfill group failed:", error);
    }
  }
  return { scanned: rows.length, created, skipped, failed };
}
