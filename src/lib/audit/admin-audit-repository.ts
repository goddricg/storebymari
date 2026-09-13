import type { RowDataPacket } from "mysql2/promise";

import { toAnalyticsIso } from "@/lib/analytics/time";
import { addTopupReportDays, buildTopupReportDateRange, getDateOnlyInTopupTimeZone } from "@/lib/topup/report-time";
import pool from "@/lib/mysql";

export const ADMIN_AUDIT_PAGE_SIZE = 30;

export type AdminAuditQuery = {
  siteId: string;
  page: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
  search?: string;
  action?: string;
  category?: string;
  result?: string;
  severity?: string;
  entityType?: string;
  actorId?: string;
};

export type AdminAuditListItem = {
  id: string;
  siteId: string;
  actorId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  category: string;
  severity: string;
  result: string;
  entityType: string | null;
  entityId: string | null;
  entityLabel: string | null;
  reasonCode: string | null;
  details: string | null;
  changes: unknown;
  requestId: string | null;
  route: string | null;
  method: string | null;
  source: string;
  occurredAt: string | null;
};

export type AdminAuditDetail = AdminAuditListItem & {
  before: unknown;
  after: unknown;
  userAgent: string | null;
  createdAt: string | null;
};

export type AdminAuditSummary = {
  total: number;
  failed: number;
  denied: number;
  highRisk: number;
  actors: number;
};

export type AdminAuditActor = {
  id: string;
  name: string;
  email: string;
  role: string;
  count: number;
  todayCount: number;
};

export type AdminAuditActorSummary = {
  actorId: string;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  totalActions: number;
  successCount: number;
  failedCount: number;
  deniedCount: number;
  highRiskCount: number;
  firstActionAt: string | null;
  lastActionAt: string | null;
  categoryBreakdown: Array<{
    category: string;
    labelTh: string;
    count: number;
  }>;
  topActions: Array<{
    action: string;
    labelTh: string;
    category: string;
    count: number;
  }>;
};

export const AUDIT_CATEGORY_TH: Record<string, string> = {
  inventory: "จัดการสต็อกสินค้า",
  catalog: "จัดการสินค้าและหมวดหมู่",
  support: "เคสปัญหาและบริการลูกค้า",
  finance: "การเงินและรายงานเติมเงิน",
  users: "จัดการผู้ใช้และสิทธิ์",
  configuration: "ตั้งค่าระบบและเว็บไซต์",
  security: "ความปลอดภัยของระบบ",
  audit: "ตรวจสอบประวัติการทำงาน",
  system: "การทำงานของระบบ",
  analytics: "สถิติและการเข้าชม",
  notification: "ระบบแจ้งเตือน",
};

export const AUDIT_ACTION_TH: Record<string, string> = {
  STOCK_ACCOUNT_VIEW: "เข้าดูรหัส/สต็อกสินค้า",
  STOCK_ACCOUNT_UPDATE: "แก้ไข/อัปเดตข้อมูลบัญชีสต็อก",
  STOCK_ACCOUNT_APPEND: "เติมสต็อกสินค้าใหม่",
  STOCK_ACCOUNT_DELETE: "ลบบัญชีสต็อก",
  STOCK_ACCOUNT_DELETE_BULK: "ลบบัญชีสต็อกแบบกลุ่ม",
  PRODUCT_LIST_VIEW: "เปิดดูรายการสินค้า",
  PRODUCT_CREATE: "เพิ่มสินค้าใหม่",
  PRODUCT_UPDATE: "แก้ไขข้อมูลสินค้า/ราคา",
  PRODUCT_DELETE: "ลบสินค้า",
  SUPPORT_CASE_VIEW: "เปิดดูเคสปัญหาของลูกค้า",
  SUPPORT_CASE_CLAIM: "กดรับเคสปัญหาลูกค้า",
  SUPPORT_CASE_UPDATE: "ตอบกลับ/อัปเดตสถานะเคสปัญหา",
  SUPPORT_CASE_RESOLVE: "แก้ไขปัญหา/ปิดเคสสำเร็จ",
  SUPPORT_CASE_DELETE: "ลบเคสปัญหา",
  TOPUP_RECENT_VIEW: "ดูรายการเติมเงินล่าสุด",
  TOPUP_CHART_VIEW: "ดูสถิติกราฟเติมเงิน",
  TOPUP_SUMMARY_VIEW: "ดูสรุปยอดเติมเงิน",
  REVENUE_REPORT_VIEW: "ดูรายงานรายได้",
  SALES_REPORT_VIEW: "ดูรายงานยอดขาย",
  SALES_HISTORY_VIEW: "ดูประวัติการขายสินค้า",
  ANALYTICS_PRESENCE_VIEW: "ดูสถานะผู้ใช้ออนไลน์",
  ANALYTICS_VISITS_VIEW: "ดูสถิติผู้เข้าชมเว็บไซต์",
  ANALYTICS_PWA_INSTALLS_VIEW: "ดูสถิติติดตั้ง PWA",
  USER_VIEW: "ดูข้อมูลผู้ใช้",
  USER_UPDATE: "แก้ไขข้อมูล/สิทธิ์ผู้ใช้",
  USER_DELETE: "ลบผู้ใช้",
  SETTINGS_UPDATE: "อัปเดตการตั้งค่าระบบ",
  DISCOUNT_UPDATE: "แก้ไขส่วนลด/โปรโมชั่น",
  AUDIT_LIST_VIEW: "เข้าดูรายการ Audit",
  AUDIT_DETAIL_VIEW: "ดูรายละเอียด Audit Event",
  BROADCAST_PUSH: "ส่งข้อความประกาศ Push",
};

type AuditDbRow = RowDataPacket & {
  id: string;
  site_id: string;
  actor_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  actor_role: string | null;
  event_action: string;
  event_category: string;
  severity: string;
  result: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  reason_code: string | null;
  details: string | null;
  before_json: string | null;
  after_json: string | null;
  changes_json: string | null;
  request_id: string | null;
  route: string | null;
  method: string | null;
  source: string;
  user_agent: string | null;
  occurred_at: Date | string | null;
  created_at: Date | string | null;
};

type CountRow = RowDataPacket & { total: number | string };
type SummaryRow = RowDataPacket & {
  total: number | string;
  failed: number | string;
  denied: number | string;
  high_risk: number | string;
  actors: number | string;
};

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return { value: "[INVALID_AUDIT_JSON]" };
  }
}

function mapListItem(row: AuditDbRow): AdminAuditListItem {
  return {
    id: row.id,
    siteId: row.site_id,
    actorId: row.actor_id,
    actorEmail: row.actor_email,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    action: row.event_action,
    category: row.event_category,
    severity: row.severity,
    result: row.result,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityLabel: row.entity_label,
    reasonCode: row.reason_code,
    details: row.details,
    changes: parseJson(row.changes_json),
    requestId: row.request_id,
    route: row.route,
    method: row.method,
    source: row.source,
    occurredAt: toAnalyticsIso(row.occurred_at),
  };
}

function buildRange(startDate?: string, endDate?: string) {
  const today = getDateOnlyInTopupTimeZone();
  const normalizedStart = startDate ?? addTopupReportDays(today, -29);
  const normalizedEnd = endDate ?? today;
  return buildTopupReportDateRange(normalizedStart, normalizedEnd);
}

function buildWhere(input: AdminAuditQuery) {
  const where: string[] = ["site_id = ?"];
  const params: Array<string | number> = [input.siteId];

  // No date parameters means the explicit "all" view. The normal UI sends a
  // bounded range, which keeps the common query fast without hiding history.
  if (input.startDate || input.endDate) {
    const range = buildRange(input.startDate, input.endDate);
    where.push("occurred_at >= ?", "occurred_at < ?");
    params.push(range.startAt!, range.endExclusive!);
  }

  const search = input.search?.trim();
  if (search) {
    const pattern = `%${search.slice(0, 100)}%`;
    where.push(`(
      actor_email LIKE ?
      OR actor_name LIKE ?
      OR event_action LIKE ?
      OR event_category LIKE ?
      OR entity_id LIKE ?
      OR entity_label LIKE ?
      OR request_id LIKE ?
      OR details LIKE ?
    )`);
    params.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern);
  }

  const filters: Array<[string, string | undefined]> = [
    ["event_action", input.action],
    ["event_category", input.category],
    ["result", input.result],
    ["severity", input.severity],
    ["entity_type", input.entityType],
    ["actor_id", input.actorId],
  ];

  for (const [column, value] of filters) {
    const normalized = value?.trim();
    if (!normalized) continue;
    where.push(`${column} = ?`);
    params.push(normalized.slice(0, 120));
  }

  return { where: where.join(" AND "), params };
}

export async function listAdminAuditEvents(input: AdminAuditQuery) {
  const { where, params } = buildWhere(input);
  const limit = Math.min(Math.max(input.limit ?? ADMIN_AUDIT_PAGE_SIZE, 1), 100);
  const page = Math.max(input.page, 1);
  const offset = (page - 1) * limit;

  const [countRows] = await pool.execute<CountRow[]>(
    `SELECT COUNT(*) AS total FROM admin_audit_events WHERE ${where}`,
    params,
  );
  const total = Number(countRows[0]?.total ?? 0);

  const [rows] = await pool.execute<AuditDbRow[]>(
    `SELECT
       id, site_id, actor_id, actor_email, actor_name, actor_role,
       event_action, event_category, severity, result,
       entity_type, entity_id, entity_label, reason_code, details,
       changes_json, request_id, route, method, source, occurred_at
     FROM admin_audit_events
     WHERE ${where}
     ORDER BY occurred_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const [summaryRows] = await pool.execute<SummaryRow[]>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN result = 'failed' THEN 1 ELSE 0 END) AS failed,
       SUM(CASE WHEN result = 'denied' THEN 1 ELSE 0 END) AS denied,
       SUM(CASE WHEN severity IN ('high', 'critical') THEN 1 ELSE 0 END) AS high_risk,
       COUNT(DISTINCT actor_id) AS actors
     FROM admin_audit_events
     WHERE ${where}`,
    params,
  );

  const summary = summaryRows[0];

  // Load distinct actors for filtering and today activity chips
  const [actorRows] = await pool.execute<RowDataPacket[]>(
    `SELECT 
       actor_id,
       COALESCE(MAX(actor_name), MAX(actor_email), actor_id) as name,
       COALESCE(MAX(actor_email), '') as email,
       COALESCE(MAX(actor_role), 'admin') as role,
       COUNT(*) as total_count,
       SUM(CASE WHEN DATE(CONVERT_TZ(occurred_at, '+00:00', '+07:00')) = DATE(CONVERT_TZ(NOW(), '+00:00', '+07:00')) THEN 1 ELSE 0 END) as today_count
     FROM admin_audit_events
     WHERE site_id = ? AND actor_id IS NOT NULL
     GROUP BY actor_id
     ORDER BY today_count DESC, total_count DESC`,
    [input.siteId],
  );

  const actors: AdminAuditActor[] = actorRows.map((r) => ({
    id: String(r.actor_id),
    name: String(r.name || r.actor_id),
    email: String(r.email || ""),
    role: String(r.role || "admin"),
    count: Number(r.total_count || 0),
    todayCount: Number(r.today_count || 0),
  }));

  const todayActors = actors.filter((a) => a.todayCount > 0);

  // Compute detailed actor summary if filtered by actorId
  let actorSummary: AdminAuditActorSummary | null = null;
  const targetActorId = input.actorId?.trim();
  if (targetActorId) {
    const [actorStatsRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         COUNT(*) AS total_actions,
         SUM(CASE WHEN result = 'success' THEN 1 ELSE 0 END) AS success_count,
         SUM(CASE WHEN result = 'failed' THEN 1 ELSE 0 END) AS failed_count,
         SUM(CASE WHEN result = 'denied' THEN 1 ELSE 0 END) AS denied_count,
         SUM(CASE WHEN severity IN ('high', 'critical') THEN 1 ELSE 0 END) AS high_risk_count,
         MIN(occurred_at) AS first_action_at,
         MAX(occurred_at) AS last_action_at,
         COALESCE(MAX(actor_name), MAX(actor_email), actor_id) AS actor_name,
         COALESCE(MAX(actor_email), '') AS actor_email,
         COALESCE(MAX(actor_role), 'admin') AS actor_role
       FROM admin_audit_events
       WHERE ${where}`,
      params,
    );

    const stat = actorStatsRows[0];
    if (stat && Number(stat.total_actions || 0) > 0) {
      const [categoryRows] = await pool.execute<RowDataPacket[]>(
        `SELECT event_category, COUNT(*) AS count
         FROM admin_audit_events
         WHERE ${where}
         GROUP BY event_category
         ORDER BY count DESC`,
        params,
      );

      const [topActionRows] = await pool.execute<RowDataPacket[]>(
        `SELECT event_action, event_category, COUNT(*) AS count
         FROM admin_audit_events
         WHERE ${where}
         GROUP BY event_action, event_category
         ORDER BY count DESC
         LIMIT 8`,
        params,
      );

      actorSummary = {
        actorId: targetActorId,
        actorName: String(stat.actor_name || targetActorId),
        actorEmail: String(stat.actor_email || ""),
        actorRole: String(stat.actor_role || "admin"),
        totalActions: Number(stat.total_actions || 0),
        successCount: Number(stat.success_count || 0),
        failedCount: Number(stat.failed_count || 0),
        deniedCount: Number(stat.denied_count || 0),
        highRiskCount: Number(stat.high_risk_count || 0),
        firstActionAt: toAnalyticsIso(stat.first_action_at),
        lastActionAt: toAnalyticsIso(stat.last_action_at),
        categoryBreakdown: categoryRows.map((c) => ({
          category: String(c.event_category),
          labelTh: AUDIT_CATEGORY_TH[String(c.event_category)] || String(c.event_category),
          count: Number(c.count || 0),
        })),
        topActions: topActionRows.map((a) => ({
          action: String(a.event_action),
          labelTh: AUDIT_ACTION_TH[String(a.event_action)] || String(a.event_action),
          category: String(a.event_category),
          count: Number(a.count || 0),
        })),
      };
    }
  }

  return {
    items: rows.map(mapListItem),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    summary: {
      total: Number(summary?.total ?? 0),
      failed: Number(summary?.failed ?? 0),
      denied: Number(summary?.denied ?? 0),
      highRisk: Number(summary?.high_risk ?? 0),
      actors: Number(summary?.actors ?? 0),
    } satisfies AdminAuditSummary,
    actors,
    todayActors,
    actorSummary,
  };
}

export async function findAdminAuditEvent(id: string, siteId: string): Promise<AdminAuditDetail | null> {
  const [rows] = await pool.execute<AuditDbRow[]>(
    `SELECT * FROM admin_audit_events WHERE id = ? AND site_id = ? LIMIT 1`,
    [id, siteId],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    ...mapListItem(row),
    before: parseJson(row.before_json),
    after: parseJson(row.after_json),
    userAgent: row.user_agent,
    createdAt: toAnalyticsIso(row.created_at),
  };
}
