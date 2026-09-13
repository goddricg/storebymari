import assert from "node:assert/strict";
import test from "node:test";

import { getPriceByTier } from "../src/lib/utils/pricing";

test("storefront pricing defaults an unidentified visitor to Walk-in", () => {
  assert.equal(getPriceByTier(100, 80, 90), 90);
  assert.equal(getPriceByTier(100, 80, 90, "walkin"), 90);
});

test("storefront pricing keeps Normal and VIP prices tied to their tiers", () => {
  assert.equal(getPriceByTier(100, 80, 90, "normal"), 100);
  assert.equal(getPriceByTier(100, 80, 90, "vip"), 80);
});

test("Walk-in pricing falls back to the base price only when unavailable", () => {
  assert.equal(getPriceByTier(100, 80, null, "walkin"), 100);
  assert.equal(getPriceByTier(null, 80, null, "walkin"), null);
});
