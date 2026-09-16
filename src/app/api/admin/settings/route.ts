import { NextRequest, NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/server";
import { isSuperAdminUser } from "@/lib/auth/roles";
import {
  canAccessAdminSettings,
  isMainSiteOnlySettingKey,
} from "@/lib/auth/access-policies";
import { getSiteId } from "@/lib/site";
import { getAllSettings, updateSetting, invalidateSettingsCache } from "@/lib/settings/repository";
import {
  canUseThemeSettingValue,
  isThemeSettingKey,
} from "@/lib/theme/catalog";
import { sendAdminAuditWebhook } from "@/lib/discord/admin-audit";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";

const updateSettingsSchema = z.object({
  settings: z.record(z.string(), z.string().nullable()),
});

function noStoreJson(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return response;
}

export async function GET() {
  try {
    const me = await getCurrentUser();
    const siteId = getSiteId();

    if (!me) {
      return noStoreJson({ message: "Unauthorized" }, 401);
    }
    if (!canAccessAdminSettings(siteId, me)) {
      return noStoreJson(
        { message: "Forbidden" },
        403,
      );
    }

    const settings = await getAllSettings();
    const visibleSettings =
      siteId === "main"
        ? settings
        : settings.filter((setting) => !isMainSiteOnlySettingKey(setting.key));

    return noStoreJson({ settings: visibleSettings });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ไม่สามารถอ่านการตั้งค่าได้";

    return noStoreJson({ message }, 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const me = await getCurrentUser();
    const siteId = getSiteId();

    if (!me) {
      return noStoreJson({ message: "Unauthorized" }, 401);
    }
    if (!canAccessAdminSettings(siteId, me)) {
      return noStoreJson(
        { message: "Forbidden" },
        403,
      );
    }

    if (process.env.NODE_ENV === "development" && process.env.APP_THEME_PREVIEW_PACK) {
      return noStoreJson(
        { message: "Local Theme Preview เป็นโหมดอ่านอย่างเดียว ไม่เขียนค่าไปยัง Production" },
        409,
      );
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return noStoreJson(
        { message: "รูปแบบข้อมูลไม่ถูกต้อง" },
        415,
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return noStoreJson(
        { message: "ไม่สามารถอ่านข้อมูลจากคำขอได้" },
        400,
      );
    }

    const parsed = updateSettingsSchema.safeParse(rawBody);
    if (!parsed.success) {
      return noStoreJson(
        {
          message: "ข้อมูลไม่ถูกต้อง",
          errors: parsed.error.issues,
        },
        400,
      );
    }

    const { settings } = parsed.data;
    const forbiddenSetting = Object.keys(settings).find(
      (key) => siteId !== "main" && isMainSiteOnlySettingKey(key),
    );
    if (forbiddenSetting) {
      return noStoreJson(
        { message: "การตั้งค่านี้จัดการได้เฉพาะบนเว็บไซต์หลักโดย SuperAdmin เท่านั้น" },
        403,
      );
    }

    const requestedThemeSettings = Object.entries(settings).filter(([key]) =>
      key.startsWith("site_theme_"),
    );

    if (requestedThemeSettings.length > 0) {
      if (siteId !== "main" || !isSuperAdminUser(me)) {
        return noStoreJson(
          { message: "เฉพาะ SuperAdmin ของ storebymari.com เท่านั้นที่จัดการ Theme ได้" },
          403,
        );
      }

      const invalidThemeSetting = requestedThemeSettings.find(([key, value]) =>
        !isThemeSettingKey(key) || !canUseThemeSettingValue(key, value),
      );
      if (invalidThemeSetting) {
        return noStoreJson(
          { message: "ค่า Theme ไม่ถูกต้อง" },
          400,
        );
      }
    }

    const updated: Array<{ key: string; value: string | null }> = [];
    const changes: Record<string, { old: string | number | null; new: string | number | null }> = {};

    // ดึงค่าเก่าทั้งหมดในครั้งเดียว (1 batch read) แทน N+1 sequential reads
    const keys = Object.keys(settings);
    const { getSettingValues } = await import("@/lib/settings/repository");
    const currentValues = await getSettingValues(keys);

    for (const [key, value] of Object.entries(settings)) {
      try {
        const oldValue = currentValues[key] ?? null;
        
        await updateSetting(key, value);
        updated.push({ key, value });
        
        // Track changes (only for non-sensitive settings)
        if (!key.includes("secret") && !key.includes("api_key") && !key.includes("client_secret")) {
          changes[key] = { old: oldValue, new: value };
        }
      } catch (error) {
        console.error(`Failed to update setting ${key}:`, error);
      }
    }

    // ล้างแคชที่ฝั่ง Frontend เพื่อให้อัปเดตทันที

    (revalidateTag as any)("settings");
    invalidateSettingsCache();
    try {
      revalidatePath("/", "layout");
    } catch (e) {
      console.warn("revalidatePath layout error:", e);
    }

    // Send audit webhook
    if (updated.length > 0) {
      await recordAdminAuditEvent({
        actor: me,
        action: "SETTINGS_UPDATE",
        category: "configuration",
        severity: "high",
        entityType: "settings",
        entityLabel: `${updated.length} settings`,
        after: { keys: updated.map((item) => item.key) },
        changes,
        details: "Updated website settings; sensitive values were redacted",
        ...getAdminAuditRequestContext(request),
      });

      // Theme publishing remains auditable in the website, without creating a
      // Discord dependency for this new frontend-only feature.
      if (updated.some((item) => !isThemeSettingKey(item.key))) {
        await sendAdminAuditWebhook({
          action: "อัปเดตการตั้งค่า",
          details: `อัปเดต ${updated.length} รายการ`,
          changes: Object.keys(changes).length > 0 ? changes : undefined,
        });
      }
    }

    return noStoreJson({
      success: true,
      updated,
      message: `อัปเดตการตั้งค่า ${updated.length} รายการเรียบร้อย`,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ไม่สามารถอัปเดตการตั้งค่าได้";

    return noStoreJson({ message }, 500);
  }
}

