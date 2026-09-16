import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateOriginalPrice,
  getPriceByTier,
  parseDiscountPercentage,
} from "../src/lib/utils/pricing";

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

test("public discount settings calculate a display-only original price safely", () => {
  assert.equal(parseDiscountPercentage("10"), 10);
  assert.equal(parseDiscountPercentage(" 12.5 "), 12.5);
  assert.equal(parseDiscountPercentage("101"), null);
  assert.equal(parseDiscountPercentage("not-a-number"), null);
  assert.equal(calculateOriginalPrice(100, parseDiscountPercentage("10")), 110);
  assert.equal(calculateOriginalPrice(100, null), 100);
});
