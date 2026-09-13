import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/server";
import { isAdminUser } from "@/lib/auth/roles";
import {
  listProductSalesHistory,
  PRODUCT_SALES_HISTORY_PAGE_SIZE,
} from "@/lib/orders/product-sales-history";
import {
  buildTopupReportDateRange,
  normalizeTopupReportDate,
} from "@/lib/topup/report-time";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  searchUser: z.string().trim().max(160).optional(),
  searchProductEmail: z.string().trim().max(160).optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
});

function noStoreJson(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return response;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return noStoreJson({ message: "Unauthorized" }, 401);
    if (!isAdminUser(user)) return noStoreJson({ message: "Forbidden" }, 403);

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      searchUser: searchParams.get("searchUser") ?? undefined,
      searchProductEmail: searchParams.get("searchProductEmail") ?? undefined,
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
    });

    if (!parsed.success) {
      return noStoreJson({ message: "Invalid product sales history query" }, 422);
    }

    const startDate = parsed.data.startDate
      ? normalizeTopupReportDate(parsed.data.startDate)
      : undefined;
    const endDate = parsed.data.endDate
      ? normalizeTopupReportDate(parsed.data.endDate)
      : undefined;

    if ((parsed.data.startDate && !startDate) || (parsed.data.endDate && !endDate)) {
      return noStoreJson({ message: "Invalid date" }, 422);
    }

    if (startDate && endDate && startDate > endDate) {
      return noStoreJson({ message: "Start date must not be after end date" }, 422);
    }

    const dateRange = buildTopupReportDateRange(startDate, endDate);
    const result = await listProductSalesHistory({
      page: parsed.data.page,
      searchUser: parsed.data.searchUser,
      searchProductEmail: parsed.data.searchProductEmail,
      startAt: dateRange.startAt,
      endExclusive: dateRange.endExclusive,
    });

    await recordAdminAuditEvent({
      actor: user,
      action: "SALES_HISTORY_VIEW",
      category: "audit",
      severity: "medium",
      entityType: "sales_history",
      after: {
        page: parsed.data.page,
        total: result.total,
        hasUserSearch: Boolean(parsed.data.searchUser),
        hasProductEmailSearch: Boolean(parsed.data.searchProductEmail),
        startDate: dateRange.startDate ?? null,
        endDate: dateRange.endDate ?? null,
      },
      details: "Viewed product sales history; delivered product data was not copied into audit storage",
      ...getAdminAuditRequestContext(request),
    });

    return noStoreJson({
      items: result.items,
      meta: {
        page: parsed.data.page,
        pageSize: PRODUCT_SALES_HISTORY_PAGE_SIZE,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / PRODUCT_SALES_HISTORY_PAGE_SIZE)),
        startDate: dateRange.startDate ?? null,
        endDate: dateRange.endDate ?? null,
        timeZone: "Asia/Bangkok",
      },
    });
  } catch (error) {
    console.error(
      "Error loading product sales history",
      error instanceof Error ? error.message : "unknown error",
    );
    return noStoreJson({ message: "Unable to load product sales history" }, 503);
  }
}
