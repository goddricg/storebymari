"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const VISITOR_STORAGE_PREFIX = "appmymari_visitor_id:";
const HEARTBEAT_INTERVAL_MS = 25_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function generateClientUuid(): string {
  if (typeof window.crypto?.randomUUID === "function") return window.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isTrackablePath(pathname: string): boolean {
  return !(
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/api" ||
    pathname.startsWith("/api/")
  );
}

function getClientVisitorId(): string {
  const storageKey = `${VISITOR_STORAGE_PREFIX}${window.location.host}`;
  try {
    const existing = window.localStorage.getItem(storageKey);
    if (existing && UUID_PATTERN.test(existing)) return existing;

    const generated = generateClientUuid();
    window.localStorage.setItem(storageKey, generated);
    return generated;
  } catch {
    return generateClientUuid();
  }
}

function sendTrackingRequest(path: string, payload: Record<string, string>) {
  void fetch(path, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

export default function SiteAnalyticsTracker() {
  const pathname = usePathname();
  const visitorIdRef = useRef<string | null>(null);
  const lastTrackedPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || !isTrackablePath(pathname)) return;

    const visitorId = visitorIdRef.current ?? getClientVisitorId();
    visitorIdRef.current = visitorId;

    const sendHeartbeat = () => {
      sendTrackingRequest("/api/analytics/presence", { visitorId, pagePath: pathname });
    };

    sendHeartbeat();
    const intervalId = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") sendHeartbeat();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pathname]);

  useEffect(() => {
    if (!pathname || !isTrackablePath(pathname) || lastTrackedPathRef.current === pathname) return;

    const visitorId = visitorIdRef.current ?? getClientVisitorId();
    visitorIdRef.current = visitorId;
    lastTrackedPathRef.current = pathname;

    sendTrackingRequest("/api/analytics/visits", {
      eventId: generateClientUuid(),
      visitorId,
      pagePath: pathname,
    });
  }, [pathname]);

  return null;
}
