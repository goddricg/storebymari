import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyTopupBonusDailyLimit,
  calculateTopupBonus,
  emptyTopupBonusAward,
  toTopupMinorUnits,
} from "../src/lib/topup/bonus";

test("exact bonus rules credit 500 + 10 and 1000 + 25", () => {
  const rules = [
    {
      id: "rule-500",
      siteId: "main",
      triggerAmount: 500,
      bonusPoints: 10,
      isActive: true,
    },
    {
      id: "rule-1000",
      siteId: "main",
      triggerAmount: 1000,
      bonusPoints: 25,
      isActive: true,
    },
  ];

  assert.deepEqual(calculateTopupBonus(500, rules), {
    ruleId: "rule-500",
    bonusPoints: 10,
    creditedPoints: 510,
  });
  assert.deepEqual(calculateTopupBonus(1000, rules), {
    ruleId: "rule-1000",
    bonusPoints: 25,
    creditedPoints: 1025,
  });
});

test("bonus rules are exact, inactive rules do not apply, and rules do not stack", () => {
  const rules = [
    {
      id: "inactive-500",
      siteId: "main",
      triggerAmount: 500,
      bonusPoints: 999,
      isActive: false,
    },
    {
      id: "active-1000",
      siteId: "main",
      triggerAmount: 1000,
      bonusPoints: 25,
      isActive: true,
    },
    {
      id: "second-1000",
      siteId: "main",
      triggerAmount: 1000,
      bonusPoints: 50,
      isActive: true,
    },
  ];

  assert.deepEqual(calculateTopupBonus(499.99, rules), emptyTopupBonusAward(499.99));
  assert.equal(calculateTopupBonus(500, rules).bonusPoints, 0);
  assert.equal(calculateTopupBonus(1000, rules).bonusPoints, 25);
  assert.equal(toTopupMinorUnits("500.00"), 50000);
});

test("each promotion can award at most two bonuses per day without changing base points", () => {
  const award = {
    ruleId: "rule-100",
    bonusPoints: 5,
    creditedPoints: 105,
  };

  assert.deepEqual(applyTopupBonusDailyLimit(award, 0), {
    award,
    bonusUsesToday: 1,
    bonusLimitReached: false,
  });
  assert.deepEqual(applyTopupBonusDailyLimit(award, 1), {
    award,
    bonusUsesToday: 2,
    bonusLimitReached: false,
  });
  assert.deepEqual(applyTopupBonusDailyLimit(award, 2), {
    award: {
      ruleId: "rule-100",
      bonusPoints: 0,
      creditedPoints: 100,
    },
    bonusUsesToday: 2,
    bonusLimitReached: true,
  });
});
