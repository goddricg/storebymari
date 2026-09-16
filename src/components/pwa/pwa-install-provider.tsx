"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { Share, PlusSquare, Smartphone, Download, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { triggerHaptic } from "@/lib/ui/haptics";
import {
  SITE_BRAND_LOGO_ALT,
  SITE_BRAND_LOGO_HEIGHT,
  SITE_BRAND_LOGO_PATH,
  SITE_BRAND_LOGO_WIDTH,
} from "@/lib/site-branding";

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface PwaInstallContextValue {
  isInstallable: boolean;
  isStandalone: boolean;
  isIOS: boolean;
  isInstallModalOpen: boolean;
  setIsInstallModalOpen: (open: boolean) => void;
  triggerInstall: () => Promise<void>;
}

const PwaInstallContext = createContext<PwaInstallContextValue>({
  isInstallable: false,
  isStandalone: false,
  isIOS: false,
  isInstallModalOpen: false,
  setIsInstallModalOpen: () => {},
  triggerInstall: async () => {},
});

export function usePwaInstall() {
  return useContext(PwaInstallContext);
}

const VISITOR_STORAGE_PREFIX = "appmymari_visitor_id:";

function getStoredVisitorId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const key = `${VISITOR_STORAGE_PREFIX}${window.location.host}`;
    return window.localStorage.getItem(key) || undefined;
  } catch {
    return undefined;
  }
}

function detectPlatformAndDevice(): {
  platform: "android" | "ios" | "windows" | "mac" | "other";
  deviceType: "mobile" | "tablet" | "desktop";
} {
  if (typeof window === "undefined") {
    return { platform: "other", deviceType: "mobile" };
  }
  const ua = window.navigator.userAgent.toLowerCase();
  let platform: "android" | "ios" | "windows" | "mac" | "other" = "other";
  let deviceType: "mobile" | "tablet" | "desktop" = "desktop";

  const isIOS = /iphone|ipad|ipod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
  const isAndroid = /android/.test(ua);
  const isWindows = /windows nt/.test(ua);
  const isMac = /macintosh|mac os x/.test(ua) && !navigator.maxTouchPoints;

  if (isIOS) platform = "ios";
  else if (isAndroid) platform = "android";
  else if (isWindows) platform = "windows";
  else if (isMac) platform = "mac";

  const isTablet = /ipad|tablet/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isMobile = /iphone|ipod|mobile/.test(ua) || (isAndroid && !/tablet/.test(ua));

  if (isTablet) deviceType = "tablet";
  else if (isMobile) deviceType = "mobile";
  else if (window.innerWidth < 768) deviceType = "mobile";
  else if (window.innerWidth <= 1024) deviceType = "tablet";

  return { platform, deviceType };
}

function sendPwaInstallTracking(source: string) {
  if (typeof window === "undefined") return;
  try {
    const { platform, deviceType } = detectPlatformAndDevice();
    const visitorId = getStoredVisitorId();

    void fetch("/api/analytics/pwa-install", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitorId,
        platform,
        deviceType,
        source,
      }),
    }).catch(() => undefined);
  } catch {
    // Ignore tracking errors in client
  }
}

export function PwaInstallProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isMobileOrTablet, setIsMobileOrTablet] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Detect standalone display mode
    const checkStandalone = () => {
      const isStandaloneMedia = window.matchMedia("(display-mode: standalone)").matches;
      const isNavigatorStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
      const isAndroidReferrer = document.referrer.includes("android-app://");
      return Boolean(isStandaloneMedia || isNavigatorStandalone || isAndroidReferrer);
    };

    const standaloneActive = checkStandalone();
    setIsStandalone(standaloneActive);

    // Track standalone launch (especially important for iOS Add to Home Screen)
    if (standaloneActive) {
      try {
        const alreadyTracked = window.localStorage.getItem("pwa_standalone_tracked");
        if (!alreadyTracked) {
          window.localStorage.setItem("pwa_standalone_tracked", new Date().toISOString());
          sendPwaInstallTracking("standalone_launch");
        }
      } catch {
        // Ignore localStorage errors
      }
    }

    // Detect iOS
    const ua = window.navigator.userAgent.toLowerCase();
    const detectedIOS = /iphone|ipad|ipod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
    setIsIOS(detectedIOS);

    // Detect Mobile & Tablet View (responsive viewport < 1024px or mobile/tablet user agent / iPadOS)
    const checkMobileOrTablet = () => {
      if (typeof window === "undefined") return false;
      const userAgent = window.navigator.userAgent.toLowerCase();
      const isMobileDevice = /android|iphone|ipad|ipod|mobile|tablet/i.test(userAgent);
      const isModernIpad = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
      const isTouchTablet = (window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0) && window.innerWidth <= 1366;
      const isNarrowScreen = window.innerWidth < 1024;
      return Boolean(isMobileDevice || isModernIpad || isTouchTablet || isNarrowScreen);
    };

    setIsMobileOrTablet(checkMobileOrTablet());

    const handleResize = () => {
      setIsMobileOrTablet(checkMobileOrTablet());
    };

    window.addEventListener("resize", handleResize);

    // Listen for beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    // Listen for appinstalled
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      setIsInstallModalOpen(false);
      triggerHaptic("success");
      sendPwaInstallTracking("appinstalled_event");
      try {
        window.localStorage.setItem("pwa_installed_tracked", new Date().toISOString());
      } catch {}
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    triggerHaptic("medium");

    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          sendPwaInstallTracking("prompt_accepted");
          try {
            window.localStorage.setItem("pwa_installed_tracked", new Date().toISOString());
          } catch {}
          setDeferredPrompt(null);
        }
      } catch {
        setTimeout(() => setIsInstallModalOpen(true), 120);
      }
    } else {
      // For iOS or browsers without direct prompt event, show instruction modal
      setTimeout(() => setIsInstallModalOpen(true), 120);
    }
  }, [deferredPrompt]);

  // Installable only on Mobile & Tablet view and when not already running in standalone mode
  const isInstallable = !isStandalone && isMobileOrTablet;

  return (
    <PwaInstallContext.Provider
      value={{
        isInstallable,
        isStandalone,
        isIOS,
        isInstallModalOpen,
        setIsInstallModalOpen,
        triggerInstall,
      }}
    >
      {children}

      {/* PWA Installation Guidance Modal */}
      <Dialog open={isInstallModalOpen} onOpenChange={setIsInstallModalOpen}>
        <DialogContent className="max-w-md rounded-2xl border border-white/10 bg-[#161219] p-6 text-white shadow-2xl backdrop-blur-xl">
          <DialogHeader className="flex flex-col items-center text-center">
            <div className="relative mb-3 flex h-16 w-24 items-center justify-center rounded-2xl bg-[#ff7a00]/10 p-1 ring-1 ring-[#ff7a00]/30">
              <Image
                src={SITE_BRAND_LOGO_PATH}
                alt={SITE_BRAND_LOGO_ALT}
                width={SITE_BRAND_LOGO_WIDTH}
                height={SITE_BRAND_LOGO_HEIGHT}
                sizes="88px"
                className="h-full w-full object-contain"
              />
            </div>
            <DialogTitle className="text-xl font-bold text-white">
              ติดตั้งแอปพลิเคชัน Appbymari
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-gray-400">
              ใช้งานเต็มหน้าจอ รวดเร็ว เสมือนแอปแท้บนหน้าจอโฮมของคุณ
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 space-y-3 text-sm">
            {isIOS ? (
              <>
                <div className="flex items-start gap-3 rounded-xl bg-white/5 p-3">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#ff7a00]/20 text-[#ff8a2a] font-bold text-xs">
                    1
                  </div>
                  <p className="text-gray-300">
                    แตะที่ไอคอน <span className="inline-flex items-center gap-1 font-semibold text-white"><Share className="size-4 text-[#ff8a2a]" /> แชร์ (Share)</span> ที่แถบเมนูด้านล่างของ Safari
                  </p>
                </div>
                <div className="flex items-start gap-3 rounded-xl bg-white/5 p-3">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#ff7a00]/20 text-[#ff8a2a] font-bold text-xs">
                    2
                  </div>
                  <p className="text-gray-300">
                    เลื่อนลงและเลือก <span className="inline-flex items-center gap-1 font-semibold text-white"><PlusSquare className="size-4 text-[#ff8a2a]" /> "เพิ่มไปยังหน้าจอโฮม"</span> (Add to Home Screen)
                  </p>
                </div>
                <div className="flex items-start gap-3 rounded-xl bg-white/5 p-3">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#ff7a00]/20 text-[#ff8a2a] font-bold text-xs">
                    3
                  </div>
                  <p className="text-gray-300">
                    กดปุ่ม <span className="font-semibold text-white">"เพิ่ม" (Add)</span> ที่มุมบนขวา เพื่อเสร็จสิ้นการติดตั้ง
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-3 rounded-xl bg-white/5 p-3">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#ff7a00]/20 text-[#ff8a2a] font-bold text-xs">
                    1
                  </div>
                  <p className="text-gray-300">
                    แตะที่ไอคอนจุดสามจุด <span className="font-semibold text-white">(⋮)</span> หรือไอคอนติดตั้ง <span className="inline-flex items-center gap-1 font-semibold text-white"><Download className="size-4 text-[#ff8a2a]" /></span> บนแถบ URL
                  </p>
                </div>
                <div className="flex items-start gap-3 rounded-xl bg-white/5 p-3">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#ff7a00]/20 text-[#ff8a2a] font-bold text-xs">
                    2
                  </div>
                  <p className="text-gray-300">
                    เลือก <span className="font-semibold text-white">"ติดตั้งแอปพลิเคชัน"</span> หรือ <span className="font-semibold text-white">"เพิ่มลงในหน้าจอหลัก"</span>
                  </p>
                </div>
              </>
            )}
          </div>

          <Button
            type="button"
            onClick={() => setIsInstallModalOpen(false)}
            className="w-full rounded-xl bg-[var(--theme-color)] text-white hover:bg-[var(--theme-color)]/90"
          >
            รับทราบและปิด
          </Button>
        </DialogContent>
      </Dialog>
    </PwaInstallContext.Provider>
  );
}
