"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { usePublicSettings } from "@/components/public-settings-provider";
import { usePwaInstall } from "@/components/pwa/pwa-install-provider";
import { triggerHaptic } from "@/lib/ui/haptics";

const STORAGE_KEY = "appbymari_popup_announcement_dismissed_date";
const DEFAULT_IMAGE_URL = "/images/popup-pwa-announcement.jpg";

interface PopupBannerItem {
  id: number;
  enabled: boolean;
  imageUrl: string;
  action: "none" | "install_app" | "open_link";
  linkUrl?: string;
  startAt?: string;
  endAt?: string;
}

function isBannerWithinSchedule(banner: PopupBannerItem, now = Date.now()): boolean {
  const start = banner.startAt?.trim() ? Date.parse(banner.startAt) : null;
  const end = banner.endAt?.trim() ? Date.parse(banner.endAt) : null;

  // Empty values mean no boundary. Invalid non-empty values fail closed so an
  // accidentally malformed schedule never makes an announcement permanent.
  if (start !== null && Number.isNaN(start)) return false;
  if (end !== null && Number.isNaN(end)) return false;
  if (start !== null && now < start) return false;
  if (end !== null && now > end) return false;
  return true;
}

export function PopupAnnouncementModal() {
  const settings = usePublicSettings();
  const { triggerInstall, isStandalone } = usePwaInstall();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [scheduleNow, setScheduleNow] = useState(() => Date.now());
  const touchStartXRef = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setScheduleNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Helper to get local date string YYYY-MM-DD
  const getTodayString = useCallback(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, []);

  // Parse active banners from JSON or fallback to legacy single banner
  const activeBanners: PopupBannerItem[] = useMemo(() => {
    let items: PopupBannerItem[] = [];
    if (settings.popup_announcement_items) {
      try {
        const parsed = JSON.parse(settings.popup_announcement_items);
        if (Array.isArray(parsed) && parsed.length > 0) {
          items = parsed;
        }
      } catch (err) {
        console.error("Failed to parse popup_announcement_items:", err);
      }
    }

    // Fallback to legacy single banner if items is empty
    if (items.length === 0) {
      items = [
        {
          id: 1,
          enabled: settings.popup_announcement_enabled !== "false",
          imageUrl: settings.popup_announcement_image_url?.trim() || DEFAULT_IMAGE_URL,
          action: (settings.popup_announcement_action as any) || "install_app",
          linkUrl: settings.popup_announcement_link_url || "",
        },
      ];
    }

    return items.filter(
      (b) =>
        b.enabled &&
        b.imageUrl &&
        b.imageUrl.trim() !== "" &&
        isBannerWithinSchedule(b, scheduleNow),
    );
  }, [
    settings.popup_announcement_items,
    settings.popup_announcement_enabled,
    settings.popup_announcement_image_url,
    settings.popup_announcement_action,
    settings.popup_announcement_link_url,
    scheduleNow,
  ]);

  // Slide interval in milliseconds (default 2 seconds = 2000ms)
  const slideInterval = useMemo(() => {
    const parsed = Number(settings.popup_announcement_slide_interval);
    const seconds = !isNaN(parsed) && parsed >= 1 ? parsed : 2;
    return seconds * 1000;
  }, [settings.popup_announcement_slide_interval]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if popup announcement is enabled (enabled by default if not set to "false")
    const isEnabled = settings.popup_announcement_enabled !== "false";
    if (!isEnabled || activeBanners.length === 0) return;

    // Check if configured to hide when running inside standalone PWA app
    const hideInApp = settings.popup_announcement_hide_in_app !== "false";
    if (hideInApp && isStandalone) return;

    // Frequency check (default: once_a_day)
    const frequency = settings.popup_announcement_frequency || "once_a_day";
    if (frequency === "once_a_day") {
      const dismissedDate = localStorage.getItem(STORAGE_KEY);
      const today = getTodayString();
      if (dismissedDate === today) return;
    }

    // Open modal after a subtle delay for smooth entry
    const timer = setTimeout(() => {
      setIsOpen(true);
    }, 450);

    return () => clearTimeout(timer);
  }, [
    settings.popup_announcement_enabled,
    settings.popup_announcement_frequency,
    settings.popup_announcement_hide_in_app,
    isStandalone,
    getTodayString,
    activeBanners.length,
  ]);

  // Safe index adjustment when active banners change
  useEffect(() => {
    if (currentIndex >= activeBanners.length && activeBanners.length > 0) {
      setCurrentIndex(0);
    }
  }, [activeBanners.length, currentIndex]);

  // Autoplay slider when multiple banners exist
  useEffect(() => {
    if (!isOpen || activeBanners.length <= 1 || isPaused) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % activeBanners.length);
    }, slideInterval);

    return () => clearInterval(timer);
  }, [isOpen, activeBanners.length, isPaused, slideInterval]);

  const handleClose = () => {
    triggerHaptic("light");
    setIsOpen(false);
  };

  const handleDismissToday = () => {
    triggerHaptic("light");
    try {
      localStorage.setItem(STORAGE_KEY, getTodayString());
    } catch {
      // Ignore localStorage write failures
    }
    setIsOpen(false);
  };

  const handleBannerClick = () => {
    const currentBanner = activeBanners[currentIndex];
    if (!currentBanner) return;

    const action = currentBanner.action || "install_app";

    // If action is none (display graphic only), do nothing
    if (action === "none") {
      return;
    }

    triggerHaptic("medium");

    // Automatically mark as dismissed for today on action click
    try {
      localStorage.setItem(STORAGE_KEY, getTodayString());
    } catch {
      // Ignore localStorage write failures
    }

    setIsOpen(false);

    if (action === "install_app") {
      // Trigger PWA installation prompt (Chrome/Android) or instruction modal (iOS)
      triggerInstall();
    } else if (action === "open_link" && currentBanner.linkUrl) {
      if (currentBanner.linkUrl.startsWith("http://") || currentBanner.linkUrl.startsWith("https://")) {
        window.open(currentBanner.linkUrl, "_blank", "noopener,noreferrer");
      } else {
        router.push(currentBanner.linkUrl);
      }
    }
  };

  // Touch swipe gestures
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsPaused(true);
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setIsPaused(false);
    if (touchStartXRef.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diffX = touchStartXRef.current - touchEndX;

    if (diffX > 45) {
      // Swiped left -> next slide
      triggerHaptic("light");
      setCurrentIndex((prev) => (prev + 1) % activeBanners.length);
    } else if (diffX < -45) {
      // Swiped right -> prev slide
      triggerHaptic("light");
      setCurrentIndex((prev) => (prev - 1 + activeBanners.length) % activeBanners.length);
    }
    touchStartXRef.current = null;
  };

  if (!isOpen || activeBanners.length === 0) return null;

  const currentBanner = activeBanners[currentIndex] || activeBanners[0];
  const isClickable = currentBanner && currentBanner.action !== "none";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ป้ายประกาศพิเศษ"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
    >
      {/* Centered Modal Container */}
      <div
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative w-[84vw] max-w-[420px] aspect-square flex flex-col items-center justify-center rounded-3xl overflow-hidden shadow-2xl border border-pink-500/30 bg-[#170f1d] group animate-in zoom-in-95 duration-200 select-none"
      >
        {/* Floating Top-Right Close Button */}
        <button
          type="button"
          onClick={handleClose}
          aria-label="ปิดป้ายประกาศ"
          className="absolute top-3 right-3 z-30 size-9 rounded-full bg-black/60 hover:bg-black/85 text-white flex items-center justify-center border border-white/30 shadow-lg backdrop-blur-md transition-transform active:scale-90 focus:outline-none"
        >
          <X className="size-5 stroke-[2.5]" />
        </button>

        {/* Carousel / Banner Display */}
        <div
          onClick={handleBannerClick}
          className={`relative w-full h-full block ${
            isClickable ? "cursor-pointer" : "cursor-default"
          } focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500`}
        >
          {activeBanners.map((banner, index) => {
            const isActive = index === currentIndex;
            return (
              <div
                key={banner.id || index}
                className={`absolute inset-0 transition-opacity duration-500 ease-in-out ${
                  isActive ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
                }`}
              >
                <Image
                  src={banner.imageUrl}
                  alt={`Store By Mari ประกาศที่ ${index + 1}`}
                  fill
                  priority={index === 0}
                  sizes="(max-width: 768px) 85vw, 420px"
                  className={`object-cover transition-transform duration-300 ${
                    isClickable ? "group-hover:scale-[1.02] group-active:scale-[0.99]" : ""
                  }`}
                />
              </div>
            );
          })}
        </div>

        {/* Pagination Dots (Shown only if more than 1 banner is active) */}
        {activeBanners.length > 1 && (
          <div className="absolute bottom-3 left-0 right-0 z-30 flex items-center justify-center gap-1.5 pointer-events-auto">
            {activeBanners.map((banner, index) => (
              <button
                key={banner.id || index}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  triggerHaptic("light");
                  setCurrentIndex(index);
                }}
                aria-label={`ไปยังป้ายที่ ${index + 1}`}
                className={`transition-all duration-300 rounded-full ${
                  currentIndex === index
                    ? "w-6 h-2 bg-pink-500 shadow-md shadow-pink-500/80"
                    : "w-2 h-2 bg-white/50 hover:bg-white/80"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Don't Show Again Today Action Button */}
      <button
        type="button"
        onClick={handleDismissToday}
        className="mt-3 flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-full bg-black/60 hover:bg-black/85 text-white/90 hover:text-white text-xs font-medium border border-white/15 backdrop-blur-md transition-all active:scale-95 shadow-md focus:outline-none"
      >
        <X className="size-3.5" />
        <span>ไม่ต้องแสดงอีกในวันนี้</span>
      </button>
    </div>
  );
}
