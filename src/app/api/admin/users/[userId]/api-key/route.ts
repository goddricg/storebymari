import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/mysql";
import { getCurrentUser } from "@/lib/auth/server";
import { randomBytes } from "crypto";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";

// GET: Fetch current API Key for user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const me = await getCurrentUser();
  const isAdmin = me?.role === 'superadmin' || me?.role === 'admin' || me?.isAdmin;
  if (!me || !isAdmin) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { userId } = await params;

  try {
    const [rows] = await pool.execute(
      "SELECT id, api_key, site_name, is_enabled, is_site_suspended, created_at FROM tenant_api_keys WHERE user_id = ? LIMIT 1",
      [userId]
    );
    const keys = rows as any[];
    
    if (keys.length === 0) {
      await recordAdminAuditEvent({
        actor: me,
        action: "API_KEY_VIEW",
        category: "security",
        severity: "medium",
        entityType: "tenant_api_key",
        entityId: userId,
        details: "Viewed API key metadata; the key value was not written to audit storage",
        ...getAdminAuditRequestContext(request),
      });
      return NextResponse.json({ apiKey: null });
    }

    await recordAdminAuditEvent({
      actor: me,
      action: "API_KEY_VIEW",
      category: "security",
      severity: "high",
      entityType: "tenant_api_key",
      entityId: String(keys[0].id),
      after: {
        siteName: keys[0].site_name,
        isEnabled: keys[0].is_enabled,
        isSiteSuspended: keys[0].is_site_suspended,
      },
      details: "Viewed API key metadata; the key value was not written to audit storage",
      ...getAdminAuditRequestContext(request),
    });

    return NextResponse.json({ apiKey: keys[0] });
  } catch (error) {
    console.error("Error fetching api key:", error);
    return NextResponse.json({ message: "Failed to fetch API key" }, { status: 500 });
  }
}

// POST: Generate a new API Key
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const me = await getCurrentUser();
  const isAdmin = me?.role === 'superadmin' || me?.role === 'admin' || me?.isAdmin;
  if (!me || !isAdmin) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { userId } = await params;
  // Generate random key (e.g. sk_live_abc123)
  const newKey = `sk_live_${randomBytes(24).toString('hex')}`;
  const id = crypto.randomUUID();

  try {
    // Check if exists
    const [rows] = await pool.execute(
      "SELECT id FROM tenant_api_keys WHERE user_id = ? LIMIT 1",
      [userId]
    );
    const keys = rows as any[];

    if (keys.length > 0) {
      // Update
      await pool.execute(
        "UPDATE tenant_api_keys SET api_key = ? WHERE user_id = ?",
        [newKey, userId]
      );
    } else {
      // Insert
      await pool.execute(
        "INSERT INTO tenant_api_keys (id, user_id, api_key, is_enabled) VALUES (?, ?, ?, 1)",
        [id, userId, newKey]
      );
    }

    const [newRows] = await pool.execute(
      "SELECT id, api_key, site_name, is_enabled, is_site_suspended, created_at FROM tenant_api_keys WHERE user_id = ? LIMIT 1",
      [userId]
    );

    await recordAdminAuditEvent({
      actor: me,
      action: "API_KEY_ROTATE",
      category: "security",
      severity: "critical",
      entityType: "tenant_api_key",
      entityId: String((newRows as any[])[0]?.id ?? userId),
      after: { userId, keyRotated: true },
      details: "Generated a new API key; the key value was not written to audit storage",
      ...getAdminAuditRequestContext(request),
    });
    
    return NextResponse.json({ apiKey: (newRows as any[])[0] });
  } catch (error) {
    console.error("Error generating api key:", error);
    return NextResponse.json({ message: "Failed to generate API key" }, { status: 500 });
  }
}

// PATCH: Update site_name or is_enabled
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const me = await getCurrentUser();
  const isAdmin = me?.role === 'superadmin' || me?.role === 'admin' || me?.isAdmin;
  if (!me || !isAdmin) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { userId } = await params;

  try {
    const body = await request.json();
    const { siteName, isEnabled, isSiteSuspended } = body;

    const updateFields = [];
    const params = [];

    if (siteName !== undefined) {
      updateFields.push("site_name = ?");
      params.push(siteName);
    }
    if (isEnabled !== undefined) {
      updateFields.push("is_enabled = ?");
      params.push(isEnabled ? 1 : 0);
    }
    if (isSiteSuspended !== undefined) {
      updateFields.push("is_site_suspended = ?");
      params.push(isSiteSuspended ? 1 : 0);
    }

    if (updateFields.length === 0) {
      return NextResponse.json({ message: "No fields to update" }, { status: 400 });
    }

    const [previousRows] = await pool.execute(
      "SELECT id, site_name, is_enabled, is_site_suspended FROM tenant_api_keys WHERE user_id = ? LIMIT 1",
      [userId]
    );

    params.push(userId);
    const query = `UPDATE tenant_api_keys SET ${updateFields.join(', ')} WHERE user_id = ?`;
    
    await pool.execute(query, params);

    const [rows] = await pool.execute(
      "SELECT id, api_key, site_name, is_enabled, is_site_suspended, created_at FROM tenant_api_keys WHERE user_id = ? LIMIT 1",
      [userId]
    );

    await recordAdminAuditEvent({
      actor: me,
      action: "API_KEY_UPDATE",
      category: "security",
      severity: "high",
      entityType: "tenant_api_key",
      entityId: String((rows as any[])[0]?.id ?? userId),
      before: (previousRows as any[])[0]
        ? {
            siteName: (previousRows as any[])[0].site_name,
            isEnabled: (previousRows as any[])[0].is_enabled,
            isSiteSuspended: (previousRows as any[])[0].is_site_suspended,
          }
        : null,
      after: {
        siteName,
        isEnabled,
        isSiteSuspended,
      },
      details: "Updated API key settings; the key value was not written to audit storage",
      ...getAdminAuditRequestContext(request),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating api key:", error);
    return NextResponse.json({ message: "Failed to update API key" }, { status: 500 });
  }
}
