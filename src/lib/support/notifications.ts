import type { RowDataPacket } from "mysql2/promise";

import pool from "@/lib/mysql";

import type { SupportCaseType } from "./types";

const DEFAULT_NOTIFICATION_LIMIT = 20;
const MAX_NOTIFICATION_LIMIT = 50;

export type SupportCaseNotification = {
  id: string;
  caseCode: string;
  productName: string | null;
  caseType: SupportCaseType;
  problemDescription: string;
  reporterName: string | null;
  reporterEmail: string | null;
  createdAt: string;
};

type SupportCaseNotificationRow = RowDataPacket & {
  id: string;
  case_code: string;
  product_name: string | null;
  case_type: string | null;
  problem_description: string | null;
  reporter_name: string | null;
  reporter_email: string | null;
  created_at: Date | string | null;
};

type SupportCaseNotificationCaseRow = RowDataPacket & {
  id: string;
  case_code: string;
  site_id: string;
};

export type SupportCaseNotificationScope = {
  /** Undefined means the main-site admin can see all tenant cases. */
  siteId?: string;
};

export function summarizeSupportCaseProblem(
  problemDescription: string | null | undefined,
  maxLength = 140,
): string {
  const normalized = String(problemDescription ?? "")
    .replace(/\s+/gu, " ")
    .trim();

  if (!normalized) return "ผู้ใช้แจ้งปัญหา";

  const safeMaxLength = Math.max(1, Math.floor(maxLength));
  if (normalized.length <= safeMaxLength) return normalized;

  return `${normalized.slice(0, safeMaxLength).trimEnd()}…`;
}

function toIsoDate(value: Date | string | null): string {
  if (!value) return new Date(0).toISOString();

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function toSupportCaseNotification(row: SupportCaseNotificationRow): SupportCaseNotification {
  return {
    id: row.id,
    caseCode: row.case_code,
    productName: normalizeOptionalText(row.product_name),
    caseType: row.case_type === "screen" ? "screen" : "account",
    problemDescription: summarizeSupportCaseProblem(row.problem_description),
    reporterName: normalizeOptionalText(row.reporter_name),
    reporterEmail: normalizeOptionalText(row.reporter_email),
    createdAt: toIsoDate(row.created_at),
  };
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return DEFAULT_NOTIFICATION_LIMIT;
  return Math.min(MAX_NOTIFICATION_LIMIT, Math.max(1, Math.floor(limit as number)));
}

function buildSiteFilter(scope: SupportCaseNotificationScope | undefined): {
  clause: string;
  params: string[];
} {
  if (!scope?.siteId) return { clause: "", params: [] };
  return { clause: " AND sc.site_id = ?", params: [scope.siteId] };
}

export async function getUnreadSupportCaseNotifications(
  adminUserId: string,
  scope?: SupportCaseNotificationScope,
  limit = DEFAULT_NOTIFICATION_LIMIT,
): Promise<SupportCaseNotification[]> {
  const siteFilter = buildSiteFilter(scope);
  const normalizedLimit = normalizeLimit(limit);
  const [rows] = await pool.execute<SupportCaseNotificationRow[]>(
    `SELECT
       sc.id,
       sc.case_code,
       sc.product_name,
       sc.case_type,
       sc.problem_description,
       u.display_name AS reporter_name,
       u.email AS reporter_email,
       sc.created_at
     FROM support_cases sc
     LEFT JOIN support_case_notification_reads r
       ON r.site_id = sc.site_id
      AND r.support_case_id = sc.id
      AND r.admin_user_id = ?
     LEFT JOIN users u
       ON u.id = sc.user_id
      AND u.site_id = sc.site_id
     WHERE sc.status = 'pending'
       AND r.support_case_id IS NULL${siteFilter.clause}
     ORDER BY sc.created_at DESC, sc.id DESC
     LIMIT ?`,
    [adminUserId, ...siteFilter.params, String(normalizedLimit)],
  );

  return rows.map(toSupportCaseNotification);
}

export async function countUnreadSupportCaseNotifications(
  adminUserId: string,
  scope?: SupportCaseNotificationScope,
): Promise<number> {
  const siteFilter = buildSiteFilter(scope);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS count
     FROM support_cases sc
     LEFT JOIN support_case_notification_reads r
       ON r.site_id = sc.site_id
      AND r.support_case_id = sc.id
      AND r.admin_user_id = ?
     WHERE sc.status = 'pending'
       AND r.support_case_id IS NULL${siteFilter.clause}`,
    [adminUserId, ...siteFilter.params],
  );

  return Number(rows[0]?.count ?? 0);
}

export async function markSupportCaseNotificationRead(
  adminUserId: string,
  caseId: string,
  scope?: SupportCaseNotificationScope,
): Promise<{ caseId: string; caseCode: string } | null> {
  const siteFilter = buildSiteFilter(scope);
  const [caseRows] = await pool.execute<SupportCaseNotificationCaseRow[]>(
    `SELECT sc.id, sc.case_code, sc.site_id
     FROM support_cases sc
     WHERE sc.id = ?${siteFilter.clause}
     LIMIT 1`,
    [caseId, ...siteFilter.params],
  );

  const caseData = caseRows[0];
  if (!caseData) return null;

  await pool.execute(
    `INSERT INTO support_case_notification_reads (
       site_id,
       support_case_id,
       admin_user_id,
       read_at,
       created_at
     ) VALUES (?, ?, ?, NOW(6), NOW(6))
     ON DUPLICATE KEY UPDATE read_at = read_at`,
    [caseData.site_id, caseData.id, adminUserId],
  );

  return { caseId: caseData.id, caseCode: caseData.case_code };
}
