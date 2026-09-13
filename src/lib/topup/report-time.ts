export const TOPUP_REPORT_TIME_ZONE = "Asia/Bangkok";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type DateParts = {
  year: number;
  month: number;
  day: number;
};

function formatDateParts(parts: DateParts): string {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function getDatePartsInReportTimeZone(value: Date): DateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TOPUP_REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type === "year" || part.type === "month" || part.type === "day")
      .map((part) => [part.type, Number(part.value)])
  ) as Record<"year" | "month" | "day", number>;

  return values;
}

function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

export function getDateOnlyInTopupTimeZone(value = new Date()): string {
  return formatDateParts(getDatePartsInReportTimeZone(value));
}

export function getStartOfCurrentMonthDateOnly(value = new Date()): string {
  const parts = getDatePartsInReportTimeZone(value);
  return formatDateParts({ ...parts, day: 1 });
}

/**
 * Admin report filters represent a calendar date in Thailand, even when a
 * legacy caller still sends an ISO timestamp. Normalizing both forms here
 * prevents browser/server timezone differences from changing the selected day.
 */
export function normalizeTopupReportDate(value: string | null | undefined): string | undefined {
  const input = value?.trim();
  if (!input) return undefined;

  if (DATE_ONLY_PATTERN.test(input)) {
    return isValidDateOnly(input) ? input : undefined;
  }

  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? undefined : getDateOnlyInTopupTimeZone(parsed);
}

export function addTopupReportDays(value: string, days: number): string {
  if (!isValidDateOnly(value)) {
    throw new Error(`Invalid date-only value: ${value}`);
  }

  const [year, month, day] = value.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day));
  result.setUTCDate(result.getUTCDate() + days);

  return formatDateParts({
    year: result.getUTCFullYear(),
    month: result.getUTCMonth() + 1,
    day: result.getUTCDate(),
  });
}

export function buildTopupReportDateRange(startInput?: string, endInput?: string) {
  const startDate = normalizeTopupReportDate(startInput);
  const endDate = normalizeTopupReportDate(endInput);

  return {
    startDate,
    endDate,
    startAt: startDate ? `${startDate} 00:00:00.000000` : undefined,
    endExclusive: endDate ? `${addTopupReportDays(endDate, 1)} 00:00:00.000000` : undefined,
  };
}
