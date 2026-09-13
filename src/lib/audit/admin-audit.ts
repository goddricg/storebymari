import { randomUUID } from "crypto";

import pool from "@/lib/mysql";
import { getSiteId } from "@/lib/site";
import type { PublicUser } from "@/lib/auth/user";

export type AdminAuditSeverity = "info" | "low" | "medium" | "high" | "critical";
export type AdminAuditResult = "success" | "failed" | "denied" | "partial";

export type AdminAuditActor = Pick<
  PublicUser,
  "id" | "email" | "displayName" | "role" | "isAdmin"
>;

export type AdminAuditEventInput = {
  actor?: AdminAuditActor | null;
  siteId?: string;
  action: string;
  category: string;
  severity?: AdminAuditSeverity;
  result?: AdminAuditResult;
  entityType?: string | null;
  entityId?: string | null;
  entityLabel?: string | null;
  reasonCode?: string | null;
  details?: string | null;
  before?: unknown;
  after?: unknown;
  changes?: unknown;
  requestId?: string | null;
  route?: string | null;
  method?: string | null;
  source?: string;
  userAgent?: string | null;
  occurredAt?: Date;
};

const SENSITIVE_FIELD_PATTERN = /(password|passwd|secret|token|api[_-]?key|webhook|authorization|cookie|otp|qr|private[_-]?key|refresh[_-]?token|access[_-]?token|account(?:data|email|credential))/i;
const SENSITIVE_EXACT_PATTERN = /^(password|passwd|secret|token|apiKey|api_key|webhook|authorization|cookie|otp|qr|privateKey|refreshToken|accessToken)$/i;
const MAX_OBJECT_DEPTH = 5;
const MAX_ARRAY_ITEMS = 50;
const MAX_STRING_LENGTH = 1000;

function normalizeText(value: unknown, maxLength: number): string | null {
  if (value == null) return null;
  const normalized = String(value).replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function isSensitiveField(fieldName: string | undefined): boolean {
  if (!fieldName) return false;
  return SENSITIVE_EXACT_PATTERN.test(fieldName) || SENSITIVE_FIELD_PATTERN.test(fieldName);
}

export function sanitizeAuditValue(value: unknown, fieldName?: string, depth = 0): unknown {
  if (isSensitiveField(fieldName)) return "[REDACTED]";
  if (value == null) return value;
  if (depth > MAX_OBJECT_DEPTH) return "[TRUNCATED]";

  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}…[TRUNCATED]`
      : value;
  }

  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeAuditValue(item, undefined, depth + 1));
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      result[key] = sanitizeAuditValue(nestedValue, key, depth + 1);
    }
    return result;
  }

  return String(value);
}

function serializeAuditValue(value: unknown): string | null {
  if (value == null) return null;
  try {
    return JSON.stringify(sanitizeAuditValue(value));
  } catch {
    return JSON.stringify({ value: "[UNSERIALIZABLE]" });
  }
}

function sanitizeDetails(value: string | null | undefined): string | null {
  const details = normalizeText(value, 2000);
  if (!details) return null;

  return details.replace(
    /((?:password|passwd|secret|token|api[_-]?key|webhook|authorization|cookie|otp|qr)\s*[:=]\s*)([^\s,;]+)/gi,
    "$1[REDACTED]",
  );
}

export function getAdminAuditRequestContext(request: Request) {
  const url = new URL(request.url);
  return {
    requestId: normalizeText(request.headers.get("x-request-id"), 128) ?? randomUUID(),
    route: url.pathname,
    method: normalizeText(request.method, 16),
    userAgent: normalizeText(request.headers.get("user-agent"), 512),
  };
}

/**
 * Write the durable audit record. The application never exposes a delete or
 * update path for this table; every correction is represented by a new event.
 */
export async function recordAdminAuditEvent(input: AdminAuditEventInput): Promise<string | null> {
  const eventId = randomUUID();
  const now = new Date();
  const actor = input.actor ?? null;
  const runtimeSiteId = getSiteId();
  // This audit center belongs to storebymari.com only. Shared routes may still
  // call this helper on child sites, but those calls must remain no-ops.
  if (runtimeSiteId !== "main") return null;

  const siteId = normalizeText(input.siteId ?? runtimeSiteId, 50) ?? "main";
  if (siteId !== "main") return null;
  const action = normalizeText(input.action, 80) ?? "UNKNOWN";
  const category = normalizeText(input.category, 40) ?? "system";

  try {
    await pool.execute(
      `INSERT INTO admin_audit_events (
        id,
        site_id,
        actor_id,
        actor_email,
        actor_name,
        actor_role,
        event_action,
        event_category,
        severity,
        result,
        entity_type,
        entity_id,
        entity_label,
        reason_code,
        details,
        before_json,
        after_json,
        changes_json,
        request_id,
        route,
        method,
        source,
        user_agent,
        occurred_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventId,
        siteId,
        actor?.id ?? null,
        normalizeText(actor?.email, 255),
        normalizeText(actor?.displayName, 255),
        normalizeText(actor?.role ?? (actor?.isAdmin ? "admin" : null), 32),
        action,
        category,
        input.severity ?? "info",
        input.result ?? "success",
        normalizeText(input.entityType, 80),
        normalizeText(input.entityId, 255),
        normalizeText(input.entityLabel, 255),
        normalizeText(input.reasonCode, 120),
        sanitizeDetails(input.details),
        serializeAuditValue(input.before),
        serializeAuditValue(input.after),
        serializeAuditValue(input.changes),
        normalizeText(input.requestId, 128),
        normalizeText(input.route, 255),
        normalizeText(input.method, 16),
        normalizeText(input.source ?? "admin", 32) ?? "admin",
        normalizeText(input.userAgent, 512),
        input.occurredAt ?? now,
        now,
      ],
    );

    return eventId;
  } catch (error) {
    // Audit failures must be visible to operators without leaking request data.
    console.error(
      "[Admin Audit] Failed to persist event:",
      error instanceof Error ? error.message : "unknown error",
    );
    return null;
  }
}
