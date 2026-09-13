import pool from "@/lib/mysql";
import { headers } from "next/headers";
import type { RowDataPacket } from "mysql2";

type ApiKeyRow = RowDataPacket & {
  tenant_id: string;
  user_id: string;
  site_name: string | null;
  is_enabled: number | boolean;
  is_site_suspended: number | boolean;
};

export type ValidatedApiKey = {
  tenant_id: string;
  user_id: string;
  site_name: string;
  is_site_suspended: boolean;
};

export async function validateApiKey(
  requestHeaders?: Headers
): Promise<ValidatedApiKey | null> {
  const headersList = requestHeaders ?? (await headers());
  const authorization = headersList.get("Authorization");
  const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const apiKey = headersList.get("x-api-key") || bearerToken;

  if (!apiKey) {
    return null;
  }

  try {
    const [rows] = await pool.execute(
      `SELECT id AS tenant_id, user_id, site_name, is_enabled, is_site_suspended
       FROM tenant_api_keys
       WHERE api_key = ?
       LIMIT 1`,
      [apiKey]
    );

    const keys = rows as ApiKeyRow[];
    if (keys.length === 0) {
      return null;
    }

    const keyInfo = keys[0];
    
    // Check if enabled (boolean or tinyint)
    if (keyInfo.is_enabled === 0 || keyInfo.is_enabled === false) {
      return null;
    }

    return {
      tenant_id: keyInfo.tenant_id,
      user_id: keyInfo.user_id,
      site_name: keyInfo.site_name || "Unknown Site",
      is_site_suspended: Boolean(keyInfo.is_site_suspended),
    };
  } catch {
    console.error("[api-key] validation query failed");
    return null;
  }
}
