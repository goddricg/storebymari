import { NextRequest, NextResponse } from "next/server";
import { requireMainSiteSuperAdminApi } from "@/lib/auth/api";
import { listAllOrders } from "@/lib/orders/repository";
import pool from "@/lib/mysql";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";

export async function GET(request: NextRequest) {
  try {
    const authorization = await requireMainSiteSuperAdminApi();
    if (authorization.response) return authorization.response;

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const apiProviderId = searchParams.get("apiProviderId") || undefined;
    const searchEmail = searchParams.get("searchEmail") || undefined;
    const searchProductDetails = searchParams.get("searchProductDetails") || undefined;
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const isLocalParam = searchParams.get("isLocal");
    const isLocal = isLocalParam === "true" ? true : isLocalParam === "false" ? false : null;
    const targetSiteId = searchParams.get("targetSiteId") || undefined;

    const result = await listAllOrders(
      limit, 
      offset, 
      apiProviderId || null, 
      searchEmail || null,
      searchProductDetails || null,
      startDate || null,
      endDate || null,
      isLocal,
      targetSiteId || null
    );

    // ดึงรายชื่อเว็บที่มีทั้งหมดจากฐานข้อมูลอย่างไดนามิก
    const [siteRows] = await pool.execute("SELECT DISTINCT site_id FROM users");
    const siteIds = (siteRows as any[]).map((r) => r.site_id);

    const [settingRows] = await pool.execute("SELECT site_id, value FROM settings WHERE `key` = 'site_name'");
    const siteNamesMap = (settingRows as any[]).reduce((acc, row) => {
      acc[row.site_id] = row.value;
      return acc;
    }, {} as Record<string, string>);

    const sites = siteIds.map((id) => {
      let name = siteNamesMap[id];
      if (!name) {
        if (id === "main") name = "Appbymari";
        else if (id === "child1") name = "PremiumBySom";
        else if (id === "child2") name = "JaoBam";
        else name = id;
      }
      return { id, name };
    });

    await recordAdminAuditEvent({
      actor: authorization.user,
      action: "SALES_REPORT_VIEW",
      category: "finance",
      severity: "medium",
      entityType: "sales_report",
      after: {
        total: result.total,
        limit,
        offset,
        isLocal,
        targetSiteId: targetSiteId ?? null,
      },
      details: "Viewed the sales report",
      ...getAdminAuditRequestContext(request),
    });

    return NextResponse.json({ 
      orders: result.orders,
      total: result.total,
      sites
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ไม่สามารถดึงข้อมูลประวัติการขายได้";

    return NextResponse.json({ message }, { status: 500 });
  }
}

