import { randomUUID } from "crypto";
import type { RowDataPacket } from "mysql2";

import pool from "@/lib/mysql";
import { getSiteId } from "@/lib/site";
import { getSettingValues } from "@/lib/settings/repository";
import {
  getDefaultAvatarKeyForUser,
  getRankingAvatarUrl,
  isValidRankingAvatarKey,
} from "@/lib/ranking/avatars";

const RANKING_SETTING_KEYS = [
  "ranking_enabled",
  "ranking_realtime",
  "ranking_show_avatar",
  "ranking_show_username",
  "ranking_show_amount",
  "ranking_count",
  "ranking_timezone",
  "ranking_auto_reset_monthly",
] as const;

const DEFAULT_TIMEZONE = "Asia/Bangkok";

export type RankingSettings = {
  enabled: boolean;
  realtime: boolean;
  showAvatar: boolean;
  showUsername: boolean;
  showAmount: boolean;
  count: number;
  timezone: string;
  autoResetMonthly: boolean;
};

export type RankingEntry = {
  rank: number;
  username: string | null;
  amount: number | null;
  topupCount: number;
  avatarUrl: string | null;
};

export type RankingSnapshot = {
  settings: RankingSettings;
  rows: RankingEntry[];
  periodLabel: string;
};

type RankingRow = RowDataPacket & {
  user_id: string;
  display_name: string | null;
  topup_count: number | string;
  total_amount: number | string;
  avatar_key?: string | null;
};

function asBoolean(value: string | null | undefined, fallback: boolean): boolean {
  if (value === null || value === undefined || value === "") return fallback;
  return value === "true";
}

function asCount(value: string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 10;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 10;
  return Math.min(10, Math.max(1, Math.trunc(parsed)));
}

function normalizeTimezone(value: string | null | undefined): string {
  const timezone = value?.trim() || DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return timezone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function getTimeParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const result = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  ) as Record<string, number>;

  return {
    year: result.year,
    month: result.month,
    day: result.day,
    hour: result.hour,
    minute: result.minute,
    second: result.second,
  };
}

function zonedMonthStartUtc(year: number, month: number, timezone: string): Date {
  const utcGuess = Date.UTC(year, month - 1, 1);
  const zonedGuess = getTimeParts(new Date(utcGuess), timezone);
  const zonedAsUtc = Date.UTC(
    zonedGuess.year,
    zonedGuess.month - 1,
    zonedGuess.day,
    zonedGuess.hour,
    zonedGuess.minute,
    zonedGuess.second
  );
  const offset = zonedAsUtc - utcGuess;
  return new Date(utcGuess - offset);
}

export function getCurrentMonthBounds(timezone: string, now = new Date()): [Date, Date] {
  const parts = getTimeParts(now, timezone);
  const start = zonedMonthStartUtc(parts.year, parts.month, timezone);
  const nextYear = parts.month === 12 ? parts.year + 1 : parts.year;
  const nextMonth = parts.month === 12 ? 1 : parts.month + 1;
  const end = zonedMonthStartUtc(nextYear, nextMonth, timezone);
  return [start, end];
}

export function formatRankingPeriod(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: timezone,
  }).format(now);
}

export async function getRankingSettings(): Promise<RankingSettings> {
  const values = await getSettingValues([...RANKING_SETTING_KEYS]);
  return {
    enabled: asBoolean(values.ranking_enabled, true),
    realtime: asBoolean(values.ranking_realtime, false),
    showAvatar: asBoolean(values.ranking_show_avatar, true),
    showUsername: asBoolean(values.ranking_show_username, true),
    showAmount: asBoolean(values.ranking_show_amount, true),
    count: asCount(values.ranking_count),
    timezone: normalizeTimezone(values.ranking_timezone),
    autoResetMonthly: asBoolean(values.ranking_auto_reset_monthly, true),
  };
}

function isMissingProfileTable(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string };
  return candidate?.code === "ER_NO_SUCH_TABLE" || candidate?.message?.includes("user_profile_preferences") === true;
}

async function queryRankingRows(
  siteId: string,
  start: Date,
  end: Date,
  limit: number,
  includeProfile: boolean
): Promise<RankingRow[]> {
  const profileJoin = includeProfile
    ? "LEFT JOIN user_profile_preferences profile ON profile.user_id = u.id AND profile.site_id = u.site_id"
    : "";
  const profileSelect = includeProfile ? ", profile.avatar_key" : "";
  const profileGroup = includeProfile ? ", profile.avatar_key" : "";

  const [rows] = await pool.execute(
    `SELECT
       u.id AS user_id,
       u.display_name,
       COUNT(s.id) AS topup_count,
       COALESCE(SUM(s.amount), 0) AS total_amount
       ${profileSelect}
     FROM slip_history s
     INNER JOIN users u ON s.user_id = u.id AND u.site_id = ?
     ${profileJoin}
     WHERE s.site_id = ?
       AND s.status = 'success'
       AND s.created_at >= ?
       AND s.created_at < ?
     GROUP BY u.id, u.display_name${profileGroup}
     ORDER BY total_amount DESC, u.display_name ASC, u.id ASC
     LIMIT ?`,
    [siteId, siteId, start, end, limit]
  );

  return rows as RankingRow[];
}

export async function listMonthlyRanking(settings: RankingSettings, now = new Date()): Promise<RankingEntry[]> {
  const siteId = getSiteId();
  const [start, end] = getCurrentMonthBounds(settings.timezone, now);
  let rows: RankingRow[];

  try {
    rows = await queryRankingRows(siteId, start, end, settings.count, true);
  } catch (error) {
    if (!isMissingProfileTable(error)) throw error;
    rows = await queryRankingRows(siteId, start, end, settings.count, false);
  }

  return rows.map((row, index) => {
    const avatarKey = row.avatar_key && isValidRankingAvatarKey(row.avatar_key)
      ? row.avatar_key
      : getDefaultAvatarKeyForUser(row.user_id);

    return {
      rank: index + 1,
      username: settings.showUsername ? row.display_name || "สมาชิก" : null,
      amount: settings.showAmount ? Number(row.total_amount) : null,
      topupCount: Number(row.topup_count),
      avatarUrl: settings.showAvatar ? getRankingAvatarUrl(avatarKey) : null,
    };
  });
}

export async function getRankingSnapshot(): Promise<RankingSnapshot> {
  const settings = await getRankingSettings();
  const now = new Date();
  const periodLabel = formatRankingPeriod(settings.timezone, now);
  if (!settings.enabled) return { settings, rows: [], periodLabel };
  return { settings, rows: await listMonthlyRanking(settings, now), periodLabel };
}

export async function getUserAvatarKey(userId: string): Promise<string | null> {
  const fallbackAvatarKey = getDefaultAvatarKeyForUser(userId);

  try {
    const [rows] = await pool.execute(
      "SELECT avatar_key FROM user_profile_preferences WHERE user_id = ? AND site_id = ? LIMIT 1",
      [userId, getSiteId()]
    );
    const row = (rows as Array<{ avatar_key?: string | null }>)[0];
    return row?.avatar_key && isValidRankingAvatarKey(row.avatar_key)
      ? row.avatar_key
      : fallbackAvatarKey;
  } catch (error) {
    if (isMissingProfileTable(error)) return fallbackAvatarKey;
    throw error;
  }
}

export async function setUserAvatarKey(userId: string, avatarKey: string): Promise<void> {
  if (!isValidRankingAvatarKey(avatarKey)) {
    throw new Error("Invalid avatar selection");
  }

  const now = new Date();
  await pool.execute(
    `INSERT INTO user_profile_preferences
      (id, user_id, site_id, avatar_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE avatar_key = VALUES(avatar_key), updated_at = VALUES(updated_at)`,
    [randomUUID(), userId, getSiteId(), avatarKey, now, now]
  );
}
