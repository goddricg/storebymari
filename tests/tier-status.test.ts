import assert from "node:assert/strict";
import test from "node:test";

import { getEffectiveUserTier, toOptionalIsoDate } from "@/lib/auth/tier";

test("an expired non-normal tier falls back to normal", () => {
  const now = Date.parse("2026-08-04T12:00:00.000Z");

  assert.equal(getEffectiveUserTier("vip", "2026-08-04T11:59:59.000Z", now), "normal");
  assert.equal(getEffectiveUserTier("walkin", "2026-08-04T12:00:01.000Z", now), "walkin");
});

test("a tier without an expiry remains active", () => {
  assert.equal(getEffectiveUserTier("vip", null, Date.now()), "vip");
  assert.equal(getEffectiveUserTier("unknown", null, Date.now()), "normal");
});

test("invalid expiry input is omitted before persistence", () => {
  assert.equal(toOptionalIsoDate("not-a-date"), null);
  assert.equal(toOptionalIsoDate("2026-08-04T12:00:00.000Z"), "2026-08-04T12:00:00.000Z");
});
