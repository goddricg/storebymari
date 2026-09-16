import { randomUUID } from "crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

import pool from "@/lib/mysql";
import { getSiteId } from "@/lib/site";
import { RECEIPT_FIXED_SELLER } from "@/lib/receipts/template";
import { resolveSiteBrandLogo, SITE_BRAND_LOGO_PATH } from "@/lib/site-branding";
import type {
  CashReceiptSummary,
  ReceiptBuyerSnapshot,
  ReceiptLineSnapshot,
  ReceiptSellerSnapshot,
} from "@/lib/receipts/types";

export const RECEIPT_TEMPLATE_VERSION = "v6-recp-new-v1";
export const RECEIPT_ELIGIBLE_FROM = new Date("2026-08-26T00:00:00+07:00");

export const DEFAULT_RECEIPT_SELLER: ReceiptSellerSnapshot = {
  name: RECEIPT_FIXED_SELLER.name,
  address: RECEIPT_FIXED_SELLER.address,
  email: RECEIPT_FIXED_SELLER.email,
  phone: RECEIPT_FIXED_SELLER.phone,
  footer: RECEIPT_FIXED_SELLER.footer,
  logoUrl: SITE_BRAND_LOGO_PATH,
};

type ReceiptRow = RowDataPacket & {
  id: string;
  site_id: string;
  case_order_id: string;
  receipt_no: string;
  status: "ISSUED" | "VOIDED";
  issued_at: Date | string;
  total_amount: number | string;
  seller_snapshot: string;
  buyer_snapshot: string;
  lines_snapshot: string;
  template_version: string;
};

type SettingsRow = RowDataPacket & { key: string; value: string | null };

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

function formatParts(value: Date | string): { year: number; month: number; day: number } {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value ?? date.getUTCFullYear()),
    month: Number(parts.find((part) => part.type === "month")?.value ?? date.getUTCMonth() + 1),
    day: Number(parts.find((part) => part.type === "day")?.value ?? date.getUTCDate()),
  };
}

export function isReceiptEligible(value: Date | string | null | undefined): boolean {
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() >= RECEIPT_ELIGIBLE_FROM.getTime();
}

export function formatReceiptNumber(year: number, month: number, sequence: number): string {
  return `RECP-${year}-${String(month).padStart(2, "0")}-${String(sequence).padStart(3, "0")}`;
}

export function toCashReceipt(row: ReceiptRow): CashReceiptSummary {
  return {
    id: row.id,
    siteId: row.site_id,
    caseOrderId: row.case_order_id,
    receiptNo: row.receipt_no,
    status: row.status,
    issuedAt: asIso(row.issued_at),
    totalAmount: Number(row.total_amount ?? 0),
    seller: parseSnapshot(row.seller_snapshot, DEFAULT_RECEIPT_SELLER),
    buyer: (() => {
      const buyer = parseSnapshot<Partial<ReceiptBuyerSnapshot>>(row.buyer_snapshot, {});
      return {
        name: buyer.name || "ลูกค้าทั่วไป",
        address: buyer.address ?? null,
        taxId: buyer.taxId ?? null,
        phone: buyer.phone ?? null,
        email: buyer.email ?? null,
      };
    })(),
    lines: parseSnapshot<ReceiptLineSnapshot[]>(row.lines_snapshot, []),
    templateVersion: row.template_version || RECEIPT_TEMPLATE_VERSION,
  };
}

export async function getReceiptSellerSnapshot(
  connection: PoolConnection,
  siteId: string,
): Promise<ReceiptSellerSnapshot> {
  const [rows] = await connection.execute<SettingsRow[]>(
    `SELECT \`key\`, value
     FROM settings
     WHERE site_id = ?
       AND \`key\` IN (?, ?, ?, ?, ?, ?)`,
    [
      siteId,
      "receipt_seller_name",
      "receipt_seller_address",
      "receipt_seller_email",
      "receipt_seller_phone",
      "receipt_footer",
      "site_logo_url",
    ],
  );
  const values = new Map(rows.map((row) => [row.key, row.value?.trim() || ""]));

  return {
    name: values.get("receipt_seller_name") || DEFAULT_RECEIPT_SELLER.name,
    address: values.get("receipt_seller_address") || DEFAULT_RECEIPT_SELLER.address,
    email: values.get("receipt_seller_email") || DEFAULT_RECEIPT_SELLER.email,
    phone: values.get("receipt_seller_phone") || DEFAULT_RECEIPT_SELLER.phone,
    footer: values.get("receipt_footer") || DEFAULT_RECEIPT_SELLER.footer,
    logoUrl: resolveSiteBrandLogo(values.get("site_logo_url")),
  };
}

export async function getReceiptBuyerSnapshot(
  connection: PoolConnection,
  input: {
    siteId: string;
    userId: string;
    fallbackName?: string | null;
  },
): Promise<ReceiptBuyerSnapshot> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT
       u.email,
       u.display_name,
       b.full_name,
       b.address_line1,
       b.address_line2,
       b.subdistrict,
       b.district,
       b.province,
       b.postal_code,
       b.tax_id,
       b.phone
     FROM users u
     LEFT JOIN user_billing_profiles b
       ON b.site_id = u.site_id AND b.user_id = u.id
     WHERE u.id = ? AND u.site_id = ?
     LIMIT 1`,
    [input.userId, input.siteId],
  );
  const row = rows[0];
  const addressParts = [
    row?.address_line1,
    row?.address_line2,
    row?.subdistrict ? `แขวง/ตำบล ${row.subdistrict}` : null,
    row?.district ? `เขต/อำเภอ ${row.district}` : null,
    row?.province,
    row?.postal_code,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  return {
    name: String(row?.full_name || row?.display_name || input.fallbackName || row?.email || "ลูกค้าทั่วไป"),
    address: addressParts.length > 0 ? addressParts.join(" ") : null,
    taxId: row?.tax_id ? String(row.tax_id) : null,
    phone: row?.phone ? String(row.phone) : null,
    email: row?.email ? String(row.email) : null,
  };
}

export async function allocateReceiptNumberWithinTransaction(
  connection: PoolConnection,
  siteId: string,
  issuedAt: Date,
): Promise<string> {
  const { year, month } = formatParts(issuedAt);
  const now = new Date();

  await connection.execute(
    `INSERT INTO receipt_counters (site_id, receipt_year, receipt_month, last_sequence, updated_at)
     VALUES (?, ?, ?, 0, ?)
     ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)`,
    [siteId, year, month, now],
  );

  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT last_sequence
     FROM receipt_counters
     WHERE site_id = ? AND receipt_year = ? AND receipt_month = ?
     FOR UPDATE`,
    [siteId, year, month],
  );
  const nextSequence = Number(rows[0]?.last_sequence ?? 0) + 1;
  await connection.execute(
    `UPDATE receipt_counters
     SET last_sequence = ?, updated_at = ?
     WHERE site_id = ? AND receipt_year = ? AND receipt_month = ?`,
    [nextSequence, now, siteId, year, month],
  );

  return formatReceiptNumber(year, month, nextSequence);
}

export async function createCashReceiptWithinTransaction(
  connection: PoolConnection,
  input: {
    siteId: string;
    caseOrderId: string;
    buyerUserId: string;
    fallbackBuyerName?: string | null;
    issuedAt: Date;
    totalAmount: number;
    lines: ReceiptLineSnapshot[];
  },
): Promise<CashReceiptSummary> {
  const [existingRows] = await connection.execute<ReceiptRow[]>(
    `SELECT *
     FROM cash_receipts
     WHERE site_id = ? AND case_order_id = ?
     LIMIT 1
     FOR UPDATE`,
    [input.siteId, input.caseOrderId],
  );
  if (existingRows[0]) return toCashReceipt(existingRows[0]);

  if (!isReceiptEligible(input.issuedAt)) {
    throw new Error("Receipt is not eligible before 2026-08-26.");
  }

  const receiptNo = await allocateReceiptNumberWithinTransaction(
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
  const now = new Date();
  const id = randomUUID();

  await connection.execute(
    `INSERT INTO cash_receipts (
       id, site_id, case_order_id, receipt_no, status, issued_at,
       total_amount, seller_snapshot, buyer_snapshot, lines_snapshot,
       template_version, created_at, updated_at
     ) VALUES (?, ?, ?, ?, 'ISSUED', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.siteId,
      input.caseOrderId,
      receiptNo,
      input.issuedAt,
      input.totalAmount,
      JSON.stringify(seller),
      JSON.stringify(buyer),
      JSON.stringify(input.lines),
      RECEIPT_TEMPLATE_VERSION,
      now,
      now,
    ],
  );

  return {
    id,
    siteId: input.siteId,
    caseOrderId: input.caseOrderId,
    receiptNo,
    status: "ISSUED",
    issuedAt: input.issuedAt.toISOString(),
    totalAmount: input.totalAmount,
    seller,
    buyer,
    lines: input.lines,
    templateVersion: RECEIPT_TEMPLATE_VERSION,
  };
}

export async function getCashReceiptForCase(
  caseOrderId: string,
  buyerUserId: string,
  siteId = getSiteId(),
): Promise<CashReceiptSummary | null> {
  const [rows] = await pool.execute<ReceiptRow[]>(
    `SELECT r.*
     FROM cash_receipts r
     INNER JOIN purchase_cases c
       ON c.id = r.case_order_id AND c.site_id = r.site_id
     WHERE r.site_id = ? AND r.case_order_id = ? AND c.buyer_user_id = ?
       AND c.status = 'COMPLETED' AND r.status = 'ISSUED'
     LIMIT 1`,
    [siteId, caseOrderId, buyerUserId],
  );
  return rows[0] ? toCashReceipt(rows[0]) : null;
}

export async function getCashReceiptForAdmin(
  caseOrderId: string,
  siteId?: string,
): Promise<CashReceiptSummary | null> {
  const currentSiteId = getSiteId();
  const selectedSiteId = siteId || currentSiteId;
  const siteClause = currentSiteId === "main" && !siteId ? "" : "AND r.site_id = ?";
  const params = currentSiteId === "main" && !siteId
    ? [caseOrderId]
    : [caseOrderId, selectedSiteId];
  const [rows] = await pool.execute<ReceiptRow[]>(
    `SELECT r.*
     FROM cash_receipts r
     INNER JOIN purchase_cases c
       ON c.id = r.case_order_id AND c.site_id = r.site_id
     WHERE r.case_order_id = ? ${siteClause}
       AND c.status = 'COMPLETED' AND r.status = 'ISSUED'
     LIMIT 1`,
    params,
  );
  return rows[0] ? toCashReceipt(rows[0]) : null;
}
