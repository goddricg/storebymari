import assert from "node:assert/strict";
import test from "node:test";

import { calculatePurchaseEstimate } from "@/lib/analytics/purchase-estimate";

test("calculates purchase and not-purchase percentages from visits and unique visitors", () => {
  assert.deepEqual(calculatePurchaseEstimate(100, 25), {
    purchasePercent: 25,
    notPurchasePercent: 75,
    totalVisits: 100,
    uniqueVisitors: 25,
    hasData: true,
  });
});

test("clamps unique visitors to the total visit count", () => {
  const result = calculatePurchaseEstimate(10, 20);

  assert.equal(result.purchasePercent, 100);
  assert.equal(result.notPurchasePercent, 0);
  assert.equal(result.uniqueVisitors, 10);
});

test("returns an empty estimate when there are no visits", () => {
  assert.deepEqual(calculatePurchaseEstimate(0, 0), {
    purchasePercent: 0,
    notPurchasePercent: 0,
    totalVisits: 0,
    uniqueVisitors: 0,
    hasData: false,
  });
});

test("normalizes invalid and negative counts safely", () => {
  assert.deepEqual(calculatePurchaseEstimate(Number.NaN, -5), {
    purchasePercent: 0,
    notPurchasePercent: 0,
    totalVisits: 0,
    uniqueVisitors: 0,
    hasData: false,
  });
});
