"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { SITE_BRAND_LOGO_PATH } from "@/lib/site-branding";

export function PwaAppLoadingScreen() {
  const [shouldRender, setShouldRender] = useState(true);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Detect if client is Mobile or Tablet (responsive viewport < 1024px or mobile/tablet user agent / iPadOS)
    const checkMobileOrTablet = () => {
      const ua = window.navigator.userAgent.toLowerCase();
      const isMobile = /android|iphone|ipad|ipod|mobile|tablet/i.test(ua);
      const isModernIpad =
        navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
      const isTouchNarrow =
        (window.matchMedia("(pointer: coarse)").matches ||
          navigator.maxTouchPoints > 0) &&
        window.innerWidth <= 1366;
      const isNarrow = window.innerWidth < 1024;
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;

      return Boolean(isMobile || isModernIpad || isTouchNarrow || isNarrow || isStandalone);
    };

    if (!checkMobileOrTablet()) {
      // Do not display on desktop PC
      setShouldRender(false);
      return;
    }

    // Keep visible for a smooth polished launch presentation (approx 1.1s)
    const fadeTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, 1100);

    const removeTimer = setTimeout(() => {
      setShouldRender(false);
    }, 1650);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (!shouldRender) return null;

  return (
    <div
      id="pwa-app-loading-screen"
      className={cn(
        "fixed inset-0 z-[999998] flex flex-col items-center justify-center bg-[#120b17] transition-opacity duration-500 ease-out select-none",
        isFadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      )}
      style={{ touchAction: "none" }}
      aria-hidden={isFadingOut}
    >
      {/* Ambient background glow matching dark magical theme */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(235,90,140,0.18)_0%,_transparent_70%)]" />

      <div className="relative z-10 flex flex-col items-center justify-center">
        {/* Logo centered: exactly 40% of viewport width */}
        <div className="relative w-[56vw] max-w-[360px] min-w-[210px] aspect-[3/2]">
          <div className="relative h-full w-full overflow-hidden rounded-2xl shadow-[0_16px_50px_rgba(0,0,0,0.75),0_0_40px_rgba(255,138,42,0.25)] ring-1 ring-white/20 animate-pulse">
            <Image
              src={SITE_BRAND_LOGO_PATH}
              alt="Mari Studio logo"
              fill
              sizes="(max-width: 640px) 56vw, 360px"
              priority
              className="object-contain"
            />
          </div>
        </div>

        {/* Text below: " LOADING " using Font Mali and theme gradient */}
        <div className="mt-7 flex flex-col items-center gap-2.5">
          <span
            className="font-mali text-lg sm:text-xl font-bold tracking-[0.35em] text-transparent bg-clip-text bg-gradient-to-r from-[#ff9436] via-[#ff6ea7] to-[#d45af2] drop-shadow-[0_2px_14px_rgba(255,148,54,0.4)]"
            style={{ fontFamily: "var(--font-mali), cursive" }}
          >
            LOADING
          </span>

          {/* Theme matching glowing progress bar */}
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/10 shadow-inner">
            <div className="h-full w-full bg-gradient-to-r from-[#ff7a00] via-[#ff4d8d] to-[#b845f5] rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
