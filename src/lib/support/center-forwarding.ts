import pool from "@/lib/mysql";
import type { RowDataPacket } from "mysql2/promise";
import { getSiteConfig } from "@/lib/site-config";
import { getSettingValue } from "@/lib/settings/repository";
import {
  AppByMariApiError,
  forwardAppByMariSupportCase,
  type AppByMariSupportCaseForwardResult,
} from "@/lib/appbymari/client";
import type { SupportCase, SupportCaseCenterSyncStatus } from "./types";
import { ensureSupportCenterSchema } from "./center-schema";

export type SupportCaseCenterForwardResult = AppByMariSupportCaseForwardResult & {
  status: SupportCaseCenterSyncStatus;
  alreadySent: boolean;
};

function normalizeStoreName(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized || /^app\s*by\s*mari$/i.test(normalized)) return null;
  if (/^store\s*by\s*mari$/i.test(normalized)) return "Store By Mari";
  return normalized;
}

export async function getStoreNameForCenter(): Promise<string> {
  try {
    const configuredName = normalizeStoreName(await getSettingValue("site_name"));
    if (configuredName) return configuredName;
  } catch (error) {
    console.error("[Support Center] Failed to load store name setting", {
      code: error instanceof Error ? error.name : "unknown",
    });
  }

  const fallback = normalizeStoreName(getSiteConfig().siteName);
  return fallback || "Store By Mari";
}

function safeForwardError(error: unknown): string {
  if (error instanceof AppByMariApiError) return error.message;
  return "ไม่สามารถเชื่อมต่อศูนย์กลาง AppByMari ได้";
}

export async function forwardSupportCaseToCenter(
  caseData: SupportCase,
): Promise<SupportCaseCenterForwardResult> {
  await ensureSupportCenterSchema();

  const [rows] = await pool.execute<Array<RowDataPacket & {
    center_case_id: string | null;
    center_case_code: string | null;
  }>>(
    `SELECT center_case_id, center_case_code
     FROM support_cases
     WHERE id = ?
     LIMIT 1`,
    [caseData.id],
  );
  const current = rows[0];

  if (current?.center_case_id || current?.center_case_code) {
    return {
      status: "sent",
      alreadySent: true,
      remoteCaseId: current.center_case_id ?? null,
      remoteCaseCode: current.center_case_code ?? null,
    };
  }

  const storeName = normalizeStoreName(caseData.shopName) || await getStoreNameForCenter();
  try {
    const forwarded = await forwardAppByMariSupportCase({
      caseData: {
        caseCode: caseData.caseCode,
        orderId: caseData.orderId,
        productName: caseData.productName,
        productTypeId: caseData.productTypeId,
        accountEmail: caseData.accountEmail,
        accountPassword: caseData.accountPassword,
        expirationDate: caseData.expirationDate,
        caseType: caseData.caseType,
        screenNumber: caseData.screenNumber,
        problemDescription: caseData.problemDescription,
        shopName: storeName,
      },
    });

    await pool.execute(
      `UPDATE support_cases
       SET center_case_id = ?,
           center_case_code = ?,
           center_synced_at = NOW(6),
           center_sync_error = NULL
       WHERE id = ?`,
      [forwarded.remoteCaseId, forwarded.remoteCaseCode, caseData.id],
    );

    return {
      status: "sent",
      alreadySent: false,
      ...forwarded,
    };
  } catch (error) {
    const message = safeForwardError(error);
    await pool.execute(
      `UPDATE support_cases
       SET center_sync_error = ?,
           center_synced_at = NULL
       WHERE id = ?`,
      [message, caseData.id],
    );
    throw error;
  }
}
