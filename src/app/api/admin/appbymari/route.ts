import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireSuperAdmin } from "@/lib/auth/server";
import { getSiteId } from "@/lib/site";
import { getAppByMariProvider, testAppByMariConnection } from "@/lib/appbymari/client";
import { getAdminAuditRequestContext, recordAdminAuditEvent } from "@/lib/audit/admin-audit";

const bodySchema = z.object({ apiKey: z.string().trim().max(255).optional() });

function noStoreJson(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return response;
}

export async function POST(request: NextRequest) {
  try {
    const me = await requireSuperAdmin();
    if (getSiteId() !== "main") return noStoreJson({ message: "เมนูนี้ใช้งานได้เฉพาะร้านหลัก" }, 403);
    if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
      return noStoreJson({ message: "รูปแบบข้อมูลไม่ถูกต้อง" }, 415);
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return noStoreJson({ message: "API key ไม่ถูกต้อง" }, 400);
    const provider = await getAppByMariProvider();
    const apiKey = parsed.data.apiKey?.trim() || provider?.apiKey?.trim() || "";
    if (!apiKey) return noStoreJson({ message: "ยังไม่ได้ตั้งค่า API key" }, 400);

    const result = await testAppByMariConnection({ apiKey });
    await recordAdminAuditEvent({
      actor: me,
      action: "APPBYMARI_CONNECTION_TEST",
      category: "configuration",
      severity: "high",
      entityType: "api_provider",
      entityId: provider?.id ?? null,
      entityLabel: "Store By Mari ร้านหลัก",
      after: { success: true, productCount: result.productCount, hasApiKey: true },
      details: "Tested Store By Mari connection; API key and remote balance were excluded",
      ...getAdminAuditRequestContext(request),
    });
    return noStoreJson({
      success: true,
      message: result.siteName
        ? `เชื่อมต่อสำเร็จ: ${result.siteName}`
        : "เชื่อมต่อ Store By Mari สำเร็จ",
      productCount: result.productCount,
    });
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error
      ? Number(error.status)
      : 0;
    const responseStatus = status === 401 || status === 403 ? 401 : 502;
    return noStoreJson({
      success: false,
      message: responseStatus === 401
        ? "API key ไม่ถูกต้องหรือถูกปิดใช้งาน"
        : "เชื่อมต่อ Store By Mari ไม่สำเร็จ กรุณาตรวจสอบ API endpoint และลองใหม่",
    }, responseStatus);
  }
}
