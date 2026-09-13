import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/server";
import { getAuthTokenFromCookies } from "@/lib/auth/session";
import { getSiteId } from "@/lib/site";
import {
  VISITOR_COOKIE_MAX_AGE_SECONDS,
  VISITOR_COOKIE_NAME,
  resolveVisitorId,
} from "@/lib/analytics/visitor";
import { recordPwaInstall } from "@/lib/analytics/pwa-repository";
import { consumeRequestRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";

const payloadSchema = z.object({
  visitorId: z.string().optional(),
  platform: z.enum(["android", "ios", "windows", "mac", "other"]).default("other"),
  deviceType: z.enum(["mobile", "tablet", "desktop"]).default("mobile"),
  source: z.string().trim().min(1).max(64).default("appinstalled_event"),
});

function noStoreResponse(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return response;
}

export async function POST(request: NextRequest) {
  const rateLimit = consumeRequestRateLimit(request, {
    scope: "analytics:pwa-install",
    limit: 60,
    windowMs: 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return rateLimitResponse("มีการส่งข้อมูลถี่เกินไป กรุณาลองใหม่ภายหลัง", rateLimit);
  }

  try {
    const rawBody = await request.json().catch(() => ({}));
    const parsed = payloadSchema.safeParse(rawBody);
    if (!parsed.success) {
      return noStoreResponse({ message: "Invalid payload", errors: parsed.error.format() }, 422);
    }

    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(VISITOR_COOKIE_NAME)?.value;
    const visitorId = resolveVisitorId(parsed.data.visitorId, cookieValue);

    const token = await getAuthTokenFromCookies();
    const user = token ? await getCurrentUser() : null;
    const siteId = getSiteId();
    const userAgent = request.headers.get("user-agent") || null;

    const result = await recordPwaInstall({
      siteId,
      visitorId,
      userId: user?.id ?? null,
      platform: parsed.data.platform,
      deviceType: parsed.data.deviceType,
      source: parsed.data.source,
      userAgent,
    });

    const response = noStoreResponse({ ok: true, ...result });

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
    console.error("Error recording PWA install:", error instanceof Error ? error.message : "unknown error");
    return noStoreResponse({ message: "Unable to record PWA install" }, 503);
  }
}
