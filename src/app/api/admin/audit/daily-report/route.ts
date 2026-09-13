import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/server";
import { isSuperAdminUser } from "@/lib/auth/roles";
import { getSiteId } from "@/lib/site";
import { getAdminDailyWorkReport } from "@/lib/audit/admin-audit-daily-report";
import { getDateOnlyInTopupTimeZone, normalizeTopupReportDate } from "@/lib/topup/report-time";

const querySchema = z.object({
  date: z.string().trim().max(32).optional(),
  actorId: z.string().trim().max(128).optional(),
});

function noStoreResponse(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return response;
}

function forbiddenResponse() {
  return noStoreResponse({ message: "Forbidden" }, 403);
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const siteId = getSiteId();

  if (!user) return noStoreResponse({ message: "Unauthorized" }, 401);
  if (siteId !== "main" || !isSuperAdminUser(user)) return forbiddenResponse();

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    return noStoreResponse({ message: "Invalid query parameters", errors: parsed.error.flatten() }, 422);
  }

  const today = getDateOnlyInTopupTimeZone();
  const rawDate = parsed.data.date?.trim();
  const date = rawDate ? normalizeTopupReportDate(rawDate) || today : today;
  const actorId = parsed.data.actorId?.trim() || undefined;

  try {
    const report = await getAdminDailyWorkReport({
      siteId,
      date,
      actorId,
    });
    return noStoreResponse(report);
  } catch (error) {
    console.error("[daily-report] Error generating admin daily report:", error);
    return noStoreResponse({ message: "ไม่สามารถสร้างรายงานประจำวันได้" }, 500);
  }
}
