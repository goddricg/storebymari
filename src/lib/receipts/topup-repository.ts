import { randomUUID } from "crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

import pool from "@/lib/mysql";
import { getSiteId } from "@/lib/site";
import {
  DEFAULT_RECEIPT_SELLER,
  getReceiptBuyerSnapshot,
  getReceiptSellerSnapshot,
  RECEIPT_TEMPLATE_VERSION,
} from "@/lib/receipts/repository";
import type {
  ReceiptBuyerSnapshot,
  ReceiptLineSnapshot,
  ReceiptSellerSnapshot,
  TopupCashReceiptSummary,
} from "@/lib/receipts/types";
import {
  TOPUP_STATEMENT_CUTOFF,
  TOPUP_STATEMENT_MAX_PRINT_ROWS,
  TOPUP_STATEMENT_TIME_ZONE,
  normalizeTopupStatementSource,
  type TopupStatementSourceFilter,
  type TopupStatementSortOrder,
} from "@/lib/topup/statement";
import {
  buildTopupReportDateRange,
  normalizeTopupReportDate,
} from "@/lib/topup/report-time";

const TOPUP_RECEIPT_PREFIX = "TU";
export const TOPUP_RECEIPT_PRODUCT_NAME = "พ้อยท์เครดิต [ อัตรา เรท 1 บาท ต่อ 1 พ้อยท์ ]";

type TopupReceiptRow = RowDataPacket & {
  id: string;
  site_id: string;
  topup_request_id: string;
  transaction_id: string;
  user_id: string;
  receipt_no: string;
  status: "ISSUED" | "VOIDED";
  issued_at: Date | string;
  amount_paid: number | string;
  base_points: number | string;
  bonus_points: number | string;
  credited_points: number | string;
  seller_snapshot: string;
  buyer_snapshot: string;
  lines_snapshot: string;
  template_version: string;
};

type TopupReceiptListRow = TopupReceiptRow & {
  source_type: string | null;
  source_label: string | null;
  source_email: string | null;
};

type AdminTopupRequestReceiptSourceRow = RowDataPacket & {
  id: string;
  site_id: string;
  user_id: string;
  transaction_id: string | null;
  amount: number | string | null;
  bonus_rule_id: string | null;
  bonus_points: number | string | null;
  credited_points: number | string | null;
  status: string;
  created_at: Date | string | null;
  updated_at: Date | string | null;
};

type AdminSlipReceiptSourceRow = RowDataPacket & {
  id: string;
  site_id: string;
  user_id: string | null;
  transaction_id: string | null;
  amount: number | string | null;
  bonus_rule_id: string | null;
  bonus_points: number | string | null;
  credited_points: number | string | null;
  status: string;
  source_type: string | null;
  qr_payload: string | null;
  created_at: Date | string | null;
};

export class TopupReceiptUnavailableError extends Error {
  public readonly statusCode = 404;

  constructor(message = "ไม่พบรายการเติมเงินที่สามารถออกใบเสร็จได้") {
    super(message);
    this.name = "TopupReceiptUnavailableError";
  }
}

function parseSnapshot<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function asIso(value: Date | string | null | undefined): string {
  if (!value) return new Date().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function formatParts(value: Date | string): { year: number; month: number } {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value ?? date.getUTCFullYear()),
    month: Number(parts.find((part) => part.type === "month")?.value ?? date.getUTCMonth() + 1),
  };
}

export function formatTopupReceiptNumber(year: number, month: number, sequence: number): string {
  return `${TOPUP_RECEIPT_PREFIX}-${year}-${String(month).padStart(2, "0")}-${String(sequence).padStart(4, "0")}`;
}

function normalizeBuyer(value: string | null | undefined): ReceiptBuyerSnapshot {
  const buyer = parseSnapshot<Partial<ReceiptBuyerSnapshot>>(value, {});
  return {
    name: buyer.name || "ลูกค้าทั่วไป",
    address: buyer.address ?? null,
    taxId: buyer.taxId ?? null,
    phone: buyer.phone ?? null,
    email: buyer.email ?? null,
  };
}

function normalizeTopupLines(value: string | null | undefined): ReceiptLineSnapshot[] {
  return parseSnapshot<ReceiptLineSnapshot[]>(value, []).map((line) => ({
    ...line,
    productName: TOPUP_RECEIPT_PRODUCT_NAME,
  }));
}

export function toTopupCashReceipt(row: TopupReceiptRow): TopupCashReceiptSummary {
  return {
    id: row.id,
    siteId: row.site_id,
    sourceType: "TOPUP",
    caseOrderId: null,
    topupRequestId: row.topup_request_id,
    transactionId: row.transaction_id,
    receiptNo: row.receipt_no,
    status: row.status,
    issuedAt: asIso(row.issued_at),
    totalAmount: Number(row.amount_paid ?? 0),
    amountPaid: Number(row.amount_paid ?? 0),
    basePoints: Number(row.base_points ?? 0),
    bonusPoints: Number(row.bonus_points ?? 0),
    creditedPoints: Number(row.credited_points ?? 0),
    seller: parseSnapshot<ReceiptSellerSnapshot>(row.seller_snapshot, DEFAULT_RECEIPT_SELLER),
    buyer: normalizeBuyer(row.buyer_snapshot),
    lines: normalizeTopupLines(row.lines_snapshot),
    templateVersion: row.template_version || RECEIPT_TEMPLATE_VERSION,
  };
}

export async function allocateTopupReceiptNumberWithinTransaction(
  connection: PoolConnection,
  siteId: string,
  issuedAt: Date,
): Promise<string> {
  const { year, month } = formatParts(issuedAt);
  const now = new Date();

  await connection.execute(
    `INSERT INTO topup_receipt_counters (site_id, receipt_year, receipt_month, last_sequence, updated_at)
     VALUES (?, ?, ?, 0, ?)
     ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)`,
    [siteId, year, month, now],
  );

  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT last_sequence
     FROM topup_receipt_counters
     WHERE site_id = ? AND receipt_year = ? AND receipt_month = ?
     FOR UPDATE`,
    [siteId, year, month],
  );
  const nextSequence = Number(rows[0]?.last_sequence ?? 0) + 1;

  await connection.execute(
    `UPDATE topup_receipt_counters
     SET last_sequence = ?, updated_at = ?
     WHERE site_id = ? AND receipt_year = ? AND receipt_month = ?`,
    [nextSequence, now, siteId, year, month],
  );

  return formatTopupReceiptNumber(year, month, nextSequence);
}

async function findTopupCashReceiptWithinTransaction(
  connection: PoolConnection,
  siteId: string,
  topupRequestId: string,
  transactionId: string,
): Promise<TopupCashReceiptSummary | null> {
  const [rows] = await connection.execute<TopupReceiptRow[]>(
    `SELECT *
     FROM topup_cash_receipts
     WHERE site_id = ? AND (topup_request_id = ? OR transaction_id = ?)
     LIMIT 1
     FOR UPDATE`,
    [siteId, topupRequestId, transactionId],
  );
  return rows[0] ? toTopupCashReceipt(rows[0]) : null;
}

export async function createTopupCashReceiptWithinTransaction(
  connection: PoolConnection,
  input: {
    siteId: string;
    topupRequestId: string;
    transactionId: string;
    buyerUserId: string;
    fallbackBuyerName?: string | null;
    issuedAt: Date;
    amountPaid: number;
    basePoints: number;
    bonusPoints: number;
    creditedPoints: number;
    bonusRuleId?: string | null;
  },
): Promise<TopupCashReceiptSummary> {
  const existing = await findTopupCashReceiptWithinTransaction(
    connection,
    input.siteId,
    input.topupRequestId,
    input.transactionId,
  );
  if (existing) return existing;

  const amountPaid = Number(input.amountPaid);
  const basePoints = Number(input.basePoints);
  const bonusPoints = Number(input.bonusPoints);
  const creditedPoints = Number(input.creditedPoints);
  if (
    !Number.isFinite(amountPaid) || amountPaid <= 0 ||
    !Number.isFinite(basePoints) || basePoints < 0 ||
    !Number.isFinite(bonusPoints) || bonusPoints < 0 ||
    !Number.isFinite(creditedPoints) || creditedPoints < 0
  ) {
    throw new Error("ข้อมูลยอดเติมเงินสำหรับออกใบเสร็จไม่ถูกต้อง");
  }

  const receiptNo = await allocateTopupReceiptNumberWithinTransaction(
    connection,
    input.siteId,
    input.issuedAt,
  );
  const seller = await getReceiptSellerSnapshot(connection, input.siteId);
  const buyer = await getReceiptBuyerSnapshot(connection, {
    siteId: input.siteId,
    userId: input.buyerUserId,
    fallbackName: input.fallbackBuyerName,
  });
  const lines: ReceiptLineSnapshot[] = [
    {
      productTypeId: null,
      productName: TOPUP_RECEIPT_PRODUCT_NAME,
      quantity: 1,
      unitPrice: amountPaid,
      amount: amountPaid,
    },
  ];
  const now = new Date();
  const id = randomUUID();

  await connection.execute(
    `INSERT INTO topup_cash_receipts (
       id, site_id, topup_request_id, transaction_id, user_id, receipt_no,
       status, issued_at, amount_paid, base_points, bonus_points, credited_points,
       bonus_rule_id, seller_snapshot, buyer_snapshot, lines_snapshot,
       receipt_note, template_version, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, 'ISSUED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.siteId,
      input.topupRequestId,
      input.transactionId,
      input.buyerUserId,
      receiptNo,
      input.issuedAt,
      amountPaid,
      basePoints,
      bonusPoints,
      creditedPoints,
      input.bonusRuleId ?? null,
      JSON.stringify(seller),
      JSON.stringify(buyer),
      JSON.stringify(lines),
      `อ้างอิง Top-up: ${input.transactionId}`,
      RECEIPT_TEMPLATE_VERSION,
      now,
      now,
    ],
  );

  return {
    id,
    siteId: input.siteId,
    sourceType: "TOPUP",
    caseOrderId: null,
    topupRequestId: input.topupRequestId,
    transactionId: input.transactionId,
    receiptNo,
    status: "ISSUED",
    issuedAt: input.issuedAt.toISOString(),
    totalAmount: amountPaid,
    amountPaid,
    basePoints,
    bonusPoints,
    creditedPoints,
    seller,
    buyer,
    lines,
    templateVersion: RECEIPT_TEMPLATE_VERSION,
  };
}

function parseReceiptDate(...values: Array<Date | string | null | undefined>): Date {
  for (const value of values) {
    if (!value) continue;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isFinite(date.getTime())) return date;
  }
  return new Date();
}

function getReceiptNumbers(input: {
  amount: number | string | null;
  bonusPoints: number | string | null;
  creditedPoints: number | string | null;
}) {
  const amount = Number(input.amount);
  const bonusPoints = Number(input.bonusPoints ?? 0);
  const creditedPoints = Number(input.creditedPoints ?? amount + bonusPoints);
  if (
    !Number.isFinite(amount) || amount <= 0 ||
    !Number.isFinite(bonusPoints) || bonusPoints < 0 ||
    !Number.isFinite(creditedPoints) || creditedPoints < 0
  ) {
    throw new TopupReceiptUnavailableError("ข้อมูลยอดเติมเงินไม่ครบถ้วน จึงยังออกใบเสร็จไม่ได้");
  }
  return { amount, bonusPoints, creditedPoints };
}

function isAllowedTopupReceiptSource(
  sourceType: string | null | undefined,
  transactionId: string | null | undefined,
  qrPayload: string | null | undefined,
): boolean {
  const normalizedSource = (sourceType ?? "SYSTEM").trim().toUpperCase();
  const normalizedTransactionId = transactionId?.trim().toLowerCase();
  const normalizedQrPayload = qrPayload?.trim().toLowerCase();
  if (normalizedSource === "ADMIN") return true;
  return !normalizedTransactionId?.startsWith("manual-") && normalizedQrPayload !== "manual";
}

/**
 * Ensure that a successful event shown in the Admin recent-topup timeline has
 * a printable receipt. New top-ups already create their receipt while being
 * completed; this path fills the compatibility gap for successful legacy
 * history rows that predate the receipt table.
 */
export async function ensureTopupCashReceiptForAdminEvent(
  eventId: string,
  siteId = getSiteId(),
): Promise<{ receipt: TopupCashReceiptSummary; created: boolean }> {
  const match = /^(request|history):(.+)$/.exec(eventId.trim());
  if (!match || !match[2]) throw new TopupReceiptUnavailableError();

  const sourceKind = match[1];
  const sourceId = match[2];
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    let topupRequestId: string;
    let transactionId: string | null;
    let userId: string | null;
    let amount: number | string | null;
    let bonusRuleId: string | null;
    let bonusPoints: number | string | null;
    let creditedPoints: number | string | null;
    let issuedAt: Date;

    if (sourceKind === "request") {
      const [rows] = await connection.execute<AdminTopupRequestReceiptSourceRow[]>(
        `SELECT id, site_id, user_id, transaction_id, amount,
                bonus_rule_id, bonus_points, credited_points, status,
                created_at, updated_at
         FROM topup_requests
         WHERE id = ? AND site_id = ? AND status = 'SUCCEEDED'
         LIMIT 1
         FOR UPDATE`,
        [sourceId, siteId],
      );
      const row = rows[0];
      if (!row) throw new TopupReceiptUnavailableError();

      const [historyRows] = await connection.execute<RowDataPacket[]>(
        `SELECT created_at
         FROM slip_history
         WHERE site_id = ? AND transaction_id = ? AND status = 'success'
         LIMIT 1`,
        [siteId, row.transaction_id],
      );
      topupRequestId = row.id;
      transactionId = row.transaction_id;
      userId = row.user_id;
      amount = row.amount;
      bonusRuleId = row.bonus_rule_id;
      bonusPoints = row.bonus_points;
      creditedPoints = row.credited_points;
      issuedAt = parseReceiptDate(
        historyRows[0]?.created_at,
        row.updated_at,
        row.created_at,
      );
    } else {
      const [rows] = await connection.execute<AdminSlipReceiptSourceRow[]>(
        `SELECT id, site_id, user_id, transaction_id, amount,
                bonus_rule_id, bonus_points, credited_points, status,
                source_type, qr_payload, created_at
         FROM slip_history
         WHERE id = ? AND site_id = ? AND LOWER(status) = 'success'
         LIMIT 1
         FOR UPDATE`,
        [sourceId, siteId],
      );
      const row = rows[0];
      if (!row || !isAllowedTopupReceiptSource(row.source_type, row.transaction_id, row.qr_payload)) {
        throw new TopupReceiptUnavailableError();
      }

      // Legacy slip rows use their own UUID as the receipt source key. There
      // is no foreign key to topup_requests, and the transaction id remains
      // the second idempotency guard for older rows.
      topupRequestId = row.id;
      transactionId = row.transaction_id;
      userId = row.user_id;
      amount = row.amount;
      bonusRuleId = row.bonus_rule_id;
      bonusPoints = row.bonus_points;
      creditedPoints = row.credited_points;
      issuedAt = parseReceiptDate(row.created_at);
    }

    if (!transactionId?.trim() || !userId) {
      throw new TopupReceiptUnavailableError("รายการนี้ไม่มีข้อมูลธุรกรรมครบถ้วน จึงยังออกใบเสร็จไม่ได้");
    }

    const numbers = getReceiptNumbers({ amount, bonusPoints, creditedPoints });
    const existing = await findTopupCashReceiptWithinTransaction(
      connection,
      siteId,
      topupRequestId,
      transactionId,
    );
    const receipt = existing ?? await createTopupCashReceiptWithinTransaction(connection, {
      siteId,
      topupRequestId: topupRequestId.length <= 36 ? topupRequestId : randomUUID(),
      transactionId,
      buyerUserId: userId,
      issuedAt,
      amountPaid: numbers.amount,
      basePoints: numbers.amount,
      bonusPoints: numbers.bonusPoints,
      creditedPoints: numbers.creditedPoints,
      bonusRuleId,
    });

    await connection.commit();
    return { receipt, created: !existing };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getTopupCashReceiptForUser(
  topupRequestId: string,
  buyerUserId: string,
  siteId = getSiteId(),
): Promise<TopupCashReceiptSummary | null> {
  const [rows] = await pool.execute<TopupReceiptRow[]>(
    `SELECT *
     FROM topup_cash_receipts
     WHERE site_id = ? AND topup_request_id = ? AND user_id = ? AND status = 'ISSUED'
     LIMIT 1`,
    [siteId, topupRequestId, buyerUserId],
  );
  return rows[0] ? toTopupCashReceipt(rows[0]) : null;
}

export async function getTopupCashReceiptForUserById(
  receiptId: string,
  buyerUserId: string,
  siteId = getSiteId(),
): Promise<TopupCashReceiptSummary | null> {
  const [rows] = await pool.execute<TopupReceiptRow[]>(
    `SELECT *
     FROM topup_cash_receipts
     WHERE site_id = ? AND id = ? AND user_id = ? AND status = 'ISSUED'
     LIMIT 1`,
    [siteId, receiptId, buyerUserId],
  );
  return rows[0] ? toTopupCashReceipt(rows[0]) : null;
}

export async function getTopupCashReceiptForAdmin(
  topupRequestId: string,
  siteId?: string,
): Promise<TopupCashReceiptSummary | null> {
  const currentSiteId = getSiteId();
  const selectedSiteId = siteId || currentSiteId;
  const siteClause = currentSiteId === "main" && !siteId ? "" : "AND site_id = ?";
  const params = currentSiteId === "main" && !siteId
    ? [topupRequestId]
    : [topupRequestId, selectedSiteId];
  const [rows] = await pool.execute<TopupReceiptRow[]>(
    `SELECT *
     FROM topup_cash_receipts
     WHERE topup_request_id = ? ${siteClause} AND status = 'ISSUED'
     LIMIT 1`,
    params,
  );
  return rows[0] ? toTopupCashReceipt(rows[0]) : null;
}

export async function getTopupCashReceiptForAdminById(
  receiptId: string,
  siteId?: string,
): Promise<TopupCashReceiptSummary | null> {
  const currentSiteId = getSiteId();
  const selectedSiteId = siteId || currentSiteId;
  const siteClause = currentSiteId === "main" && !siteId ? "" : "AND site_id = ?";
  const params = currentSiteId === "main" && !siteId
    ? [receiptId]
    : [receiptId, selectedSiteId];
  const [rows] = await pool.execute<TopupReceiptRow[]>(
    `SELECT *
     FROM topup_cash_receipts
     WHERE id = ? ${siteClause} AND status = 'ISSUED'
     LIMIT 1`,
    params,
  );
  return rows[0] ? toTopupCashReceipt(rows[0]) : null;
}

export async function listTopupCashReceiptsForUser(
  buyerUserId: string,
  options: { siteId?: string; limit?: number } = {},
): Promise<TopupCashReceiptSummary[]> {
  const siteId = options.siteId ?? getSiteId();
  const limit = Math.min(100, Math.max(1, Math.floor(options.limit ?? 50)));
  const [rows] = await pool.execute<TopupReceiptRow[]>(
    `SELECT *
     FROM topup_cash_receipts
     WHERE site_id = ? AND user_id = ? AND status = 'ISSUED'
     ORDER BY issued_at DESC, id DESC
     LIMIT ?`,
    [siteId, buyerUserId, limit],
  );
  return rows.map(toTopupCashReceipt);
}

export type AdminTopupCashReceiptListItem = {
  receipt: TopupCashReceiptSummary;
  sourceType: string;
  sourceLabel: string | null;
  sourceEmail: string | null;
};

export type AdminTopupStatementRow = {
  id: string;
  receiptId: string | null;
  receiptNo: string | null;
  receiptStatus: "ISSUED" | "VOIDED" | null;
  recordedAt: string;
  issuedAt: string | null;
  amount: number;
  basePoints: number;
  bonusPoints: number;
  creditedPoints: number;
  userId: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
  sourceType: "SYSTEM" | "ADMIN";
  sourceLabel: string | null;
  sourceEmail: string | null;
  transactionId: string | null;
  note: string | null;
};

export type AdminTopupStatementResult = {
  rows: AdminTopupStatementRow[];
  summary: {
    totalRows: number;
    totalAmount: number;
    systemRows: number;
    systemAmount: number;
    adminRows: number;
    adminAmount: number;
    rowsWithoutReceipt: number;
    uniqueUsers: number;
    firstRecordedAt: string | null;
    lastRecordedAt: string | null;
  };
  page: number;
  limit: number;
  totalPages: number;
  cutoffAt: string;
  timeZone: string;
};

type TopupStatementHistoryRow = RowDataPacket & {
  id: string;
  site_id: string;
  user_id: string | null;
  transaction_id: string | null;
  amount: number | string | null;
  bonus_points: number | string | null;
  credited_points: number | string | null;
  source_type: string | null;
  source_label: string | null;
  source_email: string | null;
  note: string | null;
  created_at: Date | string | null;
  receipt_id: string | null;
  receipt_no: string | null;
  receipt_status: "ISSUED" | "VOIDED" | null;
  receipt_issued_at: Date | string | null;
  buyer_name: string | null;
  buyer_email: string | null;
};

type TopupStatementBackfillRow = RowDataPacket & {
  id: string;
  site_id: string;
  user_id: string | null;
  transaction_id: string | null;
  amount: number | string | null;
  bonus_rule_id: string | null;
  bonus_points: number | string | null;
  credited_points: number | string | null;
  created_at: Date | string | null;
};

function toStatementDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
    ? value
    : `${value.replace(" ", "T")}+07:00`;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

function toStatementIso(value: Date | string | null | undefined): string | null {
  return toStatementDate(value)?.toISOString() ?? null;
}

function toStatementNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function listTopupCashReceiptsForAdmin(
  options: {
    siteId?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {},
): Promise<{
  rows: AdminTopupCashReceiptListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const siteId = options.siteId ?? getSiteId();
  const limit = Math.min(100, Math.max(1, Math.floor(options.limit ?? 20)));
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const offset = (page - 1) * limit;
  const search = (options.search ?? "").trim().slice(0, 100);
  const searchClause = search
    ? " AND (tcr.receipt_no LIKE ? OR tcr.transaction_id LIKE ? OR u.email LIKE ? OR u.display_name LIKE ?)"
    : "";
  const searchPattern = `%${search}%`;
  const baseParams: Array<string | number> = search
    ? [siteId, searchPattern, searchPattern, searchPattern, searchPattern]
    : [siteId];

  const [countRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM topup_cash_receipts tcr
     LEFT JOIN users u ON u.id = tcr.user_id AND u.site_id = tcr.site_id
     WHERE tcr.site_id = ? AND tcr.status = 'ISSUED'${searchClause}`,
    baseParams,
  );
  const total = Number(countRows[0]?.total ?? 0);

  const [rows] = await pool.execute<TopupReceiptListRow[]>(
    `SELECT tcr.*, s.source_type, s.source_label, s.source_email
     FROM topup_cash_receipts tcr
     LEFT JOIN slip_history s
       ON s.site_id = tcr.site_id AND s.transaction_id = tcr.transaction_id
     LEFT JOIN users u ON u.id = tcr.user_id AND u.site_id = tcr.site_id
     WHERE tcr.site_id = ? AND tcr.status = 'ISSUED'${searchClause}
     ORDER BY tcr.issued_at DESC, tcr.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    baseParams,
  );

  return {
    rows: rows.map((row) => ({
      receipt: toTopupCashReceipt(row),
      sourceType: row.source_type?.trim().toUpperCase() || "SYSTEM",
      sourceLabel: row.source_label,
      sourceEmail: row.source_email,
    })),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

function buildTopupStatementQuery(options: {
  siteId: string;
  search?: string;
  source?: TopupStatementSourceFilter;
  startDate?: string;
  endDate?: string;
}) {
  const source = normalizeTopupStatementSource(options.source);
  const startDate = normalizeTopupReportDate(options.startDate);
  const endDate = normalizeTopupReportDate(options.endDate);
  const dateRange = buildTopupReportDateRange(startDate, endDate);
  const sourceExpression = "UPPER(COALESCE(NULLIF(s.source_type, ''), 'SYSTEM'))";
  const whereParts = [
    "s.site_id = ?",
    "LOWER(s.status) = 'success'",
    "s.created_at >= ?",
  ];
  const params: Array<string | number> = [options.siteId, TOPUP_STATEMENT_CUTOFF];

  if (dateRange.startAt) {
    whereParts.push("s.created_at >= ?");
    params.push(dateRange.startAt);
  }
  if (dateRange.endExclusive) {
    whereParts.push("s.created_at < ?");
    params.push(dateRange.endExclusive);
  }
  if (source === "SYSTEM") {
    whereParts.push(`${sourceExpression} <> 'ADMIN'`);
  } else if (source === "ADMIN") {
    whereParts.push(`${sourceExpression} = 'ADMIN'`);
  }

  const search = (options.search ?? "").trim().slice(0, 100);
  if (search) {
    const pattern = `%${search}%`;
    whereParts.push(`(
      tcr.receipt_no LIKE ? OR
      s.transaction_id LIKE ? OR
      u.email LIKE ? OR
      u.display_name LIKE ? OR
      s.source_label LIKE ? OR
      s.source_email LIKE ? OR
      s.note LIKE ?
    )`);
    params.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern);
  }

  return {
    where: whereParts.join(" AND "),
    params,
    startDate,
    endDate,
    source,
  };
}

export async function listTopupStatementForAdmin(
  options: {
    siteId?: string;
    search?: string;
    source?: TopupStatementSourceFilter;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
    sortOrder?: TopupStatementSortOrder;
  } = {},
): Promise<AdminTopupStatementResult> {
  const siteId = options.siteId ?? getSiteId();
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const limit = Math.min(
    TOPUP_STATEMENT_MAX_PRINT_ROWS,
    Math.max(1, Math.floor(options.limit ?? 50)),
  );
  const offset = (page - 1) * limit;
  const query = buildTopupStatementQuery({ ...options, siteId });
  const orderDirection = options.sortOrder === "asc" ? "ASC" : "DESC";

  const [summaryRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       COUNT(*) AS total_rows,
       COALESCE(SUM(s.amount), 0) AS total_amount,
       SUM(CASE WHEN UPPER(COALESCE(NULLIF(s.source_type, ''), 'SYSTEM')) = 'ADMIN' THEN 1 ELSE 0 END) AS admin_rows,
       COALESCE(SUM(CASE WHEN UPPER(COALESCE(NULLIF(s.source_type, ''), 'SYSTEM')) = 'ADMIN' THEN s.amount ELSE 0 END), 0) AS admin_amount,
       SUM(CASE WHEN UPPER(COALESCE(NULLIF(s.source_type, ''), 'SYSTEM')) <> 'ADMIN' THEN 1 ELSE 0 END) AS system_rows,
       COALESCE(SUM(CASE WHEN UPPER(COALESCE(NULLIF(s.source_type, ''), 'SYSTEM')) <> 'ADMIN' THEN s.amount ELSE 0 END), 0) AS system_amount,
       SUM(CASE WHEN tcr.id IS NULL THEN 1 ELSE 0 END) AS rows_without_receipt,
       COUNT(DISTINCT s.user_id) AS unique_users,
       MIN(s.created_at) AS first_recorded_at,
       MAX(s.created_at) AS last_recorded_at
     FROM slip_history s
     LEFT JOIN topup_cash_receipts tcr
       ON tcr.site_id = s.site_id AND tcr.transaction_id = s.transaction_id
     LEFT JOIN users u
       ON u.id = s.user_id AND u.site_id = s.site_id
     WHERE ${query.where}`,
    query.params,
  );

  const summaryRow = summaryRows[0] ?? {};
  const totalRows = toStatementNumber(summaryRow.total_rows);

  const [rows] = await pool.execute<TopupStatementHistoryRow[]>(
    `SELECT
       s.id,
       s.site_id,
       s.user_id,
       s.transaction_id,
       s.amount,
       s.bonus_points,
       s.credited_points,
       s.source_type,
       s.source_label,
       s.source_email,
       s.note,
       s.created_at,
       tcr.id AS receipt_id,
       tcr.receipt_no,
       tcr.status AS receipt_status,
       tcr.issued_at AS receipt_issued_at,
       u.display_name AS buyer_name,
       u.email AS buyer_email
     FROM slip_history s
     LEFT JOIN topup_cash_receipts tcr
       ON tcr.site_id = s.site_id AND tcr.transaction_id = s.transaction_id
     LEFT JOIN users u
       ON u.id = s.user_id AND u.site_id = s.site_id
     WHERE ${query.where}
     ORDER BY s.created_at ${orderDirection}, s.id ${orderDirection}
     LIMIT ${limit} OFFSET ${offset}`,
    query.params,
  );

  const mappedRows = rows.map((row) => {
    const sourceType = (row.source_type ?? "SYSTEM").trim().toUpperCase() === "ADMIN"
      ? "ADMIN"
      : "SYSTEM";

    return {
      id: row.id,
      receiptId: row.receipt_id,
      receiptNo: row.receipt_no,
      receiptStatus: row.receipt_status,
      recordedAt: toStatementIso(row.created_at) ?? "",
      issuedAt: toStatementIso(row.receipt_issued_at),
      amount: toStatementNumber(row.amount),
      basePoints: toStatementNumber(row.amount),
      bonusPoints: toStatementNumber(row.bonus_points),
      creditedPoints: toStatementNumber(row.credited_points ?? row.amount),
      userId: row.user_id,
      buyerName: row.buyer_name,
      buyerEmail: row.buyer_email,
      sourceType,
      sourceLabel: row.source_label,
      sourceEmail: row.source_email,
      transactionId: row.transaction_id,
      note: row.note,
    } satisfies AdminTopupStatementRow;
  });

  return {
    rows: mappedRows,
    summary: {
      totalRows,
      totalAmount: toStatementNumber(summaryRow.total_amount),
      systemRows: toStatementNumber(summaryRow.system_rows),
      systemAmount: toStatementNumber(summaryRow.system_amount),
      adminRows: toStatementNumber(summaryRow.admin_rows),
      adminAmount: toStatementNumber(summaryRow.admin_amount),
      rowsWithoutReceipt: toStatementNumber(summaryRow.rows_without_receipt),
      uniqueUsers: toStatementNumber(summaryRow.unique_users),
      firstRecordedAt: toStatementIso(summaryRow.first_recorded_at),
      lastRecordedAt: toStatementIso(summaryRow.last_recorded_at),
    },
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(totalRows / limit)),
    cutoffAt: TOPUP_STATEMENT_CUTOFF,
    timeZone: TOPUP_STATEMENT_TIME_ZONE,
  };
}

export async function backfillTopupCashReceiptsForAdmin(options: {
  siteId?: string;
  apply?: boolean;
} = {}): Promise<{
  siteId: string;
  cutoffAt: string;
  eligibleRows: number;
  existingReceiptRows: number;
  missingReceiptRows: number;
  createdReceiptRows: number;
  skippedRows: number;
}> {
  const siteId = options.siteId ?? getSiteId();
  const connection = await pool.getConnection();

  try {
    const [coverageRows] = await connection.execute<RowDataPacket[]>(
      `SELECT
         COUNT(*) AS eligible_rows,
         COUNT(tcr.id) AS existing_receipt_rows,
         COUNT(*) - COUNT(tcr.id) AS missing_receipt_rows
       FROM slip_history s
       LEFT JOIN topup_cash_receipts tcr
         ON tcr.site_id = s.site_id AND tcr.transaction_id = s.transaction_id
       WHERE s.site_id = ?
         AND LOWER(s.status) = 'success'
         AND s.created_at >= ?`,
      [siteId, TOPUP_STATEMENT_CUTOFF],
    );
    const coverage = coverageRows[0] ?? {};
    const eligibleRows = toStatementNumber(coverage.eligible_rows);
    const existingReceiptRows = toStatementNumber(coverage.existing_receipt_rows);
    const missingReceiptRows = toStatementNumber(coverage.missing_receipt_rows);

    if (!options.apply || missingReceiptRows === 0) {
      return {
        siteId,
        cutoffAt: TOPUP_STATEMENT_CUTOFF,
        eligibleRows,
        existingReceiptRows,
        missingReceiptRows,
        createdReceiptRows: 0,
        skippedRows: 0,
      };
    }

    const [rows] = await connection.execute<TopupStatementBackfillRow[]>(
      `SELECT
         s.id,
         s.site_id,
         s.user_id,
         s.transaction_id,
         s.amount,
         s.bonus_rule_id,
         s.bonus_points,
         s.credited_points,
         s.created_at
       FROM slip_history s
       LEFT JOIN topup_cash_receipts tcr
         ON tcr.site_id = s.site_id AND tcr.transaction_id = s.transaction_id
       WHERE s.site_id = ?
         AND LOWER(s.status) = 'success'
         AND s.created_at >= ?
         AND tcr.id IS NULL
       ORDER BY s.created_at ASC, s.id ASC`,
      [siteId, TOPUP_STATEMENT_CUTOFF],
    );

    let createdReceiptRows = 0;
    let skippedRows = 0;
    await connection.beginTransaction();
    try {
      for (const row of rows) {
        const amount = toStatementNumber(row.amount);
        const userId = row.user_id?.trim();
        const transactionId = row.transaction_id?.trim();
        const issuedAt = toStatementDate(row.created_at);

        if (
          !userId ||
          !transactionId ||
          !issuedAt ||
          !Number.isFinite(amount) ||
          amount <= 0
        ) {
          skippedRows += 1;
          continue;
        }

        const [requestRows] = await connection.execute<RowDataPacket[]>(
          `SELECT id
           FROM topup_requests
           WHERE site_id = ? AND transaction_id = ? AND status = 'SUCCEEDED'
           ORDER BY created_at ASC, id ASC
           LIMIT 1`,
          [siteId, transactionId],
        );
        const topupRequestId = String(requestRows[0]?.id ?? row.id);

        await createTopupCashReceiptWithinTransaction(connection, {
          siteId,
          topupRequestId,
          transactionId,
          buyerUserId: userId,
          issuedAt,
          amountPaid: amount,
          basePoints: amount,
          bonusPoints: toStatementNumber(row.bonus_points),
          creditedPoints: toStatementNumber(row.credited_points ?? amount),
          bonusRuleId: row.bonus_rule_id,
        });
        createdReceiptRows += 1;
      }
      if (skippedRows > 0) {
        throw new Error(`ไม่สามารถออกใบเสร็จให้รายการเติมเงิน ${skippedRows} รายการได้`);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }

    return {
      siteId,
      cutoffAt: TOPUP_STATEMENT_CUTOFF,
      eligibleRows,
      existingReceiptRows,
      missingReceiptRows,
      createdReceiptRows,
      skippedRows,
    };
  } finally {
    connection.release();
  }
}
