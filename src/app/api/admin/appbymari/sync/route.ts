import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

import { requireSuperAdmin } from "@/lib/auth/server";
import { getSiteId } from "@/lib/site";
import { getAppByMariProvider, fetchAppByMariProducts } from "@/lib/appbymari/client";
import { upsertAppByMariProducts } from "@/lib/appbymari/repository";
import { getAdminAuditRequestContext, recordAdminAuditEvent } from "@/lib/audit/admin-audit";

function noStoreJson(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return response;
}

export async function POST(request: NextRequest) {
  try {
    const me = await requireSuperAdmin();
    if (getSiteId() !== "main") return noStoreJson({ message: "เมนูนี้ใช้งานได้เฉพาะร้านหลัก" }, 403);
    const provider = await getAppByMariProvider();
    if (!provider?.isActive || !provider.apiKey) {
      return noStoreJson({ success: false, message: "กรุณาตั้งค่าและเปิดใช้งาน API key ก่อน Sync" }, 400);
    }
    const products = await fetchAppByMariProducts({ provider });
    const count = await upsertAppByMariProducts(products, provider.id, "main");
    await recordAdminAuditEvent({
      actor: me,
      action: "APPBYMARI_PRODUCTS_SYNC",
      category: "system",
      severity: "high",
      entityType: "appbymari_catalog",
      entityId: provider.id,
      entityLabel: "AppByMari ร้านหลัก",
      after: { importedCount: count },
      details: "Synchronized AppByMari products; credentials and API key were excluded",
      ...getAdminAuditRequestContext(request),
    });
    revalidatePath("/");
    revalidatePath("/products");
    revalidatePath("/api/products");
    (revalidateTag as any)("products");
    return noStoreJson({ success: true, count });
  } catch {
    return noStoreJson({ success: false, message: "ไม่สามารถ Sync สินค้าจาก AppByMari ได้" }, 502);
  }
}
