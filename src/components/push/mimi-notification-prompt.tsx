"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { BellRing, Sparkles, X, Loader2, CheckCircle2, Gift } from "lucide-react";
import { toast } from "sonner";
import { isPushSupported, subscribeToPush } from "@/lib/push/client";
import { triggerHaptic } from "@/lib/ui/haptics";
import { playNotificationSound } from "@/lib/audio/notification-sounds";
import { SITE_BRAND_PWA_ICON_192_PATH } from "@/lib/site-branding";

const DISMISSED_STORAGE_KEY = "mimi_push_prompt_dismissed_until";
const DISMISS_DURATION_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export function MimiNotificationPrompt() {
  const [isVisible, setIsVisible] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isPushSupported()) return;

    // Check current permission
    if (typeof Notification === "undefined" || Notification.permission !== "default") {
      return;
    }

    // Check dismissal cooldown
    try {
      const dismissedUntil = localStorage.getItem(DISMISSED_STORAGE_KEY);
      if (dismissedUntil && Number(dismissedUntil) > Date.now()) {
        return;
      }
    } catch {
      // ignore storage access issue
    }

    // Delay showing prompt slightly (2.5s) after initial page load for better UX
    const timer = setTimeout(() => {
      if (Notification.permission === "default") {
        setIsVisible(true);
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    triggerHaptic("light");
    setIsVisible(false);
    try {
      localStorage.setItem(DISMISSED_STORAGE_KEY, String(Date.now() + DISMISS_DURATION_MS));
    } catch {
      // ignore
    }
  };

  const handleSubscribe = async () => {
    triggerHaptic("medium");
    setIsSubscribing(true);

    try {
      const result = await subscribeToPush();
      if (result.success) {
        triggerHaptic("success");
        void playNotificationSound("case_resolved");
        toast.success("เย้! เปิดแจ้งเตือนสำเร็จแล้ว ขอบคุณนะค้าบ มิมิพร้อมดูแลเต็มที่เล้ยย 🥰🎉");
        setIsVisible(false);
        try {
          localStorage.removeItem(DISMISSED_STORAGE_KEY);
        } catch {
          // ignore
        }
      } else {
        triggerHaptic("warning");
        if (Notification.permission === "denied") {
          toast.warning("คุณได้กดปฏิเสธไว้ หากต้องการรับแจ้งเตือนสามารถเปิดได้ที่การตั้งค่าเบราว์เซอร์นะค้าบ");
          setIsVisible(false);
        } else {
          toast.error(result.error || "เกิดข้อผิดพลาดในการเปิดการแจ้งเตือน");
        }
      }
    } catch (err: any) {
      console.error("[MimiPrompt] Subscribe error:", err);
      toast.error("ไม่สามารถเปิดการแจ้งเตือนได้");
    } finally {
      setIsSubscribing(false);
    }
  };

  if (!isVisible) return null;

  return (
    <div
      role="region"
      aria-label="ข้อความแนะนำจากน้องมิมิ AI"
      className="fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] max-w-sm sm:bottom-6 sm:right-6 animate-in fade-in slide-in-from-bottom-5 duration-300 select-none"
    >
      <div className="relative overflow-hidden rounded-3xl border border-[#f3a4c0]/80 bg-gradient-to-b from-[#fff7fa] to-[#fff0f5] p-5 shadow-[0_16px_36px_rgba(127,72,92,0.22)] backdrop-blur-xl">
        {/* Glow ambient decoration */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-[var(--theme-color)]/15 blur-2xl"
        />

        {/* Close Button */}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="ปิดกล่องแนะนำ"
          className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full text-gray-400 hover:bg-[#ffeaf1] hover:text-[#7f485c] transition-colors"
        >
          <X className="size-4" />
        </button>

        {/* Mimi Header & Avatar */}
        <div className="flex items-start gap-3.5">
          <div className="relative flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#ff7a00] to-[var(--theme-color)] p-0.5 shadow-md shadow-[var(--theme-color)]/20">
            <div className="relative size-full rounded-[14px] overflow-hidden bg-[#170f1d] flex items-center justify-center">
              <Image
                src={SITE_BRAND_PWA_ICON_192_PATH}
                alt="Mimi AI"
                width={44}
                height={44}
                className="object-contain"
              />
            </div>
            <div className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-white">
              <Sparkles className="size-3" />
            </div>
          </div>

          <div className="min-w-0 pr-4">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-[#7f485c]">
                น้องมิมิ AI
              </span>
              <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--theme-color)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--theme-color)]">
                <Gift className="size-2.5" /> ดีลพิเศษ
              </span>
            </div>
            <p className="mt-1 text-xs font-semibold text-gray-800 leading-snug">
              งู้ยยย~ เปิดแจ้งเตือนกับมิมิไว้รึยังค้าบ? 💖
            </p>
          </div>
        </div>

        {/* Body Description */}
        <p className="mt-2.5 text-xs text-gray-600 leading-relaxed">
          มิมิจะคอยส่งโค้ดลับลดราคา แจ้งเตือนสถานะไอดีเกม และอัปเดตสินค้าเข้าใหม่ให้ทันใจ ไม่กดเปิดระวังพลาดของดีน้าา ✨
        </p>

        {/* Action Buttons */}
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={handleSubscribe}
            disabled={isSubscribing}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[var(--theme-color)] to-[#ff7a00] px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-[var(--theme-color)]/25 hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {isSubscribing ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                กำลังเปิด...
              </>
            ) : (
              <>
                <BellRing className="size-3.5" />
                เปิดแจ้งเตือนเลย 🔔
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            disabled={isSubscribing}
            className="rounded-xl border border-[#f3a4c0] bg-white px-3 py-2.5 text-xs font-medium text-[#7f485c] hover:bg-[#ffeaf1] transition-colors"
          >
            ไว้ก่อนนะ
          </button>
        </div>
      </div>
    </div>
  );
}
