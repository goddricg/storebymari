import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/server";
import { isAdminUser } from "@/lib/auth/roles";
import { getSiteId } from "@/lib/site";
import { getPwaInstallStats } from "@/lib/analytics/pwa-repository";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";

const querySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

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

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
    });

    if (!parsed.success) {
      return noStoreResponse({ message: "Invalid query parameters" }, 422);
    }

    const siteId = getSiteId();
    const stats = await getPwaInstallStats({
      siteId,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
    });

    await recordAdminAuditEvent({
      actor: user,
      action: "ANALYTICS_PWA_INSTALLS_VIEW",
      category: "analytics",
      severity: "low",
      after: {
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        totalInstalls: stats.totalInstalls,
        todayInstalls: stats.todayInstalls,
      },
      details: "Viewed PWA installation analytics",
      ...getAdminAuditRequestContext(request),
    });

    return noStoreResponse(stats);
  } catch (error) {
    console.error("Error loading PWA install stats:", error instanceof Error ? error.message : "unknown error");
    return noStoreResponse({ message: "Unable to load PWA install stats" }, 503);
  }
}
