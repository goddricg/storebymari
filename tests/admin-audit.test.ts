import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeAuditValue } from "@/lib/audit/admin-audit";

test("admin audit redacts secrets in camelCase and snake_case fields", () => {
  const sanitized = sanitizeAuditValue({
    email: "owner@example.com",
    accountPassword: "do-not-store",
    accountData: [{ email: "stock@example.com", password: "do-not-store" }],
    api_key: "api-secret",
    webhookUrl: "https://example.invalid/secret",
    points: 125,
  }) as Record<string, unknown>;

  assert.equal(sanitized.email, "owner@example.com");
  assert.equal(sanitized.accountPassword, "[REDACTED]");
  assert.equal(sanitized.accountData, "[REDACTED]");
  assert.equal(sanitized.api_key, "[REDACTED]");
  assert.equal(sanitized.webhookUrl, "[REDACTED]");
  assert.equal(sanitized.points, 125);
});

test("admin audit bounds large values", () => {
  const sanitized = sanitizeAuditValue({
    details: "x".repeat(2_000),
    rows: Array.from({ length: 80 }, (_, index) => index),
  }) as Record<string, unknown>;

  assert.equal((sanitized.details as string).endsWith("[TRUNCATED]"), true);
  assert.equal((sanitized.rows as unknown[]).length, 50);
});
