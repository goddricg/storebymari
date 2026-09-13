import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/server";
import { getAuthTokenFromCookies } from "@/lib/auth/session";
import pool from "@/lib/mysql";
import { getSiteId } from "@/lib/site";
import {
  VISITOR_COOKIE_MAX_AGE_SECONDS,
  VISITOR_COOKIE_NAME,
  normalizeAnalyticsPagePath,
  resolveVisitorId,
} from "@/lib/analytics/visitor";
import { consumeRequestRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";

const payloadSchema = z.object({
  visitorId: z.string().optional(),
  pagePath: z.string().trim().min(1).max(512),
});

function noStoreResponse(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return response;
}

export async function POST(request: NextRequest) {
  const rateLimit = consumeRequestRateLimit(request, {
    scope: "analytics:presence",
    limit: 120,
    windowMs: 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return rateLimitResponse("มีการส่งสถานะออนไลน์ถี่เกินไป กรุณาลองใหม่ภายหลัง", rateLimit);
  }

  try {
    const parsed = payloadSchema.safeParse(await request.json());
    if (!parsed.success) return noStoreResponse({ message: "Invalid analytics payload" }, 422);

    const pagePath = normalizeAnalyticsPagePath(parsed.data.pagePath);
    if (!pagePath) return noStoreResponse({ message: "Invalid page path" }, 422);

    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(VISITOR_COOKIE_NAME)?.value;
    const visitorId = resolveVisitorId(parsed.data.visitorId, cookieValue);
    const token = await getAuthTokenFromCookies();
    const user = token ? await getCurrentUser() : null;
    const siteId = getSiteId();

    await pool.execute(
      `INSERT INTO site_analytics_presence (
        site_id, visitor_id, user_id, page_path, first_seen_at, last_seen_at
      ) VALUES (?, ?, ?, ?, NOW(6), NOW(6))
      ON DUPLICATE KEY UPDATE
        user_id = VALUES(user_id),
        page_path = VALUES(page_path),
        last_seen_at = NOW(6)`,
      [siteId, visitorId, user?.id ?? null, pagePath],
    );

    await pool.execute(
      "DELETE FROM site_analytics_presence WHERE site_id = ? AND last_seen_at < DATE_SUB(NOW(6), INTERVAL 1 DAY)",
      [siteId],
    );

    const response = noStoreResponse({ ok: true });
    if (cookieValue !== visitorId) {
      response.cookies.set({
        name: VISITOR_COOKIE_NAME,
        value: visitorId,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
      });
    }
    return response;
  } catch (error) {
    console.error("Error recording analytics presence:", error instanceof Error ? error.message : "unknown error");
    return noStoreResponse({ message: "Unable to record presence" }, 503);
  }
}
