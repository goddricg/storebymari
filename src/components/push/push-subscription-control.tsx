"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Check, Info, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  isPushSupported,
  isIos,
  isStandalonePwa,
  getCurrentPushSubscription,
  subscribeToPush,
  unsubscribeFromPush,
  sendTestNotification,
  registerServiceWorker,
} from "@/lib/push/client";

interface PushSubscriptionControlProps {
  compact?: boolean;
  className?: string;
  onStatusChange?: (isSubscribed: boolean) => void;
}

export default function PushSubscriptionControl({
  compact = false,
  className = "",
  onStatusChange,
}: PushSubscriptionControlProps) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permissionState, setPermissionState] = useState<NotificationPermission | "unsupported">("default");
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showIosTip, setShowIosTip] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function checkStatus() {
      if (!isPushSupported()) {
        if (isMounted) {
          setSupported(false);
          setPermissionState("unsupported");
          setIsLoading(false);
        }
        return;
      }

      setSupported(true);
      setPermissionState(Notification.permission);

      if (isIos() && !isStandalonePwa()) {
        setShowIosTip(true);
      }

      try {
        // Pre-register service worker so it's ready
        await registerServiceWorker();
        const sub = await getCurrentPushSubscription();
        if (isMounted) {
          const active = !!sub;
          setIsSubscribed(active);
          onStatusChange?.(active);
        }
      } catch (err) {
        console.warn("[Push Control] Error checking subscription:", err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void checkStatus();

    return () => {
      isMounted = false;
    };
  }, [onStatusChange]);

  const handleSubscribe = async () => {
    if (Notification.permission === "denied") {
      toast.error(
        "การแจ้งเตือนถูกปิดกั้นไว้ในเบราว์เซอร์ กรุณาเปิดอนุญาตในการตั้งค่าของเบราว์เซอร์ก่อนค่ะ",
      );
      return;
    }

    setIsActionLoading(true);
    try {
      const result = await subscribeToPush();
      if (result.success) {
        setIsSubscribed(true);
        setPermissionState("granted");
        onStatusChange?.(true);
        toast.success("เปิดรับการแจ้งเตือนเคสปัญหาบนอุปกรณ์นี้เรียบร้อยแล้ว!");
      } else {
        toast.error(result.error || "ไม่สามารถเปิดการแจ้งเตือนได้");
      }
    } catch (err: any) {
      toast.error(err?.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleUnsubscribe = async () => {
    setIsActionLoading(true);
    try {
      const result = await unsubscribeFromPush();
      if (result.success) {
        setIsSubscribed(false);
        onStatusChange?.(false);
        toast.success("ปิดการแจ้งเตือนบนอุปกรณ์นี้แล้ว");
      } else {
        toast.error(result.error || "ไม่สามารถยกเลิกการแจ้งเตือนได้");
      }
    } catch (err: any) {
      toast.error(err?.message || "เกิดข้อผิดพลาด");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleTestNotification = async () => {
    setIsTesting(true);
    try {
      const result = await sendTestNotification();
      if (result.ok) {
        toast.success("ส่งแจ้งเตือนทดสอบแล้ว! รอข้อความเด้งบนอุปกรณ์สักครู่ค่ะ");
      } else {
        toast.error(result.message || "ส่งแจ้งเตือนทดสอบไม่สำเร็จ");
      }
    } catch (err: any) {
      toast.error(err?.message || "ส่งทดสอบล้มเหลว");
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 text-xs text-gray-500 ${className}`}>
        <Loader2 className="size-3.5 animate-spin text-[var(--theme-color)]" />
        <span>กำลังตรวจสอบระบบแจ้งเตือน...</span>
      </div>
    );
  }

  if (supported === false) {
    if (compact) {
      return (
        <div className={`text-[11px] text-gray-500 ${className}`}>
          เบราว์เซอร์นี้ไม่รองรับ Web Push
        </div>
      );
    }
    return (
      <div className={`rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 ${className}`}>
        <div className="flex items-center gap-2 font-semibold">
          <Info className="size-4 shrink-0 text-amber-600" />
          <span>เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน Web Push Notifications</span>
        </div>
        <p className="mt-1 text-[11px] text-amber-700">
          แนะนำให้ใช้งานผ่าน Google Chrome, Microsoft Edge หรือ Safari (iOS 16.4+ โดยเพิ่มไปที่หน้าจอโฮม)
        </p>
      </div>
    );
  }

  // Compact Mode (for Navbar / Dropdown / Popover)
  if (compact) {
    return (
      <div className={`flex flex-col gap-1.5 ${className}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Smartphone className="size-4 text-[var(--theme-color)]" />
            <span className="text-xs font-semibold text-gray-800">แจ้งเตือนบนมือถือ</span>
            {isSubscribed ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                เปิดแล้ว
              </span>
            ) : (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                ปิดอยู่
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {isSubscribed ? (
              <>
                <button
                  type="button"
                  disabled={isTesting}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleTestNotification();
                  }}
                  className="rounded-lg border border-[#f3a4c0] bg-white px-2 py-1 text-[11px] font-medium text-[#7f485c] transition-colors hover:bg-[#ffeef4] disabled:opacity-50"
                  title="ส่งข้อความทดสอบมาที่เครื่องนี้"
                >
                  {isTesting ? <Loader2 className="size-3 animate-spin" /> : "ทดสอบ"}
                </button>
                <button
                  type="button"
                  disabled={isActionLoading}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleUnsubscribe();
                  }}
                  className="rounded-lg bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-50"
                >
                  {isActionLoading ? <Loader2 className="size-3 animate-spin" /> : "ปิด"}
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={isActionLoading}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleSubscribe();
                }}
                className="flex items-center gap-1 rounded-lg bg-[var(--theme-color)] px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm transition-all hover:brightness-105 active:scale-95 disabled:opacity-50"
              >
                {isActionLoading ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <BellRing className="size-3" />
                )}
                เปิดแจ้งเตือน
              </button>
            )}
          </div>
        </div>

        {showIosTip && !isSubscribed && (
          <p className="rounded-lg bg-amber-50/80 p-2 text-[10px] leading-relaxed text-amber-800">
            💡 <strong>ผู้ใช้ iPhone:</strong> กดปุ่มแชร์ใน Safari แล้วเลือก <u>&quot;เพิ่มไปยังหน้าจอโฮม&quot; (Add to Home Screen)</u> ก่อน จึงจะสามารถรับแจ้งเตือนเมื่อปิดหน้าจอได้
          </p>
        )}
      </div>
    );
  }

  // Full / Banner Mode (for Dashboard / Support Table Header)
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-4 transition-all ${
        isSubscribed
          ? "border-emerald-200 bg-gradient-to-r from-emerald-50/90 to-teal-50/50"
          : "border-[#f3a4c0]/60 bg-gradient-to-r from-[#fff7fa] to-[#fff0f5]"
      } ${className}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl shadow-sm ${
              isSubscribed
                ? "bg-emerald-500 text-white"
                : "bg-[var(--theme-color)] text-white"
            }`}
          >
            {isSubscribed ? <BellRing className="size-5" /> : <Smartphone className="size-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-gray-900">
                การแจ้งเตือนเคสปัญหาบนมือถือ (Web Push)
              </h3>
              {isSubscribed ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                  <Check className="size-3" /> เปิดใช้งานแล้ว
                </span>
              ) : (
                <span className="rounded-full bg-gray-200/80 px-2 py-0.5 text-xs font-medium text-gray-700">
                  ยังไม่ได้เปิด
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-600">
              {isSubscribed
                ? "เครื่องนี้จะได้รับแจ้งเตือนทันทีที่มีลูกค้าเปิดเคสแจ้งปัญหาเข้ามา แม้จะปิดเบราว์เซอร์อยู่"
                : "เปิดรับการแจ้งเตือนเพื่อให้ข้อความเด้งเตือนบนหน้าจอมือถือทันทีเมื่อมีเคสปัญหาใหม่"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {isSubscribed ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestNotification}
                disabled={isTesting}
                className="border-[#f3a4c0] bg-white text-xs font-semibold text-[#7f485c] hover:bg-[#ffeef4]"
              >
                {isTesting ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Bell className="mr-1.5 size-3.5" />
                )}
                ทดสอบส่งแจ้งเตือน
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleUnsubscribe}
                disabled={isActionLoading}
                className="text-xs text-gray-500 hover:bg-gray-200/50 hover:text-gray-700"
              >
                {isActionLoading ? (
                  <Loader2 className="mr-1 size-3.5 animate-spin" />
                ) : (
                  <BellOff className="mr-1 size-3.5" />
                )}
                ปิดแจ้งเตือน
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={handleSubscribe}
              disabled={isActionLoading}
              className="bg-[var(--theme-color)] text-xs font-semibold text-white shadow-sm hover:brightness-105"
            >
              {isActionLoading ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <BellRing className="mr-1.5 size-3.5" />
              )}
              เปิดรับการแจ้งเตือนบนมือถือ
            </Button>
          )}
        </div>
      </div>

      {showIosTip && !isSubscribed && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50/90 p-2.5 text-xs text-amber-900 border border-amber-200/60">
          <Info className="size-4 shrink-0 text-amber-600 mt-0.5" />
          <div className="leading-relaxed">
            <strong>คำแนะนำสำหรับผู้ใช้ iPhone/iPad:</strong> บนระบบ iOS ของ Apple จำเป็นต้องเพิ่มเว็บเป็นแอปก่อน โดยกดปุ่ม{" "}
            <strong>แชร์ (Share)</strong> ที่แถบล่างของ Safari แล้วเลือก{" "}
            <strong>&quot;เพิ่มไปยังหน้าจอโฮม&quot; (Add to Home Screen)</strong> จากนั้นเปิดแอปจากหน้าจอโฮมเพื่อกดเปิดแจ้งเตือนค่ะ
          </div>
        </div>
      )}
    </div>
  );
}
