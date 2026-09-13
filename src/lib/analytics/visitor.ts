import { randomUUID } from "node:crypto";

export const VISITOR_COOKIE_NAME = "appmymari_visitor_id";
export const VISITOR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidVisitorId(value: string | null | undefined): value is string {
  return Boolean(value && UUID_PATTERN.test(value));
}

export function resolveVisitorId(bodyValue: string | undefined, cookieValue: string | undefined): string {
  if (isValidVisitorId(bodyValue)) return bodyValue;
  if (isValidVisitorId(cookieValue)) return cookieValue;
  return randomUUID();
}

export function normalizeAnalyticsPagePath(value: string): string | null {
  const raw = value.trim();
  if (!raw || raw.length > 512 || !raw.startsWith("/") || raw.startsWith("//")) return null;

  const path = raw.split(/[?#]/, 1)[0] || "/";
  if (path === "/admin" || path.startsWith("/admin/") || path === "/api" || path.startsWith("/api/")) {
    return null;
  }

  return path.slice(0, 255);
}
