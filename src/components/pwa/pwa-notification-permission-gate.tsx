"use client";

import React, { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import {
  Bell,
  BellRing,
  AlertTriangle,
  RefreshCw,
  Loader2,
  ShieldCheck,
  Zap,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { triggerHaptic } from "@/lib/ui/haptics";
import { subscribeToPush, isIos, isStandalonePwa } from "@/lib/push/client";
import { SITE_BRAND_LOGO_PATH } from "@/lib/site-branding";

export function PwaNotificationPermissionGate() {
  const [isMounted, setIsMounted] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [iosDevice, setIosDevice] = useState(false);
  const [isSkipped, setIsSkipped] = useState(false);
  const hasSubscribedRef = React.useRef(false);

  // Synchronize standalone & permission states on client mount
  useEffect(() => {
    setIsMounted(true);

    if (typeof window === "undefined") return;

    const standalone = isStandalonePwa();
    setIsStandalone(standalone);
    setIosDevice(isIos());

    if ("Notification" in window) {
      setPermission(Notification.permission);
    }

    const mql = window.matchMedia("(display-mode: standalone)");
    const handleMqlChange = (e: MediaQueryListEvent) => {
      setIsStandalone(Boolean(e.matches || isStandalonePwa()));
    };

    if (mql.addEventListener) {
      mql.addEventListener("change", handleMqlChange);
    } else {
      mql.addListener(handleMqlChange);
    }

    return () => {
      if (mql.removeEventListener) {
        mql.removeEventListener("change", handleMqlChange);
      } else {
        mql.removeListener(handleMqlChange);
      }
    };
  }, []);

  // Check and update permission state, auto-subscribing quietly if granted (no banner/toast)
  const checkPermissionState = useCallback(async () => {
    if (typeof window === "undefined") return;

    setIsStandalone(isStandalonePwa());

    if (!("Notification" in window)) return;

    const current = Notification.permission;
    setPermission(current);

    if (current === "granted" && !hasSubscribedRef.current) {
      hasSubscribedRef.current = true;
      setIsSubscribing(true);
      try {
        await subscribeToPush();
      } catch (err) {
        console.error("[PwaGate] Auto-subscribe error:", err);
        hasSubscribedRef.current = false;
      } finally {
        setIsSubscribing(false);
      }
    }
  }, []);

  // Listen for visibilitychange and focus to auto-detect permission changes from OS Settings
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkPermissionState();
      }
    };

    const handleFocus = () => {
      checkPermissionState();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [checkPermissionState]);

  // Lock body scroll and prevent background navigation while gate is active
  useEffect(() => {
    const isGateActive = isStandalone && permission !== "granted" && !isSkipped;
    if (isGateActive) {
      document.body.style.overflow = "hidden";
      document.body.setAttribute("data-pwa-gate-locked", "true");
    } else {
      document.body.style.overflow = "";
      document.body.removeAttribute("data-pwa-gate-locked");
    }

    return () => {
      document.body.style.overflow = "";
      document.body.removeAttribute("data-pwa-gate-locked");
    };
  }, [isStandalone, permission, isSkipped]);

  // Handle direct user gesture to request permission
  const handleRequestPermission = async () => {
    triggerHaptic("medium");

    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.error("อุปกรณ์นี้ไม่รองรับ Notification API");
      return;
    }

    try {
      setIsSubscribing(true);
      const resPermission = await Notification.requestPermission();
      setPermission(resPermission);

      if (resPermission === "granted") {
        hasSubscribedRef.current = true;
        await subscribeToPush();
        triggerHaptic("success");
      } else if (resPermission === "denied") {
        triggerHaptic("warning");
        toast.error("การแจ้งเตือนถูกปฏิเสธ กรุณาเปิดในการตั้งค่า");
      }
    } catch (error) {
      console.error("[PwaGate] Permission request error:", error);
      triggerHaptic("error");
      toast.error("เกิดข้อผิดพลาดในการขอสิทธิ์แจ้งเตือน");
    } finally {
      setIsSubscribing(false);
    }
  };

  // Handle manual re-check when in 'denied' state
  const handleRecheckPermission = async () => {
    triggerHaptic("light");
    if (typeof window === "undefined" || !("Notification" in window)) return;

    const current = Notification.permission;
    setPermission(current);

    if (current === "granted") {
      hasSubscribedRef.current = true;
      setIsSubscribing(true);
      await subscribeToPush();
      setIsSubscribing(false);
      triggerHaptic("success");
    } else {
      triggerHaptic("warning");
      toast.warning("ยังไม่พบการเปิดแจ้งเตือน กรุณาเปิดในเมนูตั้งค่าแล้วกดตรวจเช็คอีกครั้ง");
    }
  };

  // Do not block if not yet mounted on client, not in standalone PWA, already granted, or user skipped
  if (!isMounted || !isStandalone || permission === "granted" || isSkipped) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-gate-title"
      aria-describedby="pwa-gate-desc"
      className="fixed inset-0 z-[999999] flex flex-col items-center justify-center overflow-y-auto bg-[#0d0914] px-5 py-8 text-white select-none backdrop-blur-3xl"
      style={{
        paddingTop: "max(2rem, env(safe-area-inset-top, 2rem))",
        paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
      }}
    >
      {/* Background Ambience Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 size-96 rounded-full bg-[var(--theme-color)]/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 left-1/2 -translate-x-1/2 size-96 rounded-full bg-[#ff7a00]/15 blur-3xl"
      />

      <div className="relative z-10 w-full max-w-md space-y-6 text-center">
        {/* App Logo & Header Badge */}
        <div className="flex flex-col items-center">
          <div className="relative mb-3 flex h-16 w-24 items-center justify-center rounded-2xl bg-gradient-to-b from-[#2a1b33] to-[#170f1d] p-1 shadow-2xl ring-1 ring-white/15">
            <Image
              src={SITE_BRAND_LOGO_PATH}
              alt="Mari Studio logo"
              width={1536}
              height={1024}
              sizes="88px"
              className="h-full w-full object-contain"
              priority
            />
            <div className="absolute -bottom-1.5 -right-1.5 flex size-8 items-center justify-center rounded-full bg-[var(--theme-color)] text-white shadow-lg ring-2 ring-[#0d0914]">
              {permission === "denied" ? (
                <AlertTriangle className="size-4 text-amber-300" />
              ) : (
                <BellRing className="size-4 animate-pulse" />
              )}
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--theme-color)]/30 bg-[var(--theme-color)]/10 px-3 py-1 text-xs font-semibold text-[#ffa256]">
            <CheckCircle2 className="size-3.5" /> PWA Official App
          </span>
        </div>

        {/* State 1: Default (Prompting Permission) */}
        {permission !== "denied" ? (
          <>
            <div className="space-y-2">
              <h1 id="pwa-gate-title" className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                เปิดการแจ้งเตือนเพื่อเข้าใช้งาน
              </h1>
              <p id="pwa-gate-desc" className="text-sm leading-relaxed text-gray-300">
                แอปพลิเคชัน Appbymari จำเป็นต้องใช้สิทธิ์การแจ้งเตือน เพื่อให้คุณไม่พลาดสถานะคำสั่งซื้อ อัปเดตเคสปัญหา และข้อมูลบัญชีพรีเมียมของคุณ
              </p>
            </div>

            {/* Benefit Cards */}
            <div className="space-y-2.5 text-left text-xs">
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--theme-color)]/20 text-[var(--theme-color)]">
                  <Zap className="size-4" />
                </div>
                <div>
                  <h2 className="font-semibold text-white">รับสินค้าและพ้อยทันที</h2>
                  <p className="text-gray-400">แจ้งเตือนทันทีเมื่อระบบเติมเงินหรือส่งมอบบัญชีสำเร็จ</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#ff7a00]/20 text-[#ff8a2a]">
                  <Bell className="size-4" />
                </div>
                <div>
                  <h2 className="font-semibold text-white">ติดตามเคสแจ้งปัญหา</h2>
                  <p className="text-gray-400">อัปเดตแจ้งเตือนทันทีเมื่อแอดมินรับเรื่องหรือแก้ไขปัญหาเสร็จ</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                  <ShieldCheck className="size-4" />
                </div>
                <div>
                  <h2 className="font-semibold text-white">ความปลอดภัยบัญชี 24 ชม.</h2>
                  <p className="text-gray-400">แจ้งเตือนก่อนบัญชีหมดอายุและสิทธิ์การรับประกัน</p>
                </div>
              </div>
            </div>

            {/* Primary Action Button */}
            <div className="pt-2">
              <Button
                type="button"
                onClick={handleRequestPermission}
                disabled={isSubscribing}
                className="h-13 w-full rounded-2xl bg-gradient-to-r from-[var(--theme-color)] to-[#ff7a00] text-base font-bold text-white shadow-xl shadow-[var(--theme-color)]/25 transition-all hover:opacity-95 active:scale-[0.99]"
              >
                {isSubscribing ? (
                  <>
                    <Loader2 className="mr-2 size-5 animate-spin" />
                    กำลังเปิดใช้งานระบบแจ้งเตือน...
                  </>
                ) : (
                  <>
                    <Bell className="mr-2 size-5" />
                    เปิดการแจ้งเตือนเพื่อเข้าใช้งาน
                  </>
                )}
              </Button>
              <p className="mt-2.5 text-[11px] text-gray-400">
                เมื่อกดปุ่ม กรุณากด <b>"อนุญาต" (Allow)</b> ในกล่องข้อความที่ปรากฏ
              </p>
              <button
                type="button"
                onClick={() => setIsSkipped(true)}
                className="mt-3 text-xs text-gray-400 hover:text-white transition-colors underline-offset-4 hover:underline py-1.5"
              >
                เข้าสู่แอปพลิเคชันก่อน (ไว้เปิดภายหลัง) &rarr;
              </button>
            </div>
          </>
        ) : (
          /* State 2: Denied (Settings Instructions Guide) */
          <>
            <div className="space-y-2">
              <h1 id="pwa-gate-title" className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                การแจ้งเตือนถูกปิดกั้นอยู่
              </h1>
              <p id="pwa-gate-desc" className="text-sm leading-relaxed text-amber-200/90">
                คุณได้ปฏิเสธสิทธิ์การแจ้งเตือนไว้ กรุณาเปิดการแจ้งเตือนในการตั้งค่าของอุปกรณ์ เพื่อปลดล็อกเข้าสู่แอปพลิเคชัน
              </p>
            </div>

            {/* Step by Step OS Instructions */}
            <div className="space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-left text-xs">
              <div className="font-semibold text-amber-300">
                {iosDevice ? "ขั้นตอนการเปิดบน iPhone / iPad:" : "ขั้นตอนการเปิดบน Android:"}
              </div>

              {iosDevice ? (
                <ol className="space-y-2.5 text-gray-300">
                  <li className="flex items-start gap-2.5">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-300">
                      1
                    </span>
                    <span>
                      เปิดแอป <b className="text-white">"การตั้งค่า" (Settings)</b> ของเครื่อง
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-300">
                      2
                    </span>
                    <span>
                      เลื่อนลงไปที่เมนู <b className="text-white">"การแจ้งเตือน" (Notifications)</b> หรือหาชื่อแอป <b className="text-white">"Appbymari"</b>
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-300">
                      3
                    </span>
                    <span>
                      เปิดสวิตช์ <b className="text-emerald-400">"อนุญาตการแจ้งเตือน" (Allow Notifications)</b>
                    </span>
                  </li>
                </ol>
              ) : (
                <ol className="space-y-2.5 text-gray-300">
                  <li className="flex items-start gap-2.5">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-300">
                      1
                    </span>
                    <span>
                      เปิด <b className="text-white">การตั้งค่าเครื่อง (Settings)</b> หรือแตะไอคอนแม่กุญแจ 🔒 ที่แถบด้านบน
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-300">
                      2
                    </span>
                    <span>
                      ไปที่ <b className="text-white">แอป (Apps)</b> &rarr; <b className="text-white">Appbymari</b> (หรือ Chrome) &rarr; <b className="text-white">การแจ้งเตือน</b>
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-300">
                      3
                    </span>
                    <span>
                      เลือก <b className="text-emerald-400">"อนุญาต" (Allow)</b>
                    </span>
                  </li>
                </ol>
              )}

              <p className="border-t border-amber-500/20 pt-2 text-[11px] text-amber-200/70">
                💡 เมื่อเปิดเรียบร้อยแล้ว สลับกลับมาที่แอปนี้ ระบบจะปลดล็อกให้อัตโนมัติทันที
              </p>
            </div>

              {/* Re-check Button */}
            <div className="pt-2">
              <Button
                type="button"
                onClick={handleRecheckPermission}
                disabled={isSubscribing}
                className="h-13 w-full rounded-2xl bg-amber-600 text-base font-bold text-white shadow-xl shadow-amber-600/30 transition-all hover:bg-amber-500 active:scale-[0.99]"
              >
                {isSubscribing ? (
                  <>
                    <Loader2 className="mr-2 size-5 animate-spin" />
                    กำลังตรวจสอบ...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 size-5" />
                    ตรวจเช็คสถานะอีกครั้ง
                  </>
                )}
              </Button>
              <button
                type="button"
                onClick={() => setIsSkipped(true)}
                className="mt-3 text-xs text-gray-400 hover:text-white transition-colors underline-offset-4 hover:underline py-1.5"
              >
                ข้ามไปก่อน เข้าสู่แอปพลิเคชัน &rarr;
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
