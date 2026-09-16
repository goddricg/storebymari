import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireSuperAdmin } from "@/lib/auth/server";
import { getSiteId } from "@/lib/site";
import {
  getAppByMariProductsForAdmin,
  updateAppByMariProductSettings,
} from "@/lib/appbymari/repository";
import { getAdminAuditRequestContext, recordAdminAuditEvent } from "@/lib/audit/admin-audit";

const updateSchema = z.object({
  sourceTypeId: z.string().trim().min(1).max(255),
  salePrice: z.number().finite().min(0).max(999999999).optional(),
  isEnabled: z.boolean().optional(),
  imageUrl: z.string().trim().max(2048).nullable().optional().refine((value) => {
    if (value === undefined || value === null || value === "") return true;
    return (
      (value.startsWith("/") && !value.startsWith("//")) ||
      /^https:\/\//i.test(value)
    );
  }, "รูปภาพต้องเป็น URL HTTPS หรือ path ภายในเว็บไซต์"),
}).refine((value) => (
  value.salePrice !== undefined ||
  value.isEnabled !== undefined ||
  value.imageUrl !== undefined
), {
  message: "ต้องระบุราคาขาย สถานะ หรือรูปภาพ",
});

function noStoreJson(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return response;
}

export async function GET() {
  try {
    await requireSuperAdmin();
    if (getSiteId() !== "main") return noStoreJson({ message: "เมนูนี้ใช้งานได้เฉพาะร้านหลัก" }, 403);
    return noStoreJson({ products: await getAppByMariProductsForAdmin("main") });
  } catch {
    return noStoreJson({ message: "ไม่สามารถโหลดรายการสินค้า AppByMari ได้" }, 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const me = await requireSuperAdmin();
    if (getSiteId() !== "main") return noStoreJson({ message: "เมนูนี้ใช้งานได้เฉพาะร้านหลัก" }, 403);
    if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
      return noStoreJson({ message: "รูปแบบข้อมูลไม่ถูกต้อง" }, 415);
    }
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return noStoreJson({ message: "ข้อมูลสินค้าไม่ถูกต้อง" }, 400);
    const before = (await getAppByMariProductsForAdmin("main"))
      .find((product) => product.sourceTypeId === parsed.data.sourceTypeId);
    const product = await updateAppByMariProductSettings({ ...parsed.data, siteId: "main" });
    if (!product) return noStoreJson({ message: "ไม่พบสินค้าจาก AppByMari กรุณา Sync ก่อน" }, 404);

    await recordAdminAuditEvent({
      actor: me,
      action: parsed.data.imageUrl !== undefined
        ? "APPBYMARI_IMAGE_UPDATE"
        : parsed.data.salePrice !== undefined
          ? "APPBYMARI_PRICE_UPDATE"
          : "APPBYMARI_VISIBILITY_UPDATE",
      category: "catalog",
      severity: "high",
      entityType: "appbymari_product",
      entityId: product.id,
      entityLabel: product.name,
      changes: {
        ...(parsed.data.salePrice !== undefined
          ? { salePrice: { old: before?.salePrice ?? null, new: product.salePrice } }
          : {}),
        ...(parsed.data.isEnabled !== undefined
          ? { isEnabled: { old: before?.isEnabled ?? null, new: product.isEnabled } }
          : {}),
        ...(parsed.data.imageUrl !== undefined
          ? { imageOverride: { old: before?.hasImageOverride ?? false, new: product.hasImageOverride } }
          : {}),
      },
      details: "Updated AppByMari storefront presentation settings; source catalog fields remain read-only",
      ...getAdminAuditRequestContext(request),
    });
    return noStoreJson({ success: true, product });
  } catch {
    return noStoreJson({ message: "ไม่สามารถอัปเดตสินค้า AppByMari ได้" }, 500);
  }
}
