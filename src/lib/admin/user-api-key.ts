import type { RowDataPacket } from "mysql2/promise";

export type ApiKeyRow = RowDataPacket & {
  id: string;
  api_key: string;
  site_name: string | null;
  is_enabled: number | boolean;
  is_site_suspended: number | boolean;
  created_at: Date | string | null;
};

export type QueryScope = {
  whereClause: string;
  params: string[];
};

/** Main remains the intentional central operator scope; tenants are exact-site. */
export function buildTargetUserScope(siteId: string, userId: string): QueryScope {
  return siteId === "main"
    ? { whereClause: "id = ?", params: [userId] }
    : { whereClause: "id = ? AND site_id = ?", params: [userId, siteId] };
}

/** Keep the tenant boundary in the API-key query as well as in the target lookup. */
export function buildApiKeyScope(siteId: string, userId: string): QueryScope {
  if (siteId === "main") {
    return { whereClause: "tenant_api_keys.user_id = ?", params: [userId] };
  }

  return {
    whereClause:
      "tenant_api_keys.user_id = ? AND EXISTS (" +
      "SELECT 1 FROM users AS target_user " +
      "WHERE target_user.id = tenant_api_keys.user_id AND target_user.site_id = ?)",
    params: [userId, siteId],
  };
}

export function maskApiKey(value: string | null | undefined): string | null {
  const apiKey = value?.trim();
  if (!apiKey) return null;
  if (apiKey.length <= 12) return "••••••••";
  return `${apiKey.slice(0, 8)}…${apiKey.slice(-4)}`;
}

function toIsoDate(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Normal reads expose metadata and a legacy-compatible masked api_key only. */
export function toApiKeyMetadata(row: ApiKeyRow) {
  const maskedApiKey = maskApiKey(row.api_key);
  return {
    id: row.id,
    hasApiKey: Boolean(row.api_key),
    maskedApiKey,
    api_key: maskedApiKey,
    site_name: row.site_name ?? null,
    is_enabled: row.is_enabled === 1 || row.is_enabled === true,
    is_site_suspended: row.is_site_suspended === 1 || row.is_site_suspended === true,
    created_at: toIsoDate(row.created_at),
  };
}

/** Rotation is the only response that returns a newly generated credential. */
export function toOneTimeApiKeyResponse(row: ApiKeyRow, newKey: string) {
  return {
    ...toApiKeyMetadata(row),
    api_key: newKey,
    oneTime: true,
  };
}
