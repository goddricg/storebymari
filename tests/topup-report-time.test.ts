import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addTopupReportDays,
  buildTopupReportDateRange,
  getDateOnlyInTopupTimeZone,
  getStartOfCurrentMonthDateOnly,
  normalizeTopupReportDate,
} from "../src/lib/topup/report-time";

test("normalizes date filters to the Bangkok calendar day", () => {
  assert.equal(normalizeTopupReportDate("2026-08-05"), "2026-08-05");
  assert.equal(normalizeTopupReportDate("2026-08-04T17:00:00.000Z"), "2026-08-05");
  assert.equal(normalizeTopupReportDate("2026-08-05T16:59:59.999Z"), "2026-08-05");
  assert.equal(normalizeTopupReportDate("2026-02-30"), undefined);
  assert.equal(normalizeTopupReportDate("not-a-date"), undefined);
});

test("uses an exclusive next-day boundary for DATETIME reports", () => {
  assert.deepEqual(buildTopupReportDateRange("2026-08-05", "2026-08-05"), {
    startDate: "2026-08-05",
    endDate: "2026-08-05",
    startAt: "2026-08-05 00:00:00.000000",
    endExclusive: "2026-08-06 00:00:00.000000",
  });
});

test("advances date-only values without local machine timezone effects", () => {
  assert.equal(addTopupReportDays("2026-08-05", 1), "2026-08-06");
  assert.equal(addTopupReportDays("2026-08-01", -1), "2026-07-31");
  assert.equal(getDateOnlyInTopupTimeZone(new Date("2026-08-04T17:00:00.000Z")), "2026-08-05");
  assert.equal(getStartOfCurrentMonthDateOnly(new Date("2026-08-04T17:00:00.000Z")), "2026-08-01");
});
