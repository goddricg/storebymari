import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { RowDataPacket } from "mysql2/promise";
import { requireMainSiteSuperAdminApi } from "@/lib/auth/api";
import pool from "@/lib/mysql";
import { getSiteId } from "@/lib/site";
import { buildTopupReportDateRange, normalizeTopupReportDate } from "@/lib/topup/report-time";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";

const querySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

type TopupSummaryRow = {
  user_id: string;
  email: string;
  display_name: string | null;
  topup_count: number;
  total_amount: number;
  total_bonus: number;
  total_credited: number;
  last_topup_at: string | null;
};

type TopupSummaryResponse = {
  rows: TopupSummaryRow[];
  meta: {
    total_users: number;
    grand_total_amount: number;
    grand_total_bonus: number;
    grand_total_credited: number;
    grand_total_count: number;
    limit: number;
    offset: number;
  };
};

type GrandTotalsRow = RowDataPacket & {
  grand_total_amount: string | number;
  grand_total_bonus: string | number;
  grand_total_credited: string | number;
  grand_total_count: string | number;
};

type TotalUsersRow = RowDataPacket & {
  total_users: string | number;
};

type SummaryDbRow = RowDataPacket & {
  user_id: string;
  email: string | null;
  display_name: string | null;
  topup_count: string | number;
  total_amount: string | number;
  total_bonus: string | number;
  total_credited: string | number;
  last_topup_at: string | Date | null;
};

export async function GET(request: NextRequest) {
  try {
    const authorization = await requireMainSiteSuperAdminApi();
    if (authorization.response) return authorization.response;

    const siteId = getSiteId();

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ message: "Invalid query" }, { status: 422 });
    }

    const { q, limit, offset } = parsed.data;
    const startDate = normalizeTopupReportDate(parsed.data.startDate);
    const endDate = normalizeTopupReportDate(parsed.data.endDate);

    if ((parsed.data.startDate && !startDate) || (parsed.data.endDate && !endDate)) {
      return NextResponse.json({ message: "Invalid date filter" }, { status: 422 });
    }
    if (startDate && endDate && startDate > endDate) {
      return NextResponse.json({ message: "Start date must not be after end date" }, { status: 422 });
    }

    const dateRange = buildTopupReportDateRange(startDate, endDate);

    const limitVal = Math.min(limit ?? 20, 20);
    const offsetVal = offset ?? 0;

    const slipParams: Array<string | number> = [];
    let slipWhere = "s.status = 'success' AND s.site_id = ?";
    slipParams.push(siteId);
    if (dateRange.startAt) {
      slipWhere += " AND s.created_at >= ?";
      slipParams.push(dateRange.startAt);
    }
    if (dateRange.endExclusive) {
      slipWhere += " AND s.created_at < ?";
      slipParams.push(dateRange.endExclusive);
    }
    if (q && q.trim().length > 0) {
      slipWhere += " AND (u.email LIKE ? OR u.display_name LIKE ?)";
      slipParams.push(`%${q.trim()}%`, `%${q.trim()}%`);
    }

    // Grand totals
    const [grandTotals] = await pool.execute(
      `SELECT COALESCE(SUM(s.amount), 0) AS grand_total_amount,
              COALESCE(SUM(s.bonus_points), 0) AS grand_total_bonus,
              COALESCE(SUM(COALESCE(s.credited_points, s.amount)), 0) AS grand_total_credited,
              COUNT(s.id) AS grand_total_count
       FROM slip_history s
       INNER JOIN users u ON s.user_id = u.id AND s.site_id = u.site_id
       WHERE ${slipWhere}`,
      slipParams
    );
    const gt = (grandTotals as GrandTotalsRow[])[0];
    const grandTotalAmount = Number(gt.grand_total_amount);
    const grandTotalBonus = Number(gt.grand_total_bonus);
    const grandTotalCredited = Number(gt.grand_total_credited);
    const grandTotalCount = Number(gt.grand_total_count);

    // Total Users count (for pagination)
    const [totalUsersRows] = await pool.execute(
      `SELECT COUNT(DISTINCT s.user_id) AS total_users
       FROM slip_history s
       INNER JOIN users u ON s.user_id = u.id AND s.site_id = u.site_id
       WHERE ${slipWhere}`,
      slipParams
    );
    const totalUsers = Number((totalUsersRows as TotalUsersRow[])[0].total_users);

    // Fetch summary rows with pagination
    const summaryQuery = `
      SELECT 
        u.id AS user_id,
        u.email,
        u.display_name,
        COUNT(s.id) AS topup_count,
        SUM(s.amount) AS total_amount,
        SUM(COALESCE(s.bonus_points, 0)) AS total_bonus,
        SUM(COALESCE(s.credited_points, s.amount)) AS total_credited,
        MAX(s.created_at) AS last_topup_at
      FROM users u
      INNER JOIN slip_history s ON s.user_id = u.id AND s.site_id = u.site_id
      WHERE ${slipWhere}
      GROUP BY u.id 
      ORDER BY total_amount DESC
      LIMIT ? OFFSET ?
    `;
    const queryParams = [...slipParams, limitVal, offsetVal];

    const [summaryRows] = await pool.execute(summaryQuery, queryParams);
    const rows = (summaryRows as SummaryDbRow[]).map((r) => ({
      user_id: r.user_id,
      email: r.email || "unknown@unknown.com",
      display_name: r.display_name ?? null,
      topup_count: Number(r.topup_count),
      total_amount: Number(r.total_amount),
      total_bonus: Number(r.total_bonus),
      total_credited: Number(r.total_credited),
      last_topup_at: r.last_topup_at ? new Date(r.last_topup_at).toISOString() : null,
    }));

    const result: TopupSummaryResponse = {
      rows: rows,
      meta: {
        total_users: totalUsers,
        grand_total_amount: grandTotalAmount,
        grand_total_bonus: grandTotalBonus,
        grand_total_credited: grandTotalCredited,
        grand_total_count: grandTotalCount,
        limit: limitVal,
        offset: offsetVal,
      },
    };

    await recordAdminAuditEvent({
      actor: authorization.user,
      action: "TOPUP_SUMMARY_VIEW",
      category: "finance",
      severity: "medium",
      entityType: "topup_report",
      after: {
        rowCount: rows.length,
        totalUsers,
        grandTotalCount,
        startDate: startDate ?? null,
        endDate: endDate ?? null,
      },
      details: "Viewed the topup summary report",
      ...getAdminAuditRequestContext(request),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in topups summary API:", error);
    const message =
      error instanceof Error ? error.message : "ไม่สามารถดึงข้อมูลรายงานเติมเงินได้";

    return NextResponse.json({ message }, { status: 500 });
  }
}
