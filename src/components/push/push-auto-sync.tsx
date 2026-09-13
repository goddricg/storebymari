"use client";

import { useEffect, useRef } from "react";
import { isPushSupported, syncPushSubscription } from "@/lib/push/client";

const SYNC_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

export function PushAutoSync() {
  const lastSyncRef = useRef<number>(0);
  const isSyncingRef = useRef<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isPushSupported()) return;

    const performSync = async () => {
      if (typeof Notification === "undefined") return;
      if (Notification.permission !== "granted") return;

      const now = Date.now();
      if (isSyncingRef.current || now - lastSyncRef.current < SYNC_THROTTLE_MS) {
        return;
      }

      isSyncingRef.current = true;
      try {
        await syncPushSubscription();
        lastSyncRef.current = Date.now();
      } catch (err) {
        console.warn("[PushAutoSync] Silent sync failed:", err);
      } finally {
        isSyncingRef.current = false;
      }
    };

    // Initial silent sync on mount
    void performSync();

    // Sync on returning to tab/app
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void performSync();
      }
    };

    const handleFocus = () => {
      void performSync();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  return null;
}
