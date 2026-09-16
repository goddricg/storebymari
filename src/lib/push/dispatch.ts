import { configureVapid, webpush } from "./vapid";
import {
  deletePushSubscription,
  getActiveAdminSubscriptions,
  getUserSubscriptions,
  StoredPushSubscription,
} from "./repository";
import { summarizeSupportCaseProblem } from "@/lib/support/notifications";
import { SITE_BRAND_PWA_BADGE_PATH, SITE_BRAND_PWA_ICON_192_PATH } from "@/lib/site-branding";

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
  data?: Record<string, unknown>;
}

export interface PushDispatchResult {
  total: number;
  sent: number;
  failed: number;
  cleaned: number;
}

export async function sendPushNotification(
  subscription: StoredPushSubscription,
  payload: PushNotificationPayload,
): Promise<{ success: boolean; cleaned?: boolean; error?: string }> {
  // Support Expo Native Mobile App Push Notifications
  if (
    subscription.endpoint === "https://exp.host/--/api/v2/push/send" ||
    subscription.auth === "expo" ||
    subscription.p256dh?.startsWith("ExponentPushToken")
  ) {
    try {
      const expoRes = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          to: subscription.p256dh,
          title: payload.title,
          body: payload.body,
          data: {
            url: payload.url || "/",
            ...(payload.data || {}),
          },
          sound: "default",
          priority: "high",
          channelId: "default",
        }),
      });
      return { success: expoRes.ok };
    } catch (e: any) {
      console.error("[Push] Error sending Expo push notification:", e?.message || e);
      return { success: false, error: e?.message || "Expo send failed" };
    }
  }

  const ready = configureVapid();
  if (!ready) {
    return { success: false, error: "VAPID not configured" };
  }

  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  };

  const payloadString = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || SITE_BRAND_PWA_ICON_192_PATH,
    badge: payload.badge || SITE_BRAND_PWA_BADGE_PATH,
    tag: payload.tag || "push-" + Date.now(),
    url: payload.url || "/admin/support",
    data: payload.data || {},
  });

  try {
    await webpush.sendNotification(pushSubscription, payloadString);
    return { success: true };
  } catch (error: any) {
    const statusCode = error?.statusCode;
    // 404 Not Found or 410 Gone indicates the push subscription is expired or unsubscribed
    if (statusCode === 404 || statusCode === 410) {
      console.warn(
        `[Push] Subscription expired or gone (${statusCode}). Auto-pruning subscription for user ${subscription.userId}...`,
      );
      await deletePushSubscription(subscription.endpoint).catch((delErr) => {
        console.error("[Push] Failed to prune dead subscription:", delErr);
      });
      return { success: false, cleaned: true, error: `Subscription expired (${statusCode})` };
    }

    console.error("[Push] Error sending push notification:", error?.message || error);
    return { success: false, error: error?.message || "Send failed" };
  }
}

export interface SupportCaseNotificationParams {
  id: string;
  caseCode: string;
  productName?: string | null;
  problemDescription: string;
  reporterName?: string | null;
  reporterEmail?: string | null;
  siteId?: string;
}

export async function dispatchSupportCaseNotificationToAdmins(
  params: SupportCaseNotificationParams,
): Promise<PushDispatchResult> {
  const ready = configureVapid();
  if (!ready) {
    console.warn("[Push] VAPID is not configured, skipping dispatchSupportCaseNotificationToAdmins");
    return { total: 0, sent: 0, failed: 0, cleaned: 0 };
  }

  const subscriptions = await getActiveAdminSubscriptions(params.siteId);
  if (subscriptions.length === 0) {
    return { total: 0, sent: 0, failed: 0, cleaned: 0 };
  }

  const problemText = summarizeSupportCaseProblem(params.problemDescription, 80);
  const prodPrefix = params.productName ? `[${params.productName}] ` : "";
  const reporter = params.reporterName || params.reporterEmail || "ลูกค้า";

  const payload: PushNotificationPayload = {
    title: `🚨 เคสปัญหาใหม่: ${params.caseCode}`,
    body: `${prodPrefix}${problemText} (แจ้งโดย ${reporter})`,
    icon: SITE_BRAND_PWA_ICON_192_PATH,
    badge: SITE_BRAND_PWA_BADGE_PATH,
    tag: `support-${params.caseCode}`,
    url: `/admin?menu=support&caseId=${encodeURIComponent(params.id)}`,
    data: {
      caseId: params.id,
      caseCode: params.caseCode,
      productName: params.productName,
      type: "support_case",
      soundType: "admin_support",
      sound: "/sounds/admin-support-case.wav",
    },
  };

  let sent = 0;
  let failed = 0;
  let cleaned = 0;

  const results = await Promise.allSettled(
    subscriptions.map((sub) => sendPushNotification(sub, payload)),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      if (result.value.success) {
        sent++;
      } else {
        failed++;
        if (result.value.cleaned) {
          cleaned++;
        }
      }
    } else {
      failed++;
    }
  }

  return {
    total: subscriptions.length,
    sent,
    failed,
    cleaned,
  };
}

export interface CustomerNotificationParams {
  userId: string;
  title: string;
  body: string;
  url?: string;
  soundType?: "admin_support" | "case_resolved" | "general_announcement";
  tag?: string;
  data?: Record<string, unknown>;
}

export async function dispatchNotificationToUser(
  params: CustomerNotificationParams,
): Promise<PushDispatchResult> {
  const ready = configureVapid();
  if (!ready) {
    return { total: 0, sent: 0, failed: 0, cleaned: 0 };
  }

  const subscriptions = await getUserSubscriptions(params.userId);
  if (subscriptions.length === 0) {
    return { total: 0, sent: 0, failed: 0, cleaned: 0 };
  }

  const soundFile =
    params.soundType === "admin_support"
      ? "/sounds/admin-support-case.wav"
      : params.soundType === "general_announcement"
        ? "/sounds/general-announcement.wav"
        : "/sounds/case-resolved.wav";

  const payload: PushNotificationPayload = {
    title: params.title,
    body: params.body,
    icon: SITE_BRAND_PWA_ICON_192_PATH,
    badge: SITE_BRAND_PWA_BADGE_PATH,
    tag: params.tag || `notif-${Date.now()}`,
    url: params.url || "/",
    data: {
      url: params.url || "/",
      soundType: params.soundType || "case_resolved",
      sound: soundFile,
      ...(params.data || {}),
    },
  };

  let sent = 0;
  let failed = 0;
  let cleaned = 0;

  const results = await Promise.allSettled(
    subscriptions.map((sub) => sendPushNotification(sub, payload)),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      if (result.value.success) {
        sent++;
      } else {
        failed++;
        if (result.value.cleaned) {
          cleaned++;
        }
      }
    } else {
      failed++;
    }
  }

  return {
    total: subscriptions.length,
    sent,
    failed,
    cleaned,
  };
}

