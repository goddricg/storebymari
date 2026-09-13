import { randomUUID, createHash } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import pool from "@/lib/mysql";

export interface WebPushKeys {
  p256dh: string;
  auth: string;
}

export interface WebPushSubscriptionData {
  id?: string;
  userId: string;
  siteId?: string;
  endpoint: string;
  keys: WebPushKeys;
  userAgent?: string | null;
  role?: string;
}

export interface StoredPushSubscription {
  id: string;
  userId: string;
  siteId: string;
  endpoint: string;
  endpointHash: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

type PushSubscriptionRow = RowDataPacket & {
  id: string;
  user_id: string;
  site_id: string;
  endpoint: string;
  endpoint_hash: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  role: string;
  created_at: Date;
  updated_at: Date;
};

export function hashEndpoint(endpoint: string): string {
  return createHash("sha256").update(endpoint.trim()).digest("hex");
}

function mapRowToSubscription(row: PushSubscriptionRow): StoredPushSubscription {
  return {
    id: row.id,
    userId: row.user_id,
    siteId: row.site_id,
    endpoint: row.endpoint,
    endpointHash: row.endpoint_hash,
    p256dh: row.p256dh,
    auth: row.auth,
    userAgent: row.user_agent,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function savePushSubscription(data: WebPushSubscriptionData): Promise<{ id: string }> {
  const endpoint = data.endpoint.trim();
  const endpointHash = hashEndpoint(endpoint);
  const siteId = (data.siteId || "main").trim();
  const role = (data.role || "user").trim();
  const id = data.id || randomUUID();
  const userAgent = (data.userAgent || "").slice(0, 255) || null;

  await pool.execute<ResultSetHeader>(
    `INSERT INTO web_push_subscriptions (
       id, user_id, site_id, endpoint, endpoint_hash, p256dh, auth, user_agent, role, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6), NOW(6))
     ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id),
       site_id = VALUES(site_id),
       p256dh = VALUES(p256dh),
       auth = VALUES(auth),
       user_agent = VALUES(user_agent),
       role = VALUES(role),
       updated_at = NOW(6)`,
    [
      id,
      data.userId,
      siteId,
      endpoint,
      endpointHash,
      data.keys.p256dh,
      data.keys.auth,
      userAgent,
      role,
    ],
  );

  return { id };
}

export async function deletePushSubscription(endpoint: string): Promise<boolean> {
  const endpointHash = hashEndpoint(endpoint);
  const [result] = await pool.execute<ResultSetHeader>(
    `DELETE FROM web_push_subscriptions WHERE endpoint_hash = ?`,
    [endpointHash],
  );
  return (result.affectedRows ?? 0) > 0;
}

export async function deletePushSubscriptionByHash(endpointHash: string): Promise<boolean> {
  const [result] = await pool.execute<ResultSetHeader>(
    `DELETE FROM web_push_subscriptions WHERE endpoint_hash = ?`,
    [endpointHash],
  );
  return (result.affectedRows ?? 0) > 0;
}

export async function isSubscriptionActive(userId: string, endpoint: string): Promise<boolean> {
  const endpointHash = hashEndpoint(endpoint);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id FROM web_push_subscriptions WHERE user_id = ? AND endpoint_hash = ? LIMIT 1`,
    [userId, endpointHash],
  );
  return rows.length > 0;
}

export async function getActiveAdminSubscriptions(siteId?: string): Promise<StoredPushSubscription[]> {
  const adminRoles = ["admin", "superadmin"];
  let query = `SELECT * FROM web_push_subscriptions WHERE role IN (?, ?)`;
  const params: string[] = [adminRoles[0], adminRoles[1]];

  if (siteId && siteId !== "main") {
    query += ` AND (site_id = ? OR site_id = 'main')`;
    params.push(siteId);
  }

  query += ` ORDER BY updated_at DESC`;

  const [rows] = await pool.execute<PushSubscriptionRow[]>(query, params);
  return rows.map(mapRowToSubscription);
}

export async function getUserSubscriptions(userId: string): Promise<StoredPushSubscription[]> {
  const [rows] = await pool.execute<PushSubscriptionRow[]>(
    `SELECT * FROM web_push_subscriptions WHERE user_id = ? ORDER BY updated_at DESC`,
    [userId],
  );
  return rows.map(mapRowToSubscription);
}
