import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { RowDataPacket } from "mysql2/promise";
import { requireMainSiteSuperAdminApi } from "@/lib/auth/api";
import pool from "@/lib/mysql";
import { getSiteId } from "@/lib/site";
import {
  addTopupReportDays,
  buildTopupReportDateRange,
  normalizeTopupReportDate,
} from "@/lib/topup/report-time";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";

const querySchema = z.object({
  timeframe: z.enum(["daily", "monthly", "yearly"]).default("daily"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  q: z.string().optional(),
});

type ChartDbRow = RowDataPacket & {
  date_label: string;
  total_amount: string | number;
  topup_count: string | number;
  unique_users: string | number;
};

export async function GET(request: NextRequest) {
  try {
    const authorization = await requireMainSiteSuperAdminApi();
    if (authorization.response) return authorization.response;

    const siteId = getSiteId();

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      timeframe: searchParams.get("timeframe") || "daily",
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
      q: searchParams.get("q") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ message: "Invalid query", errors: parsed.error }, { status: 422 });
    }

    const { timeframe } = parsed.data;
    const startDate = normalizeTopupReportDate(parsed.data.startDate);
    const endDate = normalizeTopupReportDate(parsed.data.endDate);

    if ((parsed.data.startDate && !startDate) || (parsed.data.endDate && !endDate)) {
      return NextResponse.json({ message: "Invalid date filter" }, { status: 422 });
    }
    if (startDate && endDate && startDate > endDate) {
      return NextResponse.json({ message: "Start date must not be after end date" }, { status: 422 });
    }

    const dateRange = buildTopupReportDateRange(startDate, endDate);

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
    // We intentionally removed q from here as per user request to not filter chart by q
    // Wait! Actually, the user asked not to filter the *chart*, but what about the new summary table? 
    // They said "เป็นตารางคล้ายๆกับ สรุปยอดเติมเงินแยกตามตัวแทน แต่เราจะทำเป็น รายวัน รายเดือน รายปี สามารถดูได้ด้วย"
    // Usually a timeline summary doesn't filter by name, but if they want it, we could. The plan said we removed it. I'll keep it removed.

    let dateFormat = "'%Y-%m-%d'"; // daily
    if (timeframe === "monthly") {
      dateFormat = "'%Y-%m'";
    } else if (timeframe === "yearly") {
      dateFormat = "'%Y'";
    }

    const query = `
      SELECT 
        DATE_FORMAT(s.created_at, ${dateFormat}) AS date_label,
        SUM(s.amount) AS total_amount,
        COUNT(s.id) AS topup_count,
        COUNT(DISTINCT s.user_id) AS unique_users
      FROM slip_history s
      INNER JOIN users u ON s.user_id = u.id AND s.site_id = u.site_id
      WHERE ${slipWhere}
      GROUP BY date_label
      ORDER BY date_label ASC
    `;

    const [rows] = await pool.execute<ChartDbRow[]>(query, slipParams);

    const chartData = rows.map((r) => ({
      date: r.date_label,
      amount: Number(r.total_amount) || 0,
      count: Number(r.topup_count) || 0,
      users: Number(r.unique_users) || 0,
    }));

    // Fill missing dates with 0
    let filledData = chartData;
    if (chartData.length > 0 && startDate && endDate) {
      filledData = [];
      const dataMap = new Map(chartData.map((d) => [d.date, d]));

      if (timeframe === "daily") {
        for (let current = startDate; current <= endDate; current = addTopupReportDays(current, 1)) {
          const existing = dataMap.get(current);
          filledData.push(existing || { date: current, amount: 0, count: 0, users: 0 });
        }
      } else if (timeframe === "monthly") {
        for (
          let current = `${startDate.slice(0, 7)}-01`;
          current.slice(0, 7) <= endDate.slice(0, 7);
          current = addTopupReportDays(current, 32).slice(0, 7) + "-01"
        ) {
          const label = current.slice(0, 7);
          const existing = dataMap.get(label);
          filledData.push(existing || { date: label, amount: 0, count: 0, users: 0 });
        }
      } else {
        for (
          let year = Number(startDate.slice(0, 4));
          year <= Number(endDate.slice(0, 4));
          year += 1
        ) {
          const label = String(year);
          const existing = dataMap.get(label);
          filledData.push(existing || { date: label, amount: 0, count: 0, users: 0 });
        }
      }
    }

    const data = filledData.length > 0 ? filledData : chartData;
    await recordAdminAuditEvent({
      actor: authorization.user,
      action: "TOPUP_CHART_VIEW",
      category: "finance",
      severity: "medium",
      entityType: "topup_report",
      after: {
        timeframe,
        points: data.length,
        startDate: startDate ?? null,
        endDate: endDate ?? null,
      },
      details: "Viewed the topup chart report",
      ...getAdminAuditRequestContext(request),
    });
    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error in topups chart API:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
