import { randomUUID } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import pool from "@/lib/mysql";
import { configureVapid } from "./vapid";
import {
  sendPushNotification,
  type PushNotificationPayload,
  type PushDispatchResult,
} from "./dispatch";
import { StoredPushSubscription } from "./repository";
import { createBroadcastUserNotifications } from "@/lib/notifications/repository";
import { SITE_BRAND_PWA_BADGE_PATH, SITE_BRAND_PWA_ICON_192_PATH } from "@/lib/site-branding";

export interface BroadcastNotificationInput {
  title: string;
  body: string;
  url?: string | null;
  target?: string;
  siteId?: string;
  senderId?: string | null;
  senderEmail?: string | null;
  senderName?: string | null;
}

export interface BroadcastRecord {
  id: string;
  siteId: string;
  title: string;
  body: string;
  url: string | null;
  target: string;
  senderId: string | null;
  senderEmail: string | null;
  senderName: string | null;
  recipientsCount: number;
  sentCount: number;
  failedCount: number;
  cleanedCount: number;
  createdAt: Date;
}

export async function broadcastPushNotification(
  input: BroadcastNotificationInput,
): Promise<{
  id: string;
  dispatchResult: PushDispatchResult;
}> {
  const ready = configureVapid();
  if (!ready) {
    throw new Error("VAPID is not configured on this server");
  }

  const broadcastId = randomUUID();
  const siteId = input.siteId || "main";
  const target = (input.target || "ALL").toUpperCase();

  // Query matching subscriptions
  let query = `SELECT * FROM web_push_subscriptions WHERE (site_id = ? OR site_id = 'main')`;
  const params: string[] = [siteId];

  if (target === "ADMIN") {
    query += ` AND role IN ('admin', 'superadmin', 'owner')`;
  } else if (target === "USER") {
    query += ` AND role = 'user'`;
  }

  query += ` ORDER BY updated_at DESC`;

  const [rows] = await pool.execute<RowDataPacket[]>(query, params);

  const subscriptions: StoredPushSubscription[] = rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    siteId: r.site_id,
    endpoint: r.endpoint,
    endpointHash: r.endpoint_hash,
    p256dh: r.p256dh,
    auth: r.auth,
    userAgent: r.user_agent,
    role: r.role,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  const payload: PushNotificationPayload = {
    title: input.title,
    body: input.body,
    icon: SITE_BRAND_PWA_ICON_192_PATH,
    badge: SITE_BRAND_PWA_BADGE_PATH,
    url: input.url || "/",
    tag: `broadcast-${broadcastId}`,
    data: {
      broadcastId,
      url: input.url || "/",
      soundType: "general_announcement",
      sound: "/sounds/general-announcement.wav",
      timestamp: Date.now(),
    },
  };

  // Populate in-app notification bell for users if broadcasting to ALL or USER
  if (target === "ALL" || target === "USER") {
    createBroadcastUserNotifications({
      title: input.title,
      message: input.body,
      linkUrl: input.url || "/",
      siteId,
      referenceId: broadcastId,
      target,
    }).catch((err) => {
      console.error("[Broadcast] Failed to record in-app user notifications:", err);
    });
  }

  let sent = 0;
  let failed = 0;
  let cleaned = 0;

  // Process in batches of 25
  const BATCH_SIZE = 25;
  for (let i = 0; i < subscriptions.length; i += BATCH_SIZE) {
    const batch = subscriptions.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((sub) => sendPushNotification(sub, payload)),
    );

    for (const res of results) {
      if (res.status === "fulfilled") {
        if (res.value.success) {
          sent++;
        } else {
          failed++;
          if (res.value.cleaned) cleaned++;
        }
      } else {
        failed++;
      }
    }
  }

  // Record in broadcast_notifications
  await pool.execute<ResultSetHeader>(
    `INSERT INTO broadcast_notifications (
       id, site_id, title, body, url, target, sender_id, sender_email, sender_name,
       recipients_count, sent_count, failed_count, cleaned_count, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6))`,
    [
      broadcastId,
      siteId,
      input.title,
      input.body,
      input.url || null,
      target,
      input.senderId || null,
      input.senderEmail || null,
      input.senderName || null,
      subscriptions.length,
      sent,
      failed,
      cleaned,
    ],
  );

  return {
    id: broadcastId,
    dispatchResult: {
      total: subscriptions.length,
      sent,
      failed,
      cleaned,
    },
  };
}

export async function getRecentBroadcasts(
  siteId = "main",
  limit = 20,
): Promise<BroadcastRecord[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT * FROM broadcast_notifications 
     WHERE site_id = ? OR site_id = 'main'
     ORDER BY created_at DESC 
     LIMIT ?`,
    [siteId, limit],
  );

  return rows.map((r) => ({
    id: r.id,
    siteId: r.site_id,
    title: r.title,
    body: r.body,
    url: r.url,
    target: r.target,
    senderId: r.sender_id,
    senderEmail: r.sender_email,
    senderName: r.sender_name,
    recipientsCount: r.recipients_count,
    sentCount: r.sent_count,
    failedCount: r.failed_count,
    cleanedCount: r.cleaned_count,
    createdAt: r.created_at,
  }));
}

export interface RestockAuditEvent {
  id: string;
  productId?: string;
  productName: string;
  addedCount: number;
  remainingStock: number;
  previousStock: number;
  currentLiveStock: number;
  currentPrice?: string;
  isPublished?: boolean;
  actorName: string;
  actorEmail: string;
  occurredAt: Date;
}

export async function getRecentRestockAuditEvents(
  siteId = "main",
  limit = 20,
): Promise<RestockAuditEvent[]> {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT 
         a.id, a.entity_id, a.entity_label, a.after_json, a.actor_name, a.actor_email, a.occurred_at,
         p.id AS product_id, p.name AS current_product_name, p.stock AS current_live_stock, p.price AS current_price, p.is_published
       FROM admin_audit_events a
       LEFT JOIN products p ON (p.type_id = a.entity_id OR p.name = a.entity_label OR p.id = a.entity_id) AND (p.site_id = ? OR p.site_id = 'main')
       WHERE (a.site_id = ? OR a.site_id = 'main') AND a.event_action = 'STOCK_ACCOUNT_APPEND'
       ORDER BY a.occurred_at DESC 
       LIMIT ?`,
      [siteId, siteId, limit],
    );

    return rows.map((r) => {
      let after: any = {};
      try {
        after = typeof r.after_json === "string" ? JSON.parse(r.after_json) : r.after_json || {};
      } catch {
        after = {};
      }

      const snapshotRemaining = Number(after.remainingStock || 0);
      const liveStock = r.current_live_stock !== null && r.current_live_stock !== undefined
        ? Number(r.current_live_stock)
        : snapshotRemaining;

      return {
        id: r.id,
        productId: r.product_id || undefined,
        productName: r.current_product_name || r.entity_label || "ไม่ระบุชื่อสินค้า",
        addedCount: Number(after.addedCount || 0),
        remainingStock: snapshotRemaining,
        previousStock: Number(after.previousStock || 0),
        currentLiveStock: liveStock,
        currentPrice: r.current_price ? String(r.current_price) : undefined,
        isPublished: r.is_published !== null && r.is_published !== undefined ? Boolean(r.is_published) : true,
        actorName: r.actor_name || "Admin",
        actorEmail: r.actor_email || "",
        occurredAt: r.occurred_at,
      };
    });
  } catch (error) {
    console.error("[getRecentRestockAuditEvents Error]:", error);
    return [];
  }
}
