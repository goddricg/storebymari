import pool from "@/lib/mysql";
import { randomUUID } from "crypto";
import { getSiteId } from "@/lib/site";
import type { RowDataPacket } from "mysql2";

export type Setting = {
  key: string;
  value: string | null;
  description: string | null;
  updatedAt: string;
};

type SettingRow = RowDataPacket & {
  key: string;
  value: string | null;
  description: string | null;
  updated_at: Date | string | null;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toSetting(row: SettingRow): Setting {
  return {
    key: row.key,
    value: row.value ?? null,
    description: row.description ?? null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

export async function getAllSettings(): Promise<Setting[]> {
  try {
    const siteId = getSiteId();
    let query = "SELECT * FROM settings WHERE site_id = ?";
    if (siteId === "main") {
      query = "SELECT * FROM settings WHERE site_id = ? OR site_id IS NULL OR site_id = ''";
    }
    const [rows] = await pool.execute(query, [siteId]);
    const settings = (rows as SettingRow[]).map(toSetting);
    return settings.sort((a, b) => a.key.localeCompare(b.key, "th"));
  } catch (error: unknown) {
    throw new Error(`ไม่สามารถอ่านการตั้งค่าได้: ${getErrorMessage(error)}`);
  }
}

export async function getSetting(key: string): Promise<Setting | null> {
  try {
    const siteId = getSiteId();
    let query = "SELECT * FROM settings WHERE `key` = ? AND site_id = ? LIMIT 1";
    let params = [key, siteId];
    if (siteId === "main") {
      query = "SELECT * FROM settings WHERE `key` = ? AND (site_id = ? OR site_id IS NULL OR site_id = '') ORDER BY CASE WHEN site_id = ? THEN 0 ELSE 1 END ASC LIMIT 1";
      params = [key, siteId, siteId];
    }
    const [rows] = await pool.execute(query, params);
    const list = rows as SettingRow[];
    if (list.length === 0) return null;
    return toSetting(list[0]);
  } catch (error: unknown) {
    throw new Error(`ไม่สามารถอ่านการตั้งค่าได้: ${getErrorMessage(error)}`);
  }
}

export async function updateSetting(
  key: string,
  value: string | null
): Promise<Setting> {
  try {
    const siteId = getSiteId();
    const now = new Date();
    
    // UUID สำหรับแถวใหม่ถ้าจำเป็น
    const id = randomUUID();

    await pool.execute(
      "INSERT INTO settings (id, `key`, value, description, created_at, updated_at, site_id) VALUES (?, ?, ?, NULL, ?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)",
      [id, key, value, now, now, siteId]
    );

    invalidateSettingsCache(key);

    return {
      key,
      value,
      description: null,
      updatedAt: now.toISOString(),
    };
  } catch (error: unknown) {
    throw new Error(
      `ไม่สามารถอัปเดตการตั้งค่าได้: ${getErrorMessage(error)}`
    );
  }
}

export async function getSettingValue(key: string): Promise<string | null> {
  const setting = await getSetting(key);
  return setting?.value ?? null;
}



/** ดึงหลาย key ในครั้งเดียว — ลด round-trip ไป DB */
export async function getSettingValues(
  keys: string[]
): Promise<Record<string, string | null>> {
  if (keys.length === 0) {
    return {};
  }

  const uniqueKeys = [...new Set(keys)];
  
  try {
    const result: Record<string, string | null> = Object.fromEntries(
      uniqueKeys.map((key) => [key, null])
    );

    const siteId = getSiteId();
    let query = `SELECT \`key\`, value, site_id FROM settings WHERE \`key\` IN (${uniqueKeys.map(() => "?").join(",")}) AND site_id = ?`;
    let params: any[] = [...uniqueKeys, siteId];

    if (siteId === "main") {
      query = `SELECT \`key\`, value, site_id FROM settings WHERE \`key\` IN (${uniqueKeys.map(() => "?").join(",")}) AND (site_id = ? OR site_id IS NULL OR site_id = '') ORDER BY CASE WHEN site_id = ? THEN 0 ELSE 1 END ASC`;
      params = [...uniqueKeys, siteId, siteId];
    }

    const [rows] = await pool.execute(query, params);
    const list = rows as (SettingRow & { site_id?: string })[];

    for (const row of list) {
      if (result[row.key] === null || row.site_id === siteId) {
        result[row.key] = row.value ?? null;
      }
    }

    return result;
  } catch (error: unknown) {
    console.error("Error in getSettingValues:", error);
    throw new Error(`ไม่สามารถอ่านการตั้งค่าได้: ${getErrorMessage(error)}`);
  }
}

// In-memory TTL Cache (60 seconds) to avoid database hammering on public settings
const settingsMemoryCache = new Map<string, { value: string | null; expiresAt: number }>();
const SETTINGS_CACHE_TTL_MS = 60 * 1000;

export function invalidateSettingsCache(key?: string) {
  if (key) {
    settingsMemoryCache.delete(`${getSiteId()}:${key}`);
  } else {
    settingsMemoryCache.clear();
  }
}

export const getSettingValuesCached = async (keys: string[]) => {
  const siteId = getSiteId();
  const now = Date.now();
  const missingKeys: string[] = [];
  const result: Record<string, string | null> = {};

  for (const key of keys) {
    const cacheKey = `${siteId}:${key}`;
    const cached = settingsMemoryCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      result[key] = cached.value;
    } else {
      missingKeys.push(key);
    }
  }

  if (missingKeys.length > 0) {
    const freshValues = await getSettingValues(missingKeys);
    for (const [k, v] of Object.entries(freshValues)) {
      result[k] = v;
      settingsMemoryCache.set(`${siteId}:${k}`, {
        value: v,
        expiresAt: now + SETTINGS_CACHE_TTL_MS,
      });
    }
  }

  return result;
};

export const getAllSettingsCached = async () => {
  return getAllSettings();
};
