import {
  addTopupReportDays,
  buildTopupReportDateRange,
  getDateOnlyInTopupTimeZone,
  getStartOfCurrentMonthDateOnly,
  normalizeTopupReportDate,
  TOPUP_REPORT_TIME_ZONE,
} from "@/lib/topup/report-time";

export const ANALYTICS_TIME_ZONE = TOPUP_REPORT_TIME_ZONE;
export const PRESENCE_STALE_SECONDS = 90;

export type AnalyticsTimeframe = "hourly" | "daily" | "monthly" | "yearly";

export type AnalyticsPoint = {
  label: string;
  visits: number;
  uniqueVisitors: number;
};

export type AnalyticsDateRange = {
  startDate: string;
  endDate: string;
  startAt: string;
  endExclusive: string;
};

export function parseAnalyticsTimeframe(value: string | null | undefined): AnalyticsTimeframe {
  if (value === "hourly" || value === "monthly" || value === "yearly") {
    return value;
  }
  return "daily";
}

export function analyticsSqlDateFormat(timeframe: AnalyticsTimeframe): string {
  switch (timeframe) {
    case "hourly":
      return "%Y-%m-%d %H:00";
    case "monthly":
      return "%Y-%m";
    case "yearly":
      return "%Y";
    case "daily":
    default:
      return "%Y-%m-%d";
  }
}

export function normalizeAnalyticsDateRange(
  startInput: string | null | undefined,
  endInput: string | null | undefined,
  now = new Date(),
): AnalyticsDateRange | { error: string } {
  const rawStart = startInput?.trim();
  const rawEnd = endInput?.trim();
  const parsedStart = rawStart ? normalizeTopupReportDate(rawStart) : undefined;
  const parsedEnd = rawEnd ? normalizeTopupReportDate(rawEnd) : undefined;

  if (rawStart && !parsedStart) return { error: "Invalid start date" };
  if (rawEnd && !parsedEnd) return { error: "Invalid end date" };

  const startDate = parsedStart ?? parsedEnd ?? getStartOfCurrentMonthDateOnly(now);
  const endDate = parsedEnd ?? getDateOnlyInTopupTimeZone(now);

  if (startDate > endDate) return { error: "Start date must not be after end date" };

  const range = buildTopupReportDateRange(startDate, endDate);
  if (!range.startAt || !range.endExclusive) {
    return { error: "Unable to build date range" };
  }

  return {
    startDate,
    endDate,
    startAt: range.startAt,
    endExclusive: range.endExclusive,
  };
}

function dateOnlyToUtcMs(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function dateOnlyDistanceInDays(startDate: string, endDate: string): number {
  return Math.round((dateOnlyToUtcMs(endDate) - dateOnlyToUtcMs(startDate)) / 86_400_000);
}

function addAnalyticsMonths(value: string, months: number): string {
  const [year, month] = value.slice(0, 7).split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, 1));
  candidate.setUTCMonth(candidate.getUTCMonth() + months);
  return `${String(candidate.getUTCFullYear()).padStart(4, "0")}-${String(candidate.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function pointFor(label: string, map: Map<string, AnalyticsPoint>): AnalyticsPoint {
  return map.get(label) ?? { label, visits: 0, uniqueVisitors: 0 };
}

export function fillAnalyticsBuckets(
  data: AnalyticsPoint[],
  startDate: string,
  endDate: string,
  timeframe: AnalyticsTimeframe,
): AnalyticsPoint[] {
  const dataMap = new Map(data.map((point) => [point.label, point]));

  if (timeframe === "hourly") {
    // Hourly charts are intended for a bounded inspection window. Avoid creating
    // tens of thousands of zero buckets when an admin selects a long range.
    if (dateOnlyDistanceInDays(startDate, endDate) > 31) return data;

    const filled: AnalyticsPoint[] = [];
    for (let day = startDate; day <= endDate; day = addTopupReportDays(day, 1)) {
      for (let hour = 0; hour < 24; hour += 1) {
        filled.push(pointFor(`${day} ${String(hour).padStart(2, "0")}:00`, dataMap));
      }
    }
    return filled;
  }

  if (timeframe === "daily") {
    const filled: AnalyticsPoint[] = [];
    for (let day = startDate; day <= endDate; day = addTopupReportDays(day, 1)) {
      filled.push(pointFor(day, dataMap));
    }
    return filled;
  }

  if (timeframe === "monthly") {
    const filled: AnalyticsPoint[] = [];
    const lastMonth = `${endDate.slice(0, 7)}-01`;
    for (let month = `${startDate.slice(0, 7)}-01`; month <= lastMonth; month = addAnalyticsMonths(month, 1)) {
      filled.push(pointFor(month.slice(0, 7), dataMap));
    }
    return filled;
  }

  const filled: AnalyticsPoint[] = [];
  for (let year = Number(startDate.slice(0, 4)); year <= Number(endDate.slice(0, 4)); year += 1) {
    filled.push(pointFor(String(year), dataMap));
  }
  return filled;
}

export function toAnalyticsIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  const normalized = value.trim();
  if (!normalized) return null;
  const withBangkokOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)
    ? normalized
    : `${normalized.replace(" ", "T")}+07:00`;
  const parsed = new Date(withBangkokOffset);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
