import { randomUUID } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import pool from "@/lib/mysql";

export type UserNotificationType =
  | "support_resolved"
  | "support_reply"
  | "order_success"
  | "broadcast"
  | "topup_success";

export interface UserNotification {
  id: string;
  userId: string;
  siteId: string;
  type: UserNotificationType;
  title: string;
  message: string;
  linkUrl: string | null;
  referenceId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type UserNotificationRow = RowDataPacket & {
  id: string;
  user_id: string;
  site_id: string;
  type: string;
  title: string;
  message: string;
  link_url: string | null;
  reference_id: string | null;
  is_read: number;
  read_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function mapRowToNotification(row: UserNotificationRow): UserNotification {
  return {
    id: row.id,
    userId: row.user_id,
    siteId: row.site_id,
    type: row.type as UserNotificationType,
    title: row.title,
    message: row.message,
    linkUrl: row.link_url,
    referenceId: row.reference_id,
    isRead: Boolean(row.is_read),
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function createUserNotification(input: {
  userId: string;
  siteId?: string;
  type: UserNotificationType;
  title: string;
  message: string;
  linkUrl?: string | null;
  referenceId?: string | null;
}): Promise<string> {
  const id = randomUUID();
  const siteId = input.siteId || "main";

  await pool.execute<ResultSetHeader>(
    `INSERT INTO user_notifications (
       id, user_id, site_id, type, title, message, link_url, reference_id,
       is_read, read_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NOW(6), NOW(6))`,
    [
      id,
      input.userId,
      siteId,
      input.type,
      input.title,
      input.message,
      input.linkUrl || null,
      input.referenceId || null,
    ],
  );

  return id;
}

export async function getUserNotifications(
  userId: string,
  siteId?: string,
  limit = 25,
): Promise<UserNotification[]> {
  const safeLimit = Math.min(50, Math.max(1, limit));
  let query = `SELECT * FROM user_notifications WHERE user_id = ?`;
  const params: any[] = [userId];

  if (siteId && siteId !== "main") {
    query += ` AND (site_id = ? OR site_id = 'main')`;
    params.push(siteId);
  }

  query += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(String(safeLimit));

  const [rows] = await pool.execute<UserNotificationRow[]>(query, params);
  return rows.map(mapRowToNotification);
}

export async function countUnreadNotifications(
  userId: string,
  siteId?: string,
): Promise<number> {
  let query = `SELECT COUNT(*) AS count FROM user_notifications WHERE user_id = ? AND is_read = 0`;
  const params: any[] = [userId];

  if (siteId && siteId !== "main") {
    query += ` AND (site_id = ? OR site_id = 'main')`;
    params.push(siteId);
  }

  const [rows] = await pool.execute<RowDataPacket[]>(query, params);
  return Number(rows[0]?.count ?? 0);
}

/**
 * Counts unread resolved support cases specifically for customer PWA App Badging API.
 */
export async function countUnreadCustomerResolvedCases(
  userId: string,
  siteId?: string,
): Promise<number> {
  let query = `SELECT COUNT(*) AS count FROM user_notifications 
               WHERE user_id = ? AND is_read = 0 AND type = 'support_resolved'`;
  const params: any[] = [userId];

  if (siteId && siteId !== "main") {
    query += ` AND (site_id = ? OR site_id = 'main')`;
    params.push(siteId);
  }

  const [rows] = await pool.execute<RowDataPacket[]>(query, params);
  return Number(rows[0]?.count ?? 0);
}

export async function markNotificationAsRead(
  userId: string,
  notificationId: string,
): Promise<boolean> {
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE user_notifications 
     SET is_read = 1, read_at = NOW(6), updated_at = NOW(6)
     WHERE id = ? AND user_id = ?`,
    [notificationId, userId],
  );

  return (result.affectedRows ?? 0) > 0;
}

export async function markAllNotificationsAsRead(
  userId: string,
  siteId?: string,
): Promise<boolean> {
  let query = `UPDATE user_notifications 
               SET is_read = 1, read_at = NOW(6), updated_at = NOW(6)
               WHERE user_id = ? AND is_read = 0`;
  const params: any[] = [userId];

  if (siteId && siteId !== "main") {
    query += ` AND (site_id = ? OR site_id = 'main')`;
    params.push(siteId);
  }

  const [result] = await pool.execute<ResultSetHeader>(query, params);
  return (result.affectedRows ?? 0) > 0;
}

export async function createBroadcastUserNotifications(input: {
  title: string;
  message: string;
  linkUrl?: string | null;
  siteId?: string;
  referenceId?: string | null;
  target?: string;
}): Promise<number> {
  const siteId = input.siteId || "main";
  const target = (input.target || "ALL").toUpperCase();

  let query = `
    INSERT INTO user_notifications (
      id, user_id, site_id, type, title, message, link_url, reference_id,
      is_read, read_at, created_at, updated_at
    )
    SELECT 
      UUID(), id, ?, 'broadcast', ?, ?, ?, ?, 0, NULL, NOW(6), NOW(6)
    FROM users
    WHERE (site_id = ? OR site_id = 'main')
  `;
  const params: any[] = [
    siteId,
    input.title,
    input.message,
    input.linkUrl || null,
    input.referenceId || null,
    siteId,
  ];

  if (target === "USER") {
    query += ` AND role = 'user'`;
  } else if (target === "ADMIN") {
    query += ` AND role IN ('admin', 'superadmin', 'owner')`;
  }

  try {
    const [result] = await pool.execute<ResultSetHeader>(query, params);
    return result.affectedRows ?? 0;
  } catch (error) {
    console.error("[createBroadcastUserNotifications error]:", error);
    return 0;
  }
}
