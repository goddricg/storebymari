import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireMainSiteSuperAdminApi } from "@/lib/auth/api";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";
import {
  listTopupStatementForAdmin,
} from "@/lib/receipts/topup-repository";
import {
  TOPUP_STATEMENT_MAX_PRINT_ROWS,
  normalizeTopupStatementSource,
} from "@/lib/topup/statement";
import { normalizeTopupReportDate } from "@/lib/topup/report-time";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({
  search: z.string().trim().max(100).optional().default(""),
  source: z.enum(["ALL", "SYSTEM", "ADMIN"]).optional().default("ALL"),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(TOPUP_STATEMENT_MAX_PRINT_ROWS).optional().default(50),
});

function noStore(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return response;
}

export async function GET(request: NextRequest) {
  const authorization = await requireMainSiteSuperAdminApi();
  if (authorization.response) return authorization.response;

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    search: searchParams.get("search") ?? "",
    source: searchParams.get("source") ?? "ALL",
    startDate: searchParams.get("startDate") ?? undefined,
    endDate: searchParams.get("endDate") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return noStore({ message: "เงื่อนไข Statement ไม่ถูกต้อง" }, 422);

  const startDate = normalizeTopupReportDate(parsed.data.startDate);
  const endDate = normalizeTopupReportDate(parsed.data.endDate);
  if ((parsed.data.startDate && !startDate) || (parsed.data.endDate && !endDate)) {
    return noStore({ message: "รูปแบบวันที่ไม่ถูกต้อง" }, 422);
  }
  if (startDate && endDate && startDate > endDate) {
    return noStore({ message: "วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด" }, 422);
  }

  const source = normalizeTopupStatementSource(parsed.data.source);

  try {
    const result = await listTopupStatementForAdmin({
      search: parsed.data.search,
      source,
      startDate,
      endDate,
      page: parsed.data.page,
      limit: parsed.data.limit,
    });

    await recordAdminAuditEvent({
      actor: authorization.user,
      action: "TOPUP_STATEMENT_VIEW",
      category: "finance",
      severity: "medium",
      entityType: "topup_statement",
      after: {
        source,
        startDate: startDate ?? null,
        endDate: endDate ?? null,
        page: result.page,
        limit: result.limit,
        totalRows: result.summary.totalRows,
        searchProvided: Boolean(parsed.data.search),
      },
      details: "Viewed the top-up statement report",
      ...getAdminAuditRequestContext(request),
    });

    return noStore({
      rows: result.rows.map((row) => ({
        id: row.id,
        receipt_id: row.receiptId,
        receipt_no: row.receiptNo,
        receipt_status: row.receiptStatus,
        recorded_at: row.recordedAt,
        issued_at: row.issuedAt,
        amount: row.amount,
        base_points: row.basePoints,
        bonus_points: row.bonusPoints,
        credited_points: row.creditedPoints,
        user_id: row.userId,
        buyer_name: row.buyerName,
        buyer_email: row.buyerEmail,
        source_type: row.sourceType,
        source_label: row.sourceLabel,
        source_email: row.sourceEmail,
        transaction_id: row.transactionId,
        note: row.note,
      })),
      summary: result.summary,
      meta: {
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        cutoffAt: result.cutoffAt,
        timeZone: result.timeZone,
        filters: {
          source,
          startDate: startDate ?? null,
          endDate: endDate ?? null,
          search: parsed.data.search || null,
        },
      },
    });
  } catch (error) {
    console.error("Admin top-up statement failed:", error);
    return noStore({ message: "ไม่สามารถโหลด Statement เติมเงินได้" }, 500);
  }
}
