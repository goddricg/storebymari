import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireSuperAdmin } from "@/lib/auth/server";
import { getSiteId } from "@/lib/site";
import {
  createApiProvider,
  updateApiProvider,
} from "@/lib/api-providers/repository";
import {
  APPBYMARI_API_BASE_URL,
  APPBYMARI_PROVIDER_DISPLAY_NAME,
  APPBYMARI_PROVIDER_NAME,
} from "@/lib/appbymari/types";
import { getAppByMariProvider, testAppByMariConnection } from "@/lib/appbymari/client";
import { getAppByMariProductStats } from "@/lib/appbymari/repository";
import { getAdminAuditRequestContext, recordAdminAuditEvent } from "@/lib/audit/admin-audit";

const bodySchema = z.object({ apiKey: z.string().trim().max(255).optional() });
const configSchema = z.object({
  apiKey: z.string().trim().max(255).optional(),
  clearApiKey: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

function noStoreJson(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return response;
}

function ensureMainSite() {
  return getSiteId() === "main";
}

export async function GET() {
  try {
    await requireSuperAdmin();
    if (!ensureMainSite()) return noStoreJson({ message: "เมนูนี้ใช้งานได้เฉพาะร้านหลัก" }, 403);

    const [provider, stats] = await Promise.all([
      getAppByMariProvider(),
      getAppByMariProductStats("main"),
    ]);
    return noStoreJson({
      configured: Boolean(provider?.apiKey),
      hasApiKey: Boolean(provider?.apiKey),
      isActive: provider?.isActive ?? false,
      baseUrl: APPBYMARI_API_BASE_URL,
      totalProducts: stats.total,
      enabledProducts: stats.enabled,
      lastSyncedAt: stats.lastSyncedAt,
    });
  } catch {
    return noStoreJson({ message: "ไม่สามารถโหลดการตั้งค่าร้านหลักได้" }, 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const me = await requireSuperAdmin();
    if (!ensureMainSite()) return noStoreJson({ message: "เมนูนี้ใช้งานได้เฉพาะร้านหลัก" }, 403);
    if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
      return noStoreJson({ message: "รูปแบบข้อมูลไม่ถูกต้อง" }, 415);
    }

    const parsed = configSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return noStoreJson({ message: "ข้อมูลการตั้งค่าไม่ถูกต้อง" }, 400);

    const current = await getAppByMariProvider();
    const suppliedKey = parsed.data.apiKey?.trim();
    const nextKey = parsed.data.clearApiKey ? "" : suppliedKey || undefined;
    if (!current && !nextKey) {
      return noStoreJson({ message: "กรุณากรอก API key ก่อนบันทึก" }, 400);
    }

    const provider = current
      ? await updateApiProvider(current.id, {
          ...(nextKey !== undefined ? { apiKey: nextKey } : {}),
          ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
          displayName: APPBYMARI_PROVIDER_DISPLAY_NAME,
          apiEndpoint: APPBYMARI_API_BASE_URL,
          productEndpoint: `${APPBYMARI_API_BASE_URL}/products`,
          buyEndpoint: `${APPBYMARI_API_BASE_URL}/buy`,
          historyEndpoint: null,
        })
      : await createApiProvider({
          name: APPBYMARI_PROVIDER_NAME,
          displayName: APPBYMARI_PROVIDER_DISPLAY_NAME,
          apiKey: nextKey ?? null,
          apiEndpoint: APPBYMARI_API_BASE_URL,
          productEndpoint: `${APPBYMARI_API_BASE_URL}/products`,
          buyEndpoint: `${APPBYMARI_API_BASE_URL}/buy`,
          historyEndpoint: null,
          isActive: parsed.data.isActive ?? true,
        });

    await recordAdminAuditEvent({
      actor: me,
      action: "APPBYMARI_CONFIG_UPDATE",
      category: "configuration",
      severity: "critical",
      entityType: "api_provider",
      entityId: provider.id,
      entityLabel: APPBYMARI_PROVIDER_DISPLAY_NAME,
      changes: {
        hasApiKey: { old: Boolean(current?.apiKey), new: Boolean(provider.apiKey) },
        isActive: { old: current?.isActive ?? false, new: provider.isActive },
      },
      details: "Updated Store By Mari connection settings; API key value was excluded",
      ...getAdminAuditRequestContext(request),
    });

    return noStoreJson({
      success: true,
      configured: Boolean(provider.apiKey),
      hasApiKey: Boolean(provider.apiKey),
      isActive: provider.isActive,
      baseUrl: APPBYMARI_API_BASE_URL,
    });
  } catch {
    return noStoreJson({ message: "ไม่สามารถบันทึกการตั้งค่าร้านหลักได้" }, 500);
  }
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
