import assert from "node:assert/strict";
import { test } from "node:test";

import {
  analyticsSqlDateFormat,
  fillAnalyticsBuckets,
  normalizeAnalyticsDateRange,
  parseAnalyticsTimeframe,
  toAnalyticsIso,
} from "../src/lib/analytics/time";
import {
  isValidVisitorId,
  normalizeAnalyticsPagePath,
  resolveVisitorId,
} from "../src/lib/analytics/visitor";

const visitorId = "11111111-1111-4111-8111-111111111111";

test("normalizes analytics date ranges to Bangkok calendar days", () => {
  assert.deepEqual(
    normalizeAnalyticsDateRange(undefined, undefined, new Date("2026-08-05T04:00:00.000Z")),
    {
      startDate: "2026-08-01",
      endDate: "2026-08-05",
      startAt: "2026-08-01 00:00:00.000000",
      endExclusive: "2026-08-06 00:00:00.000000",
    },
  );
  assert.deepEqual(
    normalizeAnalyticsDateRange("2026-08-04T17:00:00.000Z", "2026-08-05"),
    {
      startDate: "2026-08-05",
      endDate: "2026-08-05",
      startAt: "2026-08-05 00:00:00.000000",
      endExclusive: "2026-08-06 00:00:00.000000",
    },
  );
  assert.deepEqual(normalizeAnalyticsDateRange("2026-02-30", "2026-03-01"), { error: "Invalid start date" });
  assert.deepEqual(normalizeAnalyticsDateRange("2026-08-06", "2026-08-05"), {
    error: "Start date must not be after end date",
  });
});

test("keeps timeframe SQL formats allowlisted", () => {
  assert.equal(parseAnalyticsTimeframe("hourly"), "hourly");
  assert.equal(parseAnalyticsTimeframe("unsupported"), "daily");
  assert.equal(analyticsSqlDateFormat("hourly"), "%Y-%m-%d %H:00");
  assert.equal(analyticsSqlDateFormat("daily"), "%Y-%m-%d");
  assert.equal(analyticsSqlDateFormat("monthly"), "%Y-%m");
  assert.equal(analyticsSqlDateFormat("yearly"), "%Y");
});

test("fills missing analytics buckets without changing existing counts", () => {
  const daily = fillAnalyticsBuckets(
    [{ label: "2026-08-02", visits: 4, uniqueVisitors: 2 }],
    "2026-08-01",
    "2026-08-03",
    "daily",
  );
  assert.deepEqual(daily, [
    { label: "2026-08-01", visits: 0, uniqueVisitors: 0 },
    { label: "2026-08-02", visits: 4, uniqueVisitors: 2 },
    { label: "2026-08-03", visits: 0, uniqueVisitors: 0 },
  ]);

  const hourly = fillAnalyticsBuckets(
    [{ label: "2026-08-05 13:00", visits: 3, uniqueVisitors: 1 }],
    "2026-08-05",
    "2026-08-05",
    "hourly",
  );
  assert.equal(hourly.length, 24);
  assert.deepEqual(hourly[13], { label: "2026-08-05 13:00", visits: 3, uniqueVisitors: 1 });
});

test("normalizes stored Bangkok DATETIME values for client rendering", () => {
  assert.equal(toAnalyticsIso("2026-08-05 13:00:00.000000"), "2026-08-05T06:00:00.000Z");
});

test("keeps visitor identity valid and strips query strings from page paths", () => {
  assert.equal(isValidVisitorId(visitorId), true);
  assert.equal(isValidVisitorId("not-a-uuid"), false);
  assert.equal(resolveVisitorId(visitorId, undefined), visitorId);
  assert.equal(resolveVisitorId(undefined, visitorId), visitorId);
  assert.equal(normalizeAnalyticsPagePath("/products?category=1"), "/products");
  assert.equal(normalizeAnalyticsPagePath("/admin?menu=users"), null);
  assert.equal(normalizeAnalyticsPagePath("https://example.com/"), null);
});
