import { randomUUID } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import pool from "@/lib/mysql";

export interface RecordPwaInstallInput {
  siteId?: string;
  visitorId: string;
  userId?: string | null;
  platform: "android" | "ios" | "windows" | "mac" | "other";
  deviceType: "mobile" | "tablet" | "desktop";
  source: string;
  userAgent?: string | null;
}

export interface PwaDailyPoint {
  date: string; // YYYY-MM-DD
  total: number;
  android: number;
  ios: number;
  desktop: number;
  other: number;
}

export interface PwaRecentInstall {
  id: string;
  visitorId: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  platform: string;
  deviceType: string;
  source: string;
  installCount: number;
  installedAt: string;
}

export interface PwaInstallStats {
  totalInstalls: number;
  totalInstallEvents: number;
  todayInstalls: number;
  platformBreakdown: {
    android: number;
    ios: number;
    desktop: number;
    other: number;
  };
  dailyStats: PwaDailyPoint[];
  recentInstalls: PwaRecentInstall[];
  updatedAt: string;
}

export async function recordPwaInstall(input: RecordPwaInstallInput): Promise<{ id: string; isNew: boolean }> {
  const id = randomUUID();
  const siteId = input.siteId || "main";
  const visitorId = input.visitorId.trim();
  const platform = input.platform || "other";
  const deviceType = input.deviceType || "mobile";
  const source = input.source || "appinstalled_event";
  const userAgent = input.userAgent ? input.userAgent.slice(0, 255) : null;
  const userId = input.userId || null;

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO pwa_installs (
       id, site_id, visitor_id, user_id, platform, device_type, source,
       user_agent, install_count, first_installed_at, last_installed_at, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(6), NOW(6), NOW(6))
     ON DUPLICATE KEY UPDATE
       install_count = install_count + 1,
       last_installed_at = NOW(6),
       user_id = COALESCE(VALUES(user_id), user_id),
       platform = VALUES(platform),
       device_type = VALUES(device_type),
       source = VALUES(source),
       user_agent = COALESCE(VALUES(user_agent), user_agent)`,
    [id, siteId, visitorId, userId, platform, deviceType, source, userAgent],
  );

  // affectedRows: 1 = new row inserted, 2 = row updated
  return {
    id,
    isNew: result.affectedRows === 1,
  };
}

export async function getPwaInstallStats(params: {
  siteId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<PwaInstallStats> {
  const siteId = params.siteId || "main";

  // 1. Total unique installed visitors and total install events
  const [totalRows] = await pool.execute<RowDataPacket[]>(
    `SELECT 
       COUNT(*) AS total_installs,
       COALESCE(SUM(install_count), 0) AS total_events
     FROM pwa_installs 
     WHERE (site_id = ? OR site_id = 'main')`,
    [siteId],
  );
  const totalInstalls = Number(totalRows[0]?.total_installs ?? 0);
  const totalInstallEvents = Number(totalRows[0]?.total_events ?? 0);

  // 2. Installs today (Bangkok timezone: UTC+7)
  const [todayRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS today_installs
     FROM pwa_installs
     WHERE (site_id = ? OR site_id = 'main')
       AND DATE(CONVERT_TZ(created_at, '+00:00', '+07:00')) = DATE(CONVERT_TZ(NOW(), '+00:00', '+07:00'))`,
    [siteId],
  );
  const todayInstalls = Number(todayRows[0]?.today_installs ?? 0);

  // 3. Platform breakdown
  const [platformRows] = await pool.execute<RowDataPacket[]>(
    `SELECT platform, COUNT(*) AS count
     FROM pwa_installs
     WHERE (site_id = ? OR site_id = 'main')
     GROUP BY platform`,
    [siteId],
  );

  const platformBreakdown = {
    android: 0,
    ios: 0,
    desktop: 0,
    other: 0,
  };

  for (const row of platformRows) {
    const p = String(row.platform).toLowerCase();
    const count = Number(row.count ?? 0);
    if (p === "android") platformBreakdown.android += count;
    else if (p === "ios") platformBreakdown.ios += count;
    else if (p === "windows" || p === "mac" || p === "desktop") platformBreakdown.desktop += count;
    else platformBreakdown.other += count;
  }

  // 4. Daily stats (last 30 days or filtered range)
  let dailyQuery = `
    SELECT 
      DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+07:00'), '%Y-%m-%d') AS install_date,
      COUNT(*) AS total,
      SUM(CASE WHEN platform = 'android' THEN 1 ELSE 0 END) AS android,
      SUM(CASE WHEN platform = 'ios' THEN 1 ELSE 0 END) AS ios,
      SUM(CASE WHEN platform IN ('windows', 'mac', 'desktop') THEN 1 ELSE 0 END) AS desktop,
      SUM(CASE WHEN platform NOT IN ('android', 'ios', 'windows', 'mac', 'desktop') THEN 1 ELSE 0 END) AS other
    FROM pwa_installs
    WHERE (site_id = ? OR site_id = 'main')
  `;
  const queryParams: any[] = [siteId];

  if (params.startDate && params.endDate) {
    dailyQuery += ` AND DATE(CONVERT_TZ(created_at, '+00:00', '+07:00')) BETWEEN ? AND ?`;
    queryParams.push(params.startDate, params.endDate);
  } else {
    // Default to last 30 days
    dailyQuery += ` AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`;
  }

  dailyQuery += `
    GROUP BY install_date
    ORDER BY install_date ASC
  `;

  const [dailyRows] = await pool.execute<RowDataPacket[]>(dailyQuery, queryParams);

  const dailyStats: PwaDailyPoint[] = dailyRows.map((r) => ({
    date: r.install_date,
    total: Number(r.total ?? 0),
    android: Number(r.android ?? 0),
    ios: Number(r.ios ?? 0),
    desktop: Number(r.desktop ?? 0),
    other: Number(r.other ?? 0),
  }));

  // 5. Recent 20 installs with user information
  const [recentRows] = await pool.execute<RowDataPacket[]>(
    `SELECT 
       p.id,
       p.visitor_id,
       p.user_id,
       u.display_name,
       u.email,
       p.platform,
       p.device_type,
       p.source,
       p.install_count,
       p.created_at
     FROM pwa_installs p
     LEFT JOIN users u ON u.id = p.user_id
     WHERE (p.site_id = ? OR p.site_id = 'main')
     ORDER BY p.created_at DESC
     LIMIT 20`,
    [siteId],
  );

  const recentInstalls: PwaRecentInstall[] = recentRows.map((r) => ({
    id: r.id,
    visitorId: r.visitor_id,
    userId: r.user_id,
    userName: r.display_name || null,
    userEmail: r.email || null,
    platform: r.platform,
    deviceType: r.device_type,
    source: r.source,
    installCount: Number(r.install_count ?? 1),
    installedAt: new Date(r.created_at).toISOString(),
  }));

  return {
    totalInstalls,
    totalInstallEvents,
    todayInstalls,
    platformBreakdown,
    dailyStats,
    recentInstalls,
    updatedAt: new Date().toISOString(),
  };
}
