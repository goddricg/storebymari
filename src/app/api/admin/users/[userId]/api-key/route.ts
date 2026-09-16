import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { randomBytes, randomUUID } from "crypto";
import pool from "@/lib/mysql";
import { getCurrentUser } from "@/lib/auth/server";
import { isAdminUser } from "@/lib/auth/roles";
import { getSiteId } from "@/lib/site";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";
import {
  buildApiKeyScope,
  buildTargetUserScope,
  toApiKeyMetadata,
  toOneTimeApiKeyResponse,
  type ApiKeyRow,
} from "@/lib/admin/user-api-key";

type TargetUserRow = RowDataPacket & {
  id: string;
  site_id: string | null;
};

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

const updateApiKeySchema = z
  .object({
    siteName: z.string().max(255).optional(),
    isEnabled: z.boolean().optional(),
    isSiteSuspended: z.boolean().optional(),
  })
  .strict();

async function findAuthorizedTargetUser(userId: string, siteId: string) {
  const targetScope = buildTargetUserScope(siteId, userId);
  const [rows] = await pool.execute<TargetUserRow[]>(
    `SELECT id, site_id FROM users WHERE ${targetScope.whereClause} LIMIT 1`,
    targetScope.params,
  );
  const target = rows[0];
  if (!target) return null;

  return {
    id: target.id,
    siteId: target.site_id || siteId,
  };
}

async function requireApiKeyAdmin() {
  const me = await getCurrentUser();
  if (!me || !isAdminUser(me)) return null;
  return me;
}

// GET: Fetch API-key metadata for a user without returning the stored key.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const me = await requireApiKeyAdmin();
  if (!me) return privateJson({ message: "Forbidden" }, 403);

  const { userId } = await params;
  const siteId = getSiteId();

  try {
    const target = await findAuthorizedTargetUser(userId, siteId);
    if (!target) return privateJson({ message: "ไม่พบผู้ใช้" }, 404);

    const keyScope = buildApiKeyScope(siteId, target.id);
    const [rows] = await pool.execute<ApiKeyRow[]>(
      `SELECT id, api_key, site_name, is_enabled, is_site_suspended, created_at
       FROM tenant_api_keys
       WHERE ${keyScope.whereClause}
       LIMIT 1`,
      keyScope.params,
    );
    const key = rows[0];

    await recordAdminAuditEvent({
      actor: me,
      action: "API_KEY_VIEW",
      category: "security",
      severity: key ? "high" : "medium",
      entityType: "tenant_api_key",
      entityId: String(key?.id ?? target.id),
      after: key
        ? {
            targetSiteId: target.siteId,
            hasApiKey: true,
            siteName: key.site_name,
            isEnabled: key.is_enabled,
            isSiteSuspended: key.is_site_suspended,
          }
        : { targetSiteId: target.siteId, hasApiKey: false },
      details: "Viewed API key metadata; the key value was not written to audit storage",
      ...getAdminAuditRequestContext(request),
    });

    return privateJson({ apiKey: key ? toApiKeyMetadata(key) : null });
  } catch {
    console.error("Error fetching API key metadata");
    return privateJson({ message: "Failed to fetch API key" }, 500);
  }
}

// POST: Generate a new API key and return it once for the explicit rotation UI.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const me = await requireApiKeyAdmin();
  if (!me) return privateJson({ message: "Forbidden" }, 403);

  const { userId } = await params;
  const siteId = getSiteId();

  try {
    const target = await findAuthorizedTargetUser(userId, siteId);
    if (!target) return privateJson({ message: "ไม่พบผู้ใช้" }, 404);

    const newKey = `sk_live_${randomBytes(24).toString("hex")}`;
    const keyScope = buildApiKeyScope(siteId, target.id);
    const [existingRows] = await pool.execute<ApiKeyRow[]>(
      `SELECT id, api_key, site_name, is_enabled, is_site_suspended, created_at
       FROM tenant_api_keys
       WHERE ${keyScope.whereClause}
       LIMIT 1`,
      keyScope.params,
    );
    const existingKey = existingRows[0];
    let keyId = existingKey?.id ?? randomUUID();

    if (existingKey) {
      await pool.execute(
        `UPDATE tenant_api_keys
         SET api_key = ?
         WHERE id = ? AND ${keyScope.whereClause}`,
        [newKey, existingKey.id, ...keyScope.params],
      );
    } else {
      if (siteId === "main") {
        await pool.execute(
          `INSERT INTO tenant_api_keys (id, user_id, api_key, is_enabled)
           VALUES (?, ?, ?, 1)`,
          [keyId, target.id, newKey],
        );
      } else {
        // Keep the child-site predicate attached to the insert too, so a
        // target-site change between the lookup and insert cannot cross a
        // tenant boundary.
        await pool.execute(
          `INSERT INTO tenant_api_keys (id, user_id, api_key, is_enabled)
           SELECT ?, target_user.id, ?, 1
           FROM users AS target_user
           WHERE target_user.id = ? AND target_user.site_id = ?`,
          [keyId, newKey, target.id, siteId],
        );
      }
    }

    const [newRows] = await pool.execute<ApiKeyRow[]>(
      `SELECT id, api_key, site_name, is_enabled, is_site_suspended, created_at
       FROM tenant_api_keys
       WHERE ${keyScope.whereClause}
       LIMIT 1`,
      keyScope.params,
    );
    const rotatedKey = newRows[0];
    if (!rotatedKey) {
      return privateJson({ message: "ไม่สามารถสร้าง API Key ได้" }, 500);
    }
    keyId = rotatedKey.id;

    await recordAdminAuditEvent({
      actor: me,
      action: "API_KEY_ROTATE",
      category: "security",
      severity: "critical",
      entityType: "tenant_api_key",
      entityId: keyId,
      after: { userId: target.id, targetSiteId: target.siteId, keyRotated: true },
      details: "Generated a new API key; the key value was not written to audit storage",
      ...getAdminAuditRequestContext(request),
    });

    return privateJson({
      apiKey: toOneTimeApiKeyResponse(rotatedKey, newKey),
      success: true,
    });
  } catch {
    console.error("Error generating API key");
    return privateJson({ message: "Failed to generate API key" }, 500);
  }
}

// PATCH: Update API-key metadata without returning any key value.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const me = await requireApiKeyAdmin();
  if (!me) return privateJson({ message: "Forbidden" }, 403);

  const { userId } = await params;
  const siteId = getSiteId();

  try {
    const target = await findAuthorizedTargetUser(userId, siteId);
    if (!target) return privateJson({ message: "ไม่พบผู้ใช้" }, 404);

    const parsed = updateApiKeySchema.safeParse(await request.json());
    if (!parsed.success) {
      return privateJson({ message: "Invalid payload" }, 422);
    }

    const keyScope = buildApiKeyScope(siteId, target.id);
    const [previousRows] = await pool.execute<ApiKeyRow[]>(
      `SELECT id, api_key, site_name, is_enabled, is_site_suspended, created_at
       FROM tenant_api_keys
       WHERE ${keyScope.whereClause}
       LIMIT 1`,
      keyScope.params,
    );
    const previous = previousRows[0];
    if (!previous) return privateJson({ message: "ยังไม่มี API Key" }, 404);

    const updateFields: string[] = [];
    const updateParams: Array<string | number> = [];
    const { siteName, isEnabled, isSiteSuspended } = parsed.data;

    if (siteName !== undefined) {
      updateFields.push("site_name = ?");
      updateParams.push(siteName);
    }
    if (isEnabled !== undefined) {
      updateFields.push("is_enabled = ?");
      updateParams.push(isEnabled ? 1 : 0);
    }
    if (isSiteSuspended !== undefined) {
      updateFields.push("is_site_suspended = ?");
      updateParams.push(isSiteSuspended ? 1 : 0);
    }

    if (updateFields.length === 0) {
      return privateJson({ message: "No fields to update" }, 400);
    }

    await pool.execute(
      `UPDATE tenant_api_keys
       SET ${updateFields.join(", ")}
       WHERE id = ? AND ${keyScope.whereClause}`,
      [...updateParams, previous.id, ...keyScope.params],
    );

    await recordAdminAuditEvent({
      actor: me,
      action: "API_KEY_UPDATE",
      category: "security",
      severity: "high",
      entityType: "tenant_api_key",
      entityId: previous.id,
      before: {
        targetSiteId: target.siteId,
        siteName: previous.site_name,
        isEnabled: previous.is_enabled,
        isSiteSuspended: previous.is_site_suspended,
      },
      after: {
        targetSiteId: target.siteId,
        siteName,
        isEnabled,
        isSiteSuspended,
      },
      details: "Updated API key settings; the key value was not written to audit storage",
      ...getAdminAuditRequestContext(request),
    });

    return privateJson({ success: true });
  } catch {
    console.error("Error updating API key metadata");
    return privateJson({ message: "Failed to update API key" }, 500);
  }
}
