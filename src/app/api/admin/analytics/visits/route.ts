import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { RowDataPacket } from "mysql2/promise";

import { getCurrentUser } from "@/lib/auth/server";
import pool from "@/lib/mysql";
import { getSiteId } from "@/lib/site";
import {
  analyticsSqlDateFormat,
  fillAnalyticsBuckets,
  normalizeAnalyticsDateRange,
  type AnalyticsPoint,
  type AnalyticsTimeframe,
} from "@/lib/analytics/time";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";

const querySchema = z.object({
  timeframe: z.enum(["hourly", "daily", "monthly", "yearly"]).default("daily"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

type AnalyticsDbRow = RowDataPacket & {
  bucket_label: string;
  visits: string | number;
  unique_visitors: string | number;
};

type AnalyticsTotalRow = RowDataPacket & {
  total_visits: string | number;
  total_unique_visitors: string | number;
};

function noStoreResponse(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return response;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return noStoreResponse({ message: "Unauthorized" }, 401);
    if (!(user.role === "superadmin" || user.role === "admin" || user.isAdmin)) {
      return noStoreResponse({ message: "Forbidden" }, 403);
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      timeframe: searchParams.get("timeframe") ?? "daily",
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
    });

    if (!parsed.success) return noStoreResponse({ message: "Invalid analytics query" }, 422);

    const timeframe = parsed.data.timeframe as AnalyticsTimeframe;
    const dateRange = normalizeAnalyticsDateRange(parsed.data.startDate, parsed.data.endDate);
    if ("error" in dateRange) return noStoreResponse({ message: dateRange.error }, 422);

    const siteId = getSiteId();
    const params = [siteId, dateRange.startAt, dateRange.endExclusive];
    const sqlDateFormat = analyticsSqlDateFormat(timeframe);

    const [bucketRows] = await pool.execute<AnalyticsDbRow[]>(
      `SELECT
        DATE_FORMAT(v.visited_at, '${sqlDateFormat}') AS bucket_label,
        COUNT(*) AS visits,
        COUNT(DISTINCT v.visitor_id) AS unique_visitors
      FROM site_analytics_visits v
      WHERE v.site_id = ?
        AND v.visited_at >= ?
        AND v.visited_at < ?
      GROUP BY bucket_label
      ORDER BY bucket_label ASC`,
      params,
    );

    const [totalRows] = await pool.execute<AnalyticsTotalRow[]>(
      `SELECT
        COUNT(*) AS total_visits,
        COUNT(DISTINCT v.visitor_id) AS total_unique_visitors
      FROM site_analytics_visits v
      WHERE v.site_id = ?
        AND v.visited_at >= ?
        AND v.visited_at < ?`,
      params,
    );

    const rawData: AnalyticsPoint[] = bucketRows.map((row) => ({
      label: row.bucket_label,
      visits: Number(row.visits ?? 0),
      uniqueVisitors: Number(row.unique_visitors ?? 0),
    }));
    const data = fillAnalyticsBuckets(rawData, dateRange.startDate, dateRange.endDate, timeframe);
    const totals = totalRows[0];

    await recordAdminAuditEvent({
      actor: user,
      action: "ANALYTICS_VISITS_VIEW",
      category: "analytics",
      severity: "low",
      after: {
        timeframe,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        totalVisits: Number(totals?.total_visits ?? 0),
        totalUniqueVisitors: Number(totals?.total_unique_visitors ?? 0),
      },
      details: "Viewed the site visit analytics dashboard",
      ...getAdminAuditRequestContext(request),
    });

    return noStoreResponse({
      data,
      meta: {
        timeframe,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        totalVisits: Number(totals?.total_visits ?? 0),
        totalUniqueVisitors: Number(totals?.total_unique_visitors ?? 0),
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error loading analytics visits:", error instanceof Error ? error.message : "unknown error");
    return noStoreResponse({ message: "Unable to load analytics visits" }, 503);
  }
}
