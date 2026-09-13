export type PurchaseEstimate = {
  purchasePercent: number;
  notPurchasePercent: number;
  totalVisits: number;
  uniqueVisitors: number;
  hasData: boolean;
};

function normalizeCount(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Calculates the requested analytics proxy from page visits and unique visitors.
 * This is an estimate, not an order conversion rate, because the analytics
 * events do not contain purchase events.
 */
export function calculatePurchaseEstimate(totalVisits: number, uniqueVisitors: number): PurchaseEstimate {
  const visits = normalizeCount(totalVisits);
  const unique = Math.min(visits, normalizeCount(uniqueVisitors));

  if (visits === 0) {
    return {
      purchasePercent: 0,
      notPurchasePercent: 0,
      totalVisits: visits,
      uniqueVisitors: unique,
      hasData: false,
    };
  }

  const purchasePercent = (unique / visits) * 100;

  return {
    purchasePercent,
    notPurchasePercent: 100 - purchasePercent,
    totalVisits: visits,
    uniqueVisitors: unique,
    hasData: true,
  };
}
