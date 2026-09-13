"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, ExternalLink, Loader2, RefreshCw, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PushSubscriptionControl from "@/components/push/push-subscription-control";
import { isAdminUser } from "@/lib/auth/roles";
import { updateAdminAppBadge } from "@/lib/ui/badging";
import type { PublicUser } from "@/lib/auth/user";
import type { SupportCaseNotification } from "@/lib/support/notifications";
import {
  isSoundMuted,
  setSoundMuted,
  playNotificationSound,
  previewNotificationSound,
} from "@/lib/audio/notification-sounds";

const POLL_INTERVAL_MS = 30_000;

type NotificationResponse = {
  ok?: boolean;
  notifications?: SupportCaseNotification[];
  unreadCount?: number;
};

function formatNotificationDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "ไม่ทราบเวลา";

  return date.toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  });
}

function reporterLabel(notification: SupportCaseNotification): string {
  return notification.reporterName || notification.reporterEmail || "ผู้ใช้";
}

export default function SupportNotificationBell({
  user,
}: {
  user: PublicUser;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const prevUnreadRef = useRef<number>(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarkingRead, setIsMarkingRead] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<SupportCaseNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; right: number } | null>(null);
  const [soundMuted, setSoundMutedState] = useState(false);

  useEffect(() => {
    setSoundMutedState(isSoundMuted());
  }, []);

  const toggleSoundMute = () => {
    const nextState = !soundMuted;
    setSoundMuted(nextState);
    setSoundMutedState(nextState);
    toast.info(nextState ? "ปิดเสียงแจ้งเตือนแล้ว" : "เปิดเสียงแจ้งเตือนแล้ว");
    if (!nextState) {
      void previewNotificationSound("admin_support");
    }
  };

  const loadNotifications = useCallback(async (isBackgroundPoll = false) => {
    try {
      const response = await fetch("/api/admin/support-notifications", {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as NotificationResponse;

      if (!response.ok || !data.ok) {
        if (response.status !== 401 && response.status !== 403) {
          throw new Error("ไม่สามารถโหลดการแจ้งเตือนได้");
        }
        return;
      }

      const newUnread = Math.max(0, Number(data.unreadCount ?? 0));
      if (isBackgroundPoll && newUnread > prevUnreadRef.current) {
        void playNotificationSound("admin_support");
      }

      prevUnreadRef.current = newUnread;
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadCount(newUnread);
    } catch {
      // Keep the last successful result visible during a transient network or
      // deployment hiccup. The next interval/focus event retries automatically.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdminUser(user)) return;

    void loadNotifications(false);

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadNotifications(true);
    }, POLL_INTERVAL_MS);

    const handleFocus = () => void loadNotifications(false);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadNotifications, user]);

  // Listen to Service Worker push events for Admin
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "APP_PUSH_NOTIFICATION_RECEIVED") {
        if (event.data.soundType === "admin_support") {
          void playNotificationSound("admin_support");
          void loadNotifications(false);
        }
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, [loadNotifications]);

  useEffect(() => {
    updateAdminAppBadge(unreadCount, isAdminUser(user));
  }, [unreadCount, user]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && rootRef.current && !rootRef.current.contains(target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const updatePopoverPosition = useCallback(() => {
    if (typeof window === "undefined") return;

    const trigger = triggerRef.current;
    if (!trigger) return;

    const triggerRect = trigger.getBoundingClientRect();
    const isCompactViewport = window.matchMedia("(max-width: 1023px)").matches;
    const rightGap = isCompactViewport
      ? 12
      : Math.max(12, window.innerWidth - triggerRect.right);

    setPopoverPosition({
      top: Math.round(triggerRect.bottom + 12),
      right: Math.round(rightGap),
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);

    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [isOpen, updatePopoverPosition]);

  const handleNotificationClick = async (notification: SupportCaseNotification) => {
    if (isMarkingRead) return;

    setIsMarkingRead(notification.id);
    try {
      const response = await fetch("/api/admin/support-notifications", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: notification.id }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };

      if (!response.ok || !data.ok) {
        throw new Error(data.message || "ไม่สามารถเปิดการแจ้งเตือนได้");
      }

      setNotifications((current) => current.filter((item) => item.id !== notification.id));
      setUnreadCount((current) => Math.max(0, current - 1));
      setIsOpen(false);
      router.push(`/admin?menu=support&caseId=${encodeURIComponent(notification.id)}`, {
        scroll: false,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ไม่สามารถเปิดการแจ้งเตือนได้");
    } finally {
      setIsMarkingRead(null);
    }
  };

  if (!isAdminUser(user)) return null;

  const displayedCount = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        ref={triggerRef}
        aria-label={unreadCount > 0 ? `แจ้งเตือนเคสใหม่ ${unreadCount} รายการ` : "แจ้งเตือนเคสแจ้งปัญหา"}
        aria-expanded={isOpen}
        aria-controls="support-case-notification-popover"
        onClick={() => {
          setIsOpen((current) => !current);
          if (!isOpen) {
            setPopoverPosition(null);
            void loadNotifications();
          }
        }}
        className="relative flex size-10 items-center justify-center rounded-xl text-[#9a5832] transition-colors hover:bg-[var(--theme-color)]/10 hover:text-[var(--theme-color)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-color)]"
      >
        <Bell className="size-5" aria-hidden="true" />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-1 flex min-w-5 items-center justify-center rounded-full border-2 border-white bg-[#dc2626] px-1 text-[10px] font-bold leading-4 text-white shadow-sm">
            {displayedCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div
          id="support-case-notification-popover"
          role="dialog"
          aria-labelledby="support-case-notification-title"
          style={popoverPosition ? {
            top: `${popoverPosition.top}px`,
            right: `${popoverPosition.right}px`,
          } : { visibility: "hidden" }}
          className="fixed z-[80] w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-[#f3a4c0]/70 bg-white shadow-[0_16px_40px_rgba(127,72,92,0.2)]"
        >
          <div className="flex items-start justify-between gap-3 border-b border-[#f3d4df] bg-[#fff7fa] px-4 py-3">
            <div className="min-w-0">
              <h2 id="support-case-notification-title" className="truncate text-sm font-bold text-[#7f485c]">
                แจ้งเตือนเคสแจ้งปัญหา
              </h2>
              <p className="mt-0.5 text-xs text-[#9a6b78]">
                {unreadCount > 0 ? `ยังไม่ได้อ่าน ${unreadCount.toLocaleString("th-TH")} รายการ` : "ไม่มีเคสใหม่ที่ยังไม่ได้อ่าน"}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={toggleSoundMute}
                title={soundMuted ? "เปิดเสียงแจ้งเตือน" : "ปิดเสียงแจ้งเตือน"}
                aria-label={soundMuted ? "เปิดเสียงแจ้งเตือน" : "ปิดเสียงแจ้งเตือน"}
                className="rounded-lg text-[#9a6b78] hover:bg-[#fce8f0] hover:text-[#c44575]"
              >
                {soundMuted ? <VolumeX className="size-4 text-gray-400" /> : <Volume2 className="size-4 text-[#d85a86]" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => void loadNotifications(false)}
                disabled={isLoading}
                aria-label="รีเฟรชการแจ้งเตือน"
                className="rounded-lg text-[#d85a86] hover:bg-[#fce8f0] hover:text-[#c44575]"
              >
                {isLoading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              </Button>
            </div>
          </div>

          <div className="max-h-[min(60vh,420px)] overflow-y-auto">
            {isLoading && notifications.length === 0 ? (
              <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-[#9a6b78]">
                <Loader2 className="size-4 animate-spin" /> กำลังโหลด...
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-[#9a6b78]">
                <Bell className="mx-auto mb-2 size-7 text-[#e8a2b9]" aria-hidden="true" />
                ยังไม่มีเคสแจ้งปัญหาใหม่
              </div>
            ) : (
              <div className="divide-y divide-[#f3d4df]">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => void handleNotificationClick(notification)}
                    disabled={isMarkingRead !== null}
                    className="block w-full px-4 py-3 text-left transition-colors hover:bg-[#fff7fa] focus-visible:bg-[#fff7fa] focus-visible:outline-none disabled:cursor-wait disabled:opacity-70"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <Badge className="bg-[#dc2626] px-1.5 py-0.5 text-[10px] text-white">ใหม่</Badge>
                        <span className="truncate text-xs font-bold text-[#7f485c]">{notification.caseCode}</span>
                      </div>
                      <span className="shrink-0 text-[10px] text-[#a47987]">
                        {formatNotificationDate(notification.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 truncate text-sm font-semibold text-[#2f2530]">
                      {notification.productName || "ไม่ระบุสินค้า"} · {notification.caseType === "screen" ? "จอ" : "แอค"}
                    </p>
                    <p className="mt-1 truncate text-xs text-[#7f485c]">ผู้แจ้ง: {reporterLabel(notification)}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#6b7280]">
                      {notification.problemDescription}
                    </p>
                    <p className="mt-2 text-[11px] font-semibold text-[var(--theme-color)]">กดเพื่อเข้าไปจัดการเคส</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Push Notification Manager Section */}
          <div className="border-t border-[#f3d4df] bg-[#fff0f5] px-4 py-3">
            <PushSubscriptionControl compact />
          </div>

          <div className="border-t border-[#f3d4df] bg-[#fff7fa] px-4 py-3">
            <Link
              href="/admin?menu=support"
              onClick={() => setIsOpen(false)}
              className="flex items-center justify-center gap-2 text-xs font-semibold text-[var(--theme-color)] hover:underline"
            >
              ดูเคสแจ้งปัญหาทั้งหมด
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
