export type TopupBonusRule = {
  id: string;
  siteId: string;
  triggerAmount: number;
  bonusPoints: number;
  isActive: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type TopupBonusAward = {
  ruleId: string | null;
  bonusPoints: number;
  creditedPoints: number;
};

export const TOPUP_BONUS_DAILY_LIMIT = 2;

export type TopupBonusLimitResult = {
  award: TopupBonusAward;
  bonusUsesToday: number | null;
  bonusLimitReached: boolean;
};

/**
 * Convert a money/points value to a stable two-decimal integer representation.
 * This keeps exact-match bonus rules away from floating-point comparisons.
 */
export function toTopupMinorUnits(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

export function roundTopupPoints(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Base policy: one active exact-match rule can award one bonus per top-up.
 * Rules do not stack, and inactive rules are ignored. The server applies the
 * per-user, per-promotion daily quota separately at completion time.
 */
export function calculateTopupBonus(
  amount: number,
  rules: readonly TopupBonusRule[]
): TopupBonusAward {
  const amountMinorUnits = toTopupMinorUnits(amount);
  const matchingRule = rules.find(
    (rule) =>
      rule.isActive &&
      toTopupMinorUnits(rule.triggerAmount) === amountMinorUnits
  );
  const bonusPoints = matchingRule
    ? roundTopupPoints(Math.max(0, matchingRule.bonusPoints))
    : 0;

  return {
    ruleId: matchingRule?.id ?? null,
    bonusPoints,
    creditedPoints: roundTopupPoints(amount + bonusPoints),
  };
}

export function emptyTopupBonusAward(amount: number): TopupBonusAward {
  return {
    ruleId: null,
    bonusPoints: 0,
    creditedPoints: roundTopupPoints(amount),
  };
}

/**
 * Apply the per-user, per-promotion daily quota to a resolved award.
 * The caller supplies the number of successful bonus awards already counted
 * for the same user, site, rule, and Bangkok calendar day.
 */
export function applyTopupBonusDailyLimit(
  award: TopupBonusAward,
  priorUsageCount: number,
  dailyLimit = TOPUP_BONUS_DAILY_LIMIT,
): TopupBonusLimitResult {
  const normalizedPriorUsage = Number.isFinite(priorUsageCount)
    ? Math.max(0, Math.floor(priorUsageCount))
    : 0;
  const normalizedLimit = Number.isFinite(dailyLimit)
    ? Math.max(0, Math.floor(dailyLimit))
    : TOPUP_BONUS_DAILY_LIMIT;
  const hasBonus = Boolean(award.ruleId) && award.bonusPoints > 0;

  if (!hasBonus) {
    return {
      award,
      bonusUsesToday: null,
      bonusLimitReached: false,
    };
  }

  const canAward = normalizedPriorUsage < normalizedLimit;
  const bonusPoints = canAward ? award.bonusPoints : 0;

  return {
    award: {
      ruleId: award.ruleId,
      bonusPoints,
      creditedPoints: roundTopupPoints(
        award.creditedPoints - award.bonusPoints + bonusPoints,
      ),
    },
    bonusUsesToday: normalizedPriorUsage + (canAward ? 1 : 0),
    bonusLimitReached: !canAward,
  };
}
