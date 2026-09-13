import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/server";
import { isSuperAdminUser } from "@/lib/auth/roles";
import { getSiteId } from "@/lib/site";
import {
  findAdminAuditEvent,
  listAdminAuditEvents,
} from "@/lib/audit/admin-audit-repository";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";
import { normalizeTopupReportDate } from "@/lib/topup/report-time";

const querySchema = z.object({
  id: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  startDate: z.string().trim().max(32).optional(),
  endDate: z.string().trim().max(32).optional(),
  search: z.string().trim().max(100).optional(),
  action: z.string().trim().max(80).optional(),
  category: z.string().trim().max(40).optional(),
  result: z.string().trim().max(16).optional(),
  severity: z.string().trim().max(16).optional(),
  entityType: z.string().trim().max(80).optional(),
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

  // The full audit center is intentionally owner-only and main-site-only.
  // Child sites and ordinary admins cannot query this data through the API.
  if (!user) return noStoreResponse({ message: "Unauthorized" }, 401);
  if (siteId !== "main" || !isSuperAdminUser(user)) return forbiddenResponse();

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!parsed.success) {
    return noStoreResponse({ message: "Invalid audit query", errors: parsed.error.flatten() }, 422);
  }

  const startDate = parsed.data.startDate
    ? normalizeTopupReportDate(parsed.data.startDate)
    : undefined;
  const endDate = parsed.data.endDate
    ? normalizeTopupReportDate(parsed.data.endDate)
    : undefined;

  if ((parsed.data.startDate && !startDate) || (parsed.data.endDate && !endDate)) {
    return noStoreResponse({ message: "Invalid audit date range" }, 422);
  }
  if (startDate && endDate && startDate > endDate) {
    return noStoreResponse({ message: "Start date must not be after end date" }, 422);
  }

  const requestContext = getAdminAuditRequestContext(request);

  try {
    if (parsed.data.id) {
      const event = await findAdminAuditEvent(parsed.data.id, siteId);
      if (!event) return noStoreResponse({ message: "Audit event not found" }, 404);

      await recordAdminAuditEvent({
        actor: user,
        action: "AUDIT_DETAIL_VIEW",
        category: "audit",
        severity: "low",
        entityType: "admin_audit_event",
        entityId: event.id,
        entityLabel: event.action,
        details: "Viewed an administrative audit event detail",
        requestId: requestContext.requestId,
        route: requestContext.route,
        method: requestContext.method,
        userAgent: requestContext.userAgent,
      });

      return noStoreResponse({ event });
    }

    const result = await listAdminAuditEvents({
      siteId,
      page: parsed.data.page,
      limit: parsed.data.limit,
      startDate,
      endDate,
      search: parsed.data.search,
      action: parsed.data.action,
      category: parsed.data.category,
      result: parsed.data.result,
      severity: parsed.data.severity,
      entityType: parsed.data.entityType,
      actorId: parsed.data.actorId,
    });

    await recordAdminAuditEvent({
      actor: user,
      action: "AUDIT_LIST_VIEW",
      category: "audit",
      severity: "low",
      details: "Viewed the administrative audit list",
      requestId: requestContext.requestId,
      route: requestContext.route,
      method: requestContext.method,
      userAgent: requestContext.userAgent,
    });

    return noStoreResponse({
      ...result,
      meta: {
        siteId,
        startDate: startDate ?? null,
        endDate: endDate ?? null,
        timeZone: "Asia/Bangkok",
      },
    });
  } catch (error) {
    console.error(
      "[Admin Audit] Failed to load events:",
      error instanceof Error ? error.message : "unknown error",
    );
    return noStoreResponse({ message: "Unable to load admin audit events" }, 503);
  }
}
