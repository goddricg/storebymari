import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";

import { requireMainSiteSuperAdminApi } from "@/lib/auth/api";
import pool from "@/lib/mysql";
import { getSiteId } from "@/lib/site";
import { buildTopupReportDateRange, normalizeTopupReportDate } from "@/lib/topup/report-time";
import {
  getTopupFailureReason,
  getTopupSourceLabel,
  getTopupStatusLabel,
  parseSavedTopupError,
  type TopupEventStatus,
} from "@/lib/topup/history";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";

const querySchema = z.object({
  date: z.string().min(1),
  page: z.coerce.number().int().min(1).optional().default(1),
});

type RecentTopupDbRow = RowDataPacket & {
  event_id: string;
  user_id: string | null;
  email: string | null;
  display_name: string | null;
  amount: number | string | null;
  bonus_points: number | string | null;
  credited_points: number | string | null;
  status: string;
  transaction_id: string | null;
  created_at: string | null;
  failure_reason: string | null;
  error_code: string | null;
  saved_response: string | null;
  source_type: string | null;
  source_label: string | null;
  source_email: string | null;
  note: string | null;
  qr_payload: string | null;
  topup_receipt_id: string | null;
  topup_receipt_no: string | null;
};

const topupEventUnion = `
  SELECT
    CONCAT('attempt:', tah.id) AS event_id,
    tah.site_id,
    tah.user_id,
    u.email,
    u.display_name,
    tah.amount,
    0 AS bonus_points,
    NULL AS credited_points,
    'failed' AS status,
    tah.transaction_id,
    tah.created_at,
    tah.failure_reason,
    tah.error_code,
    NULL AS saved_response,
    'SYSTEM' AS source_type,
    NULL AS source_label,
    NULL AS source_email,
    NULL AS note,
    NULL AS qr_payload,
    NULL AS topup_receipt_id,
    NULL AS topup_receipt_no
  FROM topup_attempt_history tah
  LEFT JOIN users u ON u.id = tah.user_id AND u.site_id = tah.site_id

  UNION ALL

  SELECT
    CONCAT('request:', tr.id) AS event_id,
    tr.site_id,
    tr.user_id,
    u.email,
    u.display_name,
    tr.amount,
    tr.bonus_points,
    tr.credited_points,
    CASE tr.status
      WHEN 'SUCCEEDED' THEN 'success'
      WHEN 'FAILED' THEN 'failed'
      ELSE 'pending'
    END AS status,
    tr.transaction_id,
    tr.created_at,
    tr.failure_reason,
    tr.error_code,
    tr.saved_response,
    'SYSTEM' AS source_type,
    NULL AS source_label,
    NULL AS source_email,
    NULL AS note,
    NULL AS qr_payload,
    tcr.id AS topup_receipt_id,
    tcr.receipt_no AS topup_receipt_no
  FROM topup_requests tr
  LEFT JOIN users u ON u.id = tr.user_id AND u.site_id = tr.site_id
  LEFT JOIN topup_cash_receipts tcr
    ON tcr.site_id = tr.site_id AND tcr.topup_request_id = tr.id
  WHERE tr.status IN ('SUCCEEDED', 'PROCESSING')

  UNION ALL

  SELECT
    CONCAT('history:', s.id) AS event_id,
    s.site_id,
    s.user_id,
    u.email,
    u.display_name,
    s.amount,
    s.bonus_points,
    s.credited_points,
    CASE LOWER(s.status)
      WHEN 'success' THEN 'success'
      WHEN 'pending' THEN 'pending'
      ELSE 'failed'
    END AS status,
    s.transaction_id,
    s.created_at,
    NULL AS failure_reason,
    NULL AS error_code,
    NULL AS saved_response,
    s.source_type,
    s.source_label,
    s.source_email,
    s.note,
    s.qr_payload,
    tcr.id AS topup_receipt_id,
    tcr.receipt_no AS topup_receipt_no
  FROM slip_history s
  LEFT JOIN users u ON u.id = s.user_id AND u.site_id = s.site_id
  LEFT JOIN topup_cash_receipts tcr
    ON tcr.site_id = s.site_id AND tcr.transaction_id = s.transaction_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM topup_requests tr2
    WHERE tr2.site_id = s.site_id
      AND tr2.transaction_id IS NOT NULL
      AND tr2.transaction_id = s.transaction_id
  )
`;

export async function GET(request: NextRequest) {
  try {
    const authorization = await requireMainSiteSuperAdminApi();
    if (authorization.response) return authorization.response;

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      date: searchParams.get("date") ?? "",
      page: searchParams.get("page") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ message: "วันที่ไม่ถูกต้อง" }, { status: 422 });
    }

    const date = normalizeTopupReportDate(parsed.data.date);
    if (!date) {
      return NextResponse.json({ message: "Invalid date" }, { status: 422 });
    }

    const siteId = getSiteId();
    const dateRange = buildTopupReportDateRange(date, date);
    const limit = 10;
    const offset = (parsed.data.page - 1) * limit;
    const where = `events.site_id = ?
      AND events.created_at >= ?
      AND events.created_at < ?`;
    const baseParams = [siteId, dateRange.startAt!, dateRange.endExclusive!];

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM (${topupEventUnion}) events
       WHERE ${where}`,
      baseParams
    );
    const total = Number((countRows as Array<{ total: number | string }>)[0]?.total ?? 0);

    const [rows] = await pool.execute<RecentTopupDbRow[]>(
      `SELECT events.*
       FROM (${topupEventUnion}) events
       WHERE ${where}
       ORDER BY events.created_at DESC, events.event_id DESC
       LIMIT ? OFFSET ?`,
      [...baseParams, limit, offset]
    );

    await recordAdminAuditEvent({
      actor: authorization.user,
      action: "TOPUP_RECENT_VIEW",
      category: "finance",
      severity: "medium",
      entityType: "topup_report",
      after: { date, page: parsed.data.page, total },
      details: "Viewed the recent topup report",
      ...getAdminAuditRequestContext(request),
    });

    const response = NextResponse.json({
      date,
      rows: rows.map((row) => {
        const status = (row.status === "success" || row.status === "failed" || row.status === "pending"
          ? row.status
          : "pending") as TopupEventStatus;
        const normalizedSourceType = (row.source_type ?? "").trim().toUpperCase();
        const normalizedTransactionId = row.transaction_id?.trim().toLowerCase();
        const normalizedQrPayload = row.qr_payload?.trim().toLowerCase();
        const isManual =
          normalizedSourceType === "ADMIN" ||
          normalizedTransactionId?.startsWith("manual-") === true ||
          normalizedQrPayload === "manual";
        const canIssueReceiptSource = !isManual || normalizedSourceType === "ADMIN";
        const savedError = parseSavedTopupError(row.saved_response);
        const note = status === "failed"
          ? row.failure_reason || getTopupFailureReason(row.error_code, savedError)
          : row.note || (status === "pending" ? "กำลังตรวจสอบรายการ" : "พ้อยท์ถูกเติมเงินสำเร็จ");

        return {
          id: row.event_id,
          user_id: row.user_id,
          email: row.email,
          display_name: row.display_name,
          amount: row.amount === null ? null : Number(row.amount),
          bonus_points: row.bonus_points === null ? 0 : Number(row.bonus_points),
          credited_points: row.credited_points === null
            ? (row.amount === null ? null : Number(row.amount))
            : Number(row.credited_points),
          status,
          status_label: getTopupStatusLabel(status),
          note,
          source: getTopupSourceLabel({
            sourceType: row.source_type,
            sourceLabel: row.source_label,
            sourceEmail: row.source_email,
            isManual,
          }),
          transaction_id: row.transaction_id,
          created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
          topup_receipt_id: row.topup_receipt_id,
          topup_receipt_no: row.topup_receipt_no,
          can_issue_receipt:
            status === "success" &&
            !row.topup_receipt_id &&
            canIssueReceiptSource &&
            row.user_id?.trim().length !== 0 &&
            row.transaction_id?.trim().length !== 0 &&
            Number.isFinite(Number(row.amount)) &&
            Number(row.amount) > 0,
        };
      }),
      meta: {
        total,
        page: parsed.data.page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  } catch (error) {
    console.error("Error in recent topups API:", error);
    return NextResponse.json(
      { message: "ไม่สามารถโหลดประวัติการเติมเงินล่าสุดได้" },
      { status: 500 }
    );
  }
}
