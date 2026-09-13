import { NextRequest, NextResponse } from "next/server";

import { requireMainSiteSuperAdminApi } from "@/lib/auth/api";
import {
  listPurchaseCasesForAdmin,
  type AdminPurchaseCaseFilters,
} from "@/lib/purchase-cases/repository";
import type { PurchaseCaseStatus } from "@/lib/purchase-cases/types";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";

const VALID_STATUSES = new Set<PurchaseCaseStatus>([
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
]);

function noStore(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return response;
}

export async function GET(request: NextRequest) {
  const authorization = await requireMainSiteSuperAdminApi();
  if (authorization.response) return authorization.response;

  const { searchParams } = new URL(request.url);
  const rawStatus = searchParams.get("status");
  const filters: AdminPurchaseCaseFilters = {
    siteId: searchParams.get("siteId"),
    search: searchParams.get("search"),
    status: rawStatus && VALID_STATUSES.has(rawStatus as PurchaseCaseStatus)
      ? rawStatus as PurchaseCaseStatus
      : null,
    startDate: searchParams.get("startDate"),
    endDate: searchParams.get("endDate"),
    limit: Number(searchParams.get("limit") || 50),
    offset: Number(searchParams.get("offset") || 0),
  };

  try {
    const result = await listPurchaseCasesForAdmin(filters);
    await recordAdminAuditEvent({
      actor: authorization.user,
      action: "PURCHASE_CASES_VIEW",
      category: "finance",
      severity: "medium",
      entityType: "purchase_cases",
      after: { total: result.total, filters },
      details: "Viewed purchase cases and cash receipts",
      ...getAdminAuditRequestContext(request),
    });
    return noStore(result);
  } catch (error) {
    console.error("Purchase cases admin GET failed:", error);
    return noStore({ message: "ไม่สามารถโหลด Case Order ได้" }, 500);
  }
}
