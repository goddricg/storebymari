import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { getCurrentUser } from "@/lib/auth/server";
import { isAdminUser } from "@/lib/auth/roles";
import pool from "@/lib/mysql";
import { getSiteId } from "@/lib/site";
import { PRESENCE_STALE_SECONDS, toAnalyticsIso } from "@/lib/analytics/time";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";

type PresenceCountRow = RowDataPacket & {
  active_sessions: string | number;
  active_visitors: string | number;
  active_users: string | number;
  active_anonymous_visitors: string | number;
};

type PresenceUserRow = RowDataPacket & {
  user_id: string;
  email: string | null;
  display_name: string | null;
  page_path: string;
  first_seen_at: Date | string;
  last_seen_at: Date | string;
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
    if (!isAdminUser(user)) {
      return noStoreResponse({ message: "Forbidden" }, 403);
    }
    const siteId = getSiteId();

    const [countRows] = await pool.execute<PresenceCountRow[]>(
      `SELECT
        COUNT(*) AS active_sessions,
        COUNT(DISTINCT CASE
          WHEN u.id IS NULL THEN CONCAT('visitor:', p.visitor_id)
          ELSE CONCAT('user:', u.id)
        END) AS active_visitors,
        COUNT(DISTINCT u.id) AS active_users,
        COUNT(DISTINCT CASE WHEN u.id IS NULL THEN p.visitor_id END) AS active_anonymous_visitors
      FROM site_analytics_presence p
      LEFT JOIN users u
        ON u.id = p.user_id
        AND u.site_id = p.site_id
        AND COALESCE(u.is_active, 1) = 1
        AND COALESCE(u.is_banned, 0) = 0
      WHERE p.site_id = ?
        AND p.last_seen_at >= DATE_SUB(NOW(6), INTERVAL ${PRESENCE_STALE_SECONDS} SECOND)`,
      [siteId],
    );

    const [userRows] = await pool.execute<PresenceUserRow[]>(
      `SELECT
        p.user_id,
        u.email,
        u.display_name,
        p.page_path,
        p.first_seen_at,
        p.last_seen_at
      FROM site_analytics_presence p
      INNER JOIN users u
        ON u.id = p.user_id
        AND u.site_id = p.site_id
        AND COALESCE(u.is_active, 1) = 1
        AND COALESCE(u.is_banned, 0) = 0
      WHERE p.site_id = ?
        AND p.last_seen_at >= DATE_SUB(NOW(6), INTERVAL ${PRESENCE_STALE_SECONDS} SECOND)
      ORDER BY p.last_seen_at DESC
      LIMIT 200`,
      [siteId],
    );

    const users = new Map<string, {
      id: string;
      email: string | null;
      displayName: string | null;
      pagePath: string;
      firstSeenAt: string | null;
      lastSeenAt: string | null;
    }>();

    for (const row of userRows) {
      if (users.has(row.user_id)) continue;
      users.set(row.user_id, {
        id: row.user_id,
        email: row.email,
        displayName: row.display_name,
        pagePath: row.page_path,
        firstSeenAt: toAnalyticsIso(row.first_seen_at),
        lastSeenAt: toAnalyticsIso(row.last_seen_at),
      });
    }

    const counts = countRows[0];
    await recordAdminAuditEvent({
      actor: user,
      action: "ANALYTICS_PRESENCE_VIEW",
      category: "analytics",
      severity: "low",
      after: {
        activeSessions: Number(counts?.active_sessions ?? 0),
        activeVisitors: Number(counts?.active_visitors ?? 0),
        activeUsers: Number(counts?.active_users ?? 0),
        activeAnonymousVisitors: Number(counts?.active_anonymous_visitors ?? 0),
      },
      details: "Viewed the realtime site presence dashboard",
      ...getAdminAuditRequestContext(request),
    });

    return noStoreResponse({
      asOf: new Date().toISOString(),
      staleAfterSeconds: PRESENCE_STALE_SECONDS,
      activeSessions: Number(counts?.active_sessions ?? 0),
      activeVisitors: Number(counts?.active_visitors ?? 0),
      activeUsers: Number(counts?.active_users ?? 0),
      activeAnonymousVisitors: Number(counts?.active_anonymous_visitors ?? 0),
      users: Array.from(users.values()),
    });
  } catch (error) {
    console.error("Error loading analytics presence:", error instanceof Error ? error.message : "unknown error");
    return noStoreResponse({ message: "Unable to load analytics presence" }, 503);
  }
}
