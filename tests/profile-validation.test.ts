import assert from "node:assert/strict";
import { test } from "node:test";

import {
  countDisplayNameCharacters,
  getDisplayNameError,
  normalizeDisplayName,
} from "@/lib/profile/validation";

test("display names support Thai, emoji, and special characters from 4 to 60 code points", () => {
  assert.equal(getDisplayNameError("มารี 💗!"), null);
  assert.equal(countDisplayNameCharacters("มารี 💗!"), 7);
  assert.equal(normalizeDisplayName("  App By Mari  "), "App By Mari");
});

test("display name validation rejects short, long, and control-character values", () => {
  assert.match(getDisplayNameError("abc") ?? "", /อย่างน้อย/);
  assert.match(getDisplayNameError("a".repeat(61)) ?? "", /ไม่เกิน/);
  assert.match(getDisplayNameError("Mari\nShop") ?? "", /อักขระควบคุม/);
});
