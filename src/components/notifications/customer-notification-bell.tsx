"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Megaphone,
  MessageSquareQuote,
  PackageCheck,
  RefreshCw,
  Sparkles,
  Volume2,
  VolumeX,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PushSubscriptionControl from "@/components/push/push-subscription-control";
import type { PublicUser } from "@/lib/auth/user";
import type { UserNotification } from "@/lib/notifications/repository";
import {
  isSoundMuted,
  setSoundMuted,
  playNotificationSound,
  previewNotificationSound,
} from "@/lib/audio/notification-sounds";
import { updateCustomerAppBadge } from "@/lib/ui/badging";

const POLL_INTERVAL_MS = 30_000;

type NotificationsApiResponse = {
  ok?: boolean;
  notifications?: UserNotification[];
  unreadCount?: number;
  unreadResolvedCount?: number;
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

function getNotificationBadge(type: UserNotification["type"]) {
  switch (type) {
    case "support_resolved":
      return {
        label: "แก้ไขสำเร็จ",
        className: "bg-emerald-500 text-white hover:bg-emerald-600",
        icon: CheckCircle2,
      };
    case "support_reply":
      return {
        label: "แอดมินตอบกลับ",
        className: "bg-sky-500 text-white hover:bg-sky-600",
        icon: MessageSquareQuote,
      };
    case "order_success":
      return {
        label: "สั่งซื้อสำเร็จ",
        className: "bg-amber-500 text-white hover:bg-amber-600",
        icon: PackageCheck,
      };
    case "topup_success":
      return {
        label: "เติมเงินสำเร็จ",
        className: "bg-emerald-600 text-white hover:bg-emerald-700",
        icon: Wallet,
      };
    case "broadcast":
      return {
        label: "ประกาศ",
        className: "bg-purple-500 text-white hover:bg-purple-600",
        icon: Megaphone,
      };
    default:
      return {
        label: "ข่าวสาร",
        className: "bg-[#7f485c] text-white hover:bg-[#6b3c4d]",
        icon: Sparkles,
      };
  }
}

const GUEST_READ_KEY = "appbymari_guest_read_notification_ids";

export default function CustomerNotificationBell({
  user,
}: {
  user?: PublicUser | null;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const prevUnreadRef = useRef<number>(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarkingRead, setIsMarkingRead] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadResolvedCount, setUnreadResolvedCount] = useState(0);
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
      void previewNotificationSound("case_resolved");
    }
  };

  const loadNotifications = useCallback(async (isBackgroundPoll = false) => {
    try {
      const response = await fetch("/api/notifications", {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as NotificationsApiResponse;

      if (!response.ok || !data.ok) {
        return;
      }

      let newNotifs = Array.isArray(data.notifications) ? data.notifications : [];
      let newUnread = Math.max(0, Number(data.unreadCount ?? 0));
      let newResolvedUnread = Math.max(0, Number(data.unreadResolvedCount ?? 0));

      if (!user) {
        try {
          const stored = localStorage.getItem(GUEST_READ_KEY);
          const readIds: string[] = stored ? JSON.parse(stored) : [];
          newNotifs = newNotifs.map((n) => ({
            ...n,
            isRead: readIds.includes(n.id),
          }));
          newUnread = newNotifs.filter((n) => !n.isRead).length;
          newResolvedUnread = 0;
        } catch {
          // ignore storage error
        }
      }

      // Play sound if new unread arrived during polling
      if (isBackgroundPoll && newUnread > prevUnreadRef.current) {
        const hasResolvedOrReply = newNotifs.some(
          (n) => !n.isRead && (n.type === "support_resolved" || n.type === "support_reply")
        );
        if (hasResolvedOrReply) {
          void playNotificationSound("case_resolved");
        } else {
          void playNotificationSound("general_announcement");
        }
      }

      prevUnreadRef.current = newUnread;
      setNotifications(newNotifs);
      setUnreadCount(newUnread);
      setUnreadResolvedCount(newResolvedUnread);
    } catch {
      // Keep last visible on network glitch
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Polling loop
  useEffect(() => {
    void loadNotifications(false);

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadNotifications(true);
      }
    }, POLL_INTERVAL_MS);

    const handleFocus = () => void loadNotifications(false);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadNotifications]);

  // Listen to Service Worker push events
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "APP_PUSH_NOTIFICATION_RECEIVED") {
        const soundType = event.data.soundType || "case_resolved";
        void playNotificationSound(soundType);
        void loadNotifications(false);
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, [loadNotifications]);

  // Sync App Badging API for customer unread notifications
  useEffect(() => {
    updateCustomerAppBadge(unreadCount);
  }, [unreadCount]);

  // Close on outside click
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

  // Position popover
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

  const handleNotificationClick = async (notification: UserNotification) => {
    if (isMarkingRead) return;

    if (!notification.isRead) {
      setIsMarkingRead(notification.id);
      try {
        if (!user) {
          try {
            const stored = localStorage.getItem(GUEST_READ_KEY);
            const readIds: string[] = stored ? JSON.parse(stored) : [];
            if (!readIds.includes(notification.id)) {
              readIds.push(notification.id);
              localStorage.setItem(GUEST_READ_KEY, JSON.stringify(readIds.slice(-100)));
            }
          } catch {
            // ignore
          }
        } else {
          await fetch("/api/notifications/read", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: notification.id }),
          });
        }

        setNotifications((current) =>
          current.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item))
        );
        setUnreadCount((current) => Math.max(0, current - 1));
        if (notification.type === "support_resolved") {
          setUnreadResolvedCount((current) => Math.max(0, current - 1));
        }
      } catch {
        // Continue navigation
      } finally {
        setIsMarkingRead(null);
      }
    }

    setIsOpen(false);
    if (notification.linkUrl) {
      router.push(notification.linkUrl);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      if (!user) {
        try {
          const allIds = notifications.map((n) => n.id);
          localStorage.setItem(GUEST_READ_KEY, JSON.stringify(allIds));
        } catch {
          // ignore
        }
      } else {
        await fetch("/api/notifications/read", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ all: true }),
        });
      }

      setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
      setUnreadResolvedCount(0);
      toast.success("อ่านการแจ้งเตือนทั้งหมดแล้ว");
    } catch {
      toast.error("ไม่สามารถอัปเดตได้");
    }
  };

  const displayedCount = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        ref={triggerRef}
        aria-label={unreadCount > 0 ? `การแจ้งเตือนใหม่ ${unreadCount} รายการ` : "การแจ้งเตือน"}
        aria-expanded={isOpen}
        aria-controls="customer-notification-popover"
        onClick={() => {
          setIsOpen((current) => !current);
          if (!isOpen) {
            setPopoverPosition(null);
            void loadNotifications(false);
          }
        }}
        className="relative flex size-10 items-center justify-center rounded-xl text-[#9a5832] transition-colors hover:bg-[var(--theme-color)]/10 hover:text-[var(--theme-color)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-color)]"
      >
        <Bell className="size-5" aria-hidden="true" />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-1 flex min-w-5 items-center justify-center rounded-full border-2 border-white bg-[#dc2626] px-1 text-[10px] font-bold leading-4 text-white shadow-sm animate-pulse">
            {displayedCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div
          id="customer-notification-popover"
          role="dialog"
          aria-labelledby="customer-notification-title"
          style={
            popoverPosition
              ? {
                  top: `${popoverPosition.top}px`,
                  right: `${popoverPosition.right}px`,
                }
              : { visibility: "hidden" }
          }
          className="fixed z-[80] w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-[#f3a4c0]/70 bg-white shadow-[0_16px_40px_rgba(127,72,92,0.2)]"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-[#f3d4df] bg-[#fff7fa] px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 id="customer-notification-title" className="truncate text-sm font-bold text-[#7f485c]">
                  การแจ้งเตือน
                </h2>
                {unreadCount > 0 ? (
                  <Badge className="bg-[#dc2626] px-1.5 py-0.2 text-[10px] text-white">
                    {unreadCount} ใหม่
                  </Badge>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-[#9a6b78]">
                {unreadCount > 0 ? `มีข้อความที่ยังไม่ได้อ่าน ${unreadCount} รายการ` : "ไม่มีข้อความใหม่"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={toggleSoundMute}
                title={soundMuted ? "เปิดเสียงแจ้งเตือน" : "ปิดเสียงแจ้งเตือน"}
                aria-label={soundMuted ? "เปิดเสียงแจ้งเตือน" : "ปิดเสียงแจ้งเตือน"}
                className="size-8 rounded-lg text-[#9a6b78] hover:bg-[#fce8f0] hover:text-[#c44575]"
              >
                {soundMuted ? <VolumeX className="size-4 text-gray-400" /> : <Volume2 className="size-4 text-[#d85a86]" />}
              </Button>

              {unreadCount > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void handleMarkAllRead()}
                  title="อ่านทั้งหมดแล้ว"
                  aria-label="อ่านทั้งหมดแล้ว"
                  className="size-8 rounded-lg text-[#d85a86] hover:bg-[#fce8f0] hover:text-[#c44575]"
                >
                  <CheckCheck className="size-4" />
                </Button>
              ) : null}

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => void loadNotifications(false)}
                disabled={isLoading}
                aria-label="รีเฟรชการแจ้งเตือน"
                className="size-8 rounded-lg text-[#d85a86] hover:bg-[#fce8f0] hover:text-[#c44575]"
              >
                {isLoading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              </Button>
            </div>
          </div>

          {/* List of Notifications */}
          <div className="max-h-[min(60vh,420px)] overflow-y-auto">
            {isLoading && notifications.length === 0 ? (
              <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-[#9a6b78]">
                <Loader2 className="size-4 animate-spin" /> กำลังโหลด...
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-[#9a6b78]">
                <Bell className="mx-auto mb-2 size-7 text-[#e8a2b9]" aria-hidden="true" />
                ยังไม่มีการแจ้งเตือนใหม่
              </div>
            ) : (
              <div className="divide-y divide-[#f3d4df]">
                {notifications.map((notification) => {
                  const badgeInfo = getNotificationBadge(notification.type);
                  const Icon = badgeInfo.icon;
                  return (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => void handleNotificationClick(notification)}
                      disabled={isMarkingRead !== null}
                      className={`block w-full px-4 py-3 text-left transition-colors focus-visible:outline-none disabled:cursor-wait ${
                        !notification.isRead
                          ? "bg-[#fff2f6]/60 hover:bg-[#ffeaf1]"
                          : "hover:bg-[#fff7fa]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${badgeInfo.className}`}
                          >
                            <Icon className="size-3" />
                            {badgeInfo.label}
                          </span>
                          {!notification.isRead ? (
                            <span className="size-2 rounded-full bg-[#dc2626]" aria-label="ยังไม่อ่าน" />
                          ) : null}
                        </div>
                        <span className="shrink-0 text-[10px] text-[#a47987]">
                          {formatNotificationDate(notification.createdAt)}
                        </span>
                      </div>

                      <p className="mt-1.5 text-xs font-bold text-[#4a2e38] line-clamp-1">
                        {notification.title}
                      </p>
                      <p className="mt-0.5 text-xs leading-5 text-[#6b7280] line-clamp-2">
                        {notification.message}
                      </p>

                      {notification.linkUrl ? (
                        <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--theme-color)] hover:underline">
                          แตะเพื่อดูรายละเอียด &rarr;
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Web Push Toggle for Customer */}
          <div className="border-t border-[#f3d4df] bg-[#fff0f5] px-4 py-2.5">
            <PushSubscriptionControl compact />
          </div>

          {/* Footer Quick Links */}
          <div className="flex items-center justify-between border-t border-[#f3d4df] bg-[#fff7fa] px-4 py-2.5 text-xs font-semibold text-[var(--theme-color)]">
            {user ? (
              <>
                <Link
                  href="/support/history"
                  onClick={() => setIsOpen(false)}
                  className="hover:underline flex items-center gap-1"
                >
                  ประวัติเคสปัญหา
                  <ExternalLink className="size-3" />
                </Link>
                <Link
                  href="/dashboard/orders"
                  onClick={() => setIsOpen(false)}
                  className="hover:underline flex items-center gap-1"
                >
                  ประวัติคำสั่งซื้อ
                  <ExternalLink className="size-3" />
                </Link>
              </>
            ) : (
              <Link
                href="/login"
                onClick={() => setIsOpen(false)}
                className="hover:underline flex items-center justify-center gap-1 text-[var(--theme-color)] w-full py-0.5"
              >
                เข้าสู่ระบบเพื่อดูคำสั่งซื้อและประวัติเคส &rarr;
              </Link>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
