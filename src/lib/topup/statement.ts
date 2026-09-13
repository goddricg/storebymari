export const TOPUP_STATEMENT_CUTOFF = "2026-08-26 20:42:14";
export const TOPUP_STATEMENT_CUTOFF_DATE = "2026-08-26";
export const TOPUP_STATEMENT_TIME_ZONE = "Asia/Bangkok";
export const TOPUP_STATEMENT_MAX_PRINT_ROWS = 5000;

export type TopupStatementSourceFilter = "ALL" | "SYSTEM" | "ADMIN";
export type TopupStatementSortOrder = "asc" | "desc";

export function normalizeTopupStatementSource(
  value: string | null | undefined,
): TopupStatementSourceFilter {
  const normalized = (value ?? "ALL").trim().toUpperCase();
  return normalized === "SYSTEM" || normalized === "ADMIN" ? normalized : "ALL";
}
