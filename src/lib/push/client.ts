// Client-side Web Push Notification Helpers

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function isIos(): boolean {
  if (typeof window === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // @ts-expect-error iOS Safari navigator.standalone check
    navigator.standalone === true
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });
    // Wait until ready
    await navigator.serviceWorker.ready;
    return registration;
  } catch (error) {
    console.error("[ServiceWorker] Registration failed:", error);
    return null;
  }
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;

  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch (error) {
    console.error("[Push] Error getting current subscription:", error);
    return null;
  }
}

export async function subscribeToPush(): Promise<{
  success: boolean;
  subscription?: PushSubscription;
  error?: string;
}> {
  if (!isPushSupported()) {
    return {
      success: false,
      error: "เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน Web Push",
    };
  }

  try {
    // 1. Check/Request Notification permission
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return {
        success: false,
        error: "คุณยังไม่ได้อนุญาตให้ส่งการแจ้งเตือน (Permission denied)",
      };
    }

    // 2. Fetch VAPID public key
    const statusRes = await fetch("/api/push/status");
    const statusData = await statusRes.json();
    const vapidKey = statusData.vapidPublicKey;

    if (!vapidKey) {
      return {
        success: false,
        error: "ไม่พบคีย์ VAPID Public Key บนเซิร์ฟเวอร์",
      };
    }

    // 3. Register service worker and get push manager
    const registration = await registerServiceWorker();
    if (!registration) {
      return {
        success: false,
        error: "ไม่สามารถติดตั้ง Service Worker ได้",
      };
    }

    // 4. Subscribe with PushManager
    const applicationServerKey = urlBase64ToUint8Array(vapidKey);
    let subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      // Re-use or refresh existing subscription
      try {
        await subscription.unsubscribe();
      } catch {
        // ignore error during unsubscribe
      }
    }

    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as BufferSource,
    });

    // 5. Send subscription to server
    const subJson = subscription.toJSON();
    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        keys: subJson.keys,
        userAgent: navigator.userAgent,
      }),
    });

    const resData = await response.json();
    if (!response.ok || !resData.ok) {
      throw new Error(resData.message || "บันทึกการสมัครรับแจ้งเตือนไม่สำเร็จ");
    }

    return { success: true, subscription };
  } catch (error: any) {
    console.error("[Push] Subscribe failed:", error);
    return {
      success: false,
      error: error?.message || "เกิดข้อผิดพลาดในการเปิดรับแจ้งเตือน",
    };
  }
}

export async function syncPushSubscription(): Promise<{
  synced: boolean;
  refreshed?: boolean;
  error?: string;
}> {
  if (!isPushSupported() || Notification.permission !== "granted") {
    return { synced: false };
  }

  try {
    const registration = await registerServiceWorker();
    if (!registration) return { synced: false, error: "No service worker" };

    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      // Permission granted but no push subscription in browser -> re-subscribe!
      const res = await subscribeToPush();
      return { synced: res.success, refreshed: true, error: res.error };
    }

    // Existing subscription -> ensure backend DB is updated
    const subJson = subscription.toJSON();
    if (!subJson.endpoint || !subJson.keys) {
      const res = await subscribeToPush();
      return { synced: res.success, refreshed: true, error: res.error };
    }

    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        keys: subJson.keys,
        userAgent: navigator.userAgent,
      }),
    });

    const resData = await response.json().catch(() => ({}));
    if (!response.ok || !resData.ok) {
      // If server rejected or token stale, full re-subscribe
      const res = await subscribeToPush();
      return { synced: res.success, refreshed: true, error: res.error };
    }

    return { synced: true, refreshed: false };
  } catch (err: any) {
    console.warn("[Push] Silent sync error:", err);
    return { synced: false, error: err?.message };
  }
}

export async function unsubscribeFromPush(): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!isPushSupported()) return { success: true };

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      }).catch((e) => console.warn("[Push] Unsubscribe server call error:", e));
    }

    return { success: true };
  } catch (error: any) {
    console.error("[Push] Unsubscribe failed:", error);
    return {
      success: false,
      error: error?.message || "เกิดข้อผิดพลาดในการยกเลิกแจ้งเตือน",
    };
  }
}

export async function sendTestNotification(): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    const response = await fetch("/api/push/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: subscription?.endpoint || undefined,
      }),
    });

    const data = await response.json();
    return {
      ok: response.ok && data.ok,
      message: data.message || (response.ok ? "ส่งแจ้งเตือนสำเร็จ" : "ส่งไม่สำเร็จ"),
    };
  } catch (error: any) {
    return {
      ok: false,
      message: error?.message || "เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์",
    };
  }
}
