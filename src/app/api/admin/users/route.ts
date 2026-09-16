import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { RowDataPacket } from "mysql2/promise";
import pool from "@/lib/mysql";
import { getCurrentUser, requireAdmin } from "@/lib/auth/server";
import { sendAdminAuditWebhook } from "@/lib/discord/admin-audit";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";
import { normalizeEmail } from "@/lib/auth/password";
import { randomUUID } from "crypto";
import { hashPassword } from "@/lib/auth/password";
import { getSiteId } from "@/lib/site";
import { getEffectiveUserTier, toOptionalIsoDate } from "@/lib/auth/tier";
import {
  canAssignSuperAdminRole,
  isAdminRole,
  isSuperAdminRole,
  isSuperAdminManagementOperator,
} from "@/lib/auth/roles";
import {
  insertManualTopupHistory,
  shouldRecordManualTopupHistory,
} from "@/lib/topup/repository";
import {
  buildUserTargetScope,
  toAdminCreatedUser,
} from "@/lib/admin/user-scope";

const updateSchema = z.object({
  id: z.string(),
  displayName: z.string().min(1).max(64).optional(),
  isAdmin: z.boolean().optional(),
  role: z.enum(['user', 'admin', 'superadmin', 'owner']).optional(),
  isActive: z.boolean().optional(),
  points: z.number().min(0).optional(),
  pointsDelta: z.number().optional(),
  userTier: z.enum(['normal', 'vip', 'walkin']).optional(),
  user_tier: z.enum(['normal', 'vip', 'walkin']).optional(),
  tierExpiresAt: z.string().nullable().optional().refine((value) => !value || Number.isFinite(Date.parse(value)), "วันหมดอายุไม่ถูกต้อง"),
  tier_expires_at: z.string().nullable().optional().refine((value) => !value || Number.isFinite(Date.parse(value)), "วันหมดอายุไม่ถูกต้อง"),
  isBanned: z.boolean().optional(),
  is_banned: z.boolean().optional(),
  isApiEnabled: z.boolean().optional(),
});

type UserDoc = {
  id: string;
  email: string;
  display_name: string | null;
  is_admin: boolean;
  role: string;
  is_active: boolean;
  points: number;
  userTier: string;
  user_tier: string;
  tier_expires_at: string | null;
  is_banned: boolean;
  site_id: string;
  is_api_enabled: boolean;
  sites?: Array<{ site_id: string, is_api_enabled: boolean, id: string }>;
  created_at: string;
};

type UserDbRow = RowDataPacket & {
  id: string;
  email: string;
  display_name: string | null;
  is_admin: number | boolean;
  role: string | null;
  is_active: number | boolean;
  points: number | string | null;
  user_tier: string | null;
  tier_expires_at: Date | string | null;
  is_banned: number | boolean;
  site_id: string | null;
  is_api_enabled: number | boolean;
  sites?: string | Array<Record<string, unknown>> | null;
  created_at: Date | string | null;
};

type CountRow = RowDataPacket & { count: number | string };

type UserSite = NonNullable<UserDoc["sites"]>[number];

function parseUserSites(value: UserDbRow["sites"]): UserSite[] | undefined {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return undefined;
    }
  }

  if (!Array.isArray(parsed)) return undefined;

  return parsed.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const site = entry as Record<string, unknown>;
    if (typeof site.id !== "string" || typeof site.site_id !== "string") return [];
    return [{
      site_id: site.site_id,
      is_api_enabled: site.is_api_enabled === 1 || site.is_api_enabled === true,
      id: site.id,
    }];
  });
}

function toUserDoc(row: UserDbRow): UserDoc {
  const parsedSites = parseUserSites(row.sites);

  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name ?? null,
    is_admin: row.is_admin === 1 || row.is_admin === true,
    role: row.role || 'user',
    is_active: row.is_active === 1 || row.is_active === true,
    points: Number(row.points ?? 0),
    userTier: getEffectiveUserTier(row.user_tier || 'normal', row.tier_expires_at),
    user_tier: getEffectiveUserTier(row.user_tier || 'normal', row.tier_expires_at),
    tier_expires_at: toOptionalIsoDate(row.tier_expires_at),
    is_banned: row.is_banned === 1 || row.is_banned === true,
    site_id: row.site_id || 'main',
    is_api_enabled: row.is_api_enabled === 1 || row.is_api_enabled === true,
    sites: parsedSites,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const me = await getCurrentUser();
    const isAuthorized = isAdminRole(me?.role) || !!me?.isAdmin;
    if (!me || !isAuthorized) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.toLowerCase() ?? "";
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const offset = Number(url.searchParams.get("offset") ?? 0);

    const siteId = getSiteId();
    let whereClause = "site_id = ?";
    const params: string[] = [siteId];

    if (siteId === 'main') {
      whereClause = "1=1";
      params.pop();
    }

    if (q) {
      whereClause += " AND (email LIKE ? OR display_name LIKE ?)";
      params.push(`%${q.trim()}%`, `%${q.trim()}%`);
    }

    let countQuery = `SELECT COUNT(*) as count FROM users WHERE ${whereClause}`;
    let dataQuery = `SELECT * FROM users WHERE ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`;

    if (siteId === 'main') {
      countQuery = `SELECT COUNT(DISTINCT CASE WHEN role IN ('admin', 'superadmin', 'owner') OR is_admin = 1 THEN email ELSE id END) as count FROM users WHERE ${whereClause}`;
      dataQuery = `
        SELECT 
          MIN(id) as id,
          email,
          MAX(display_name) as display_name,
          MAX(is_admin) as is_admin,
          MAX(role) as role,
          MAX(is_active) as is_active,
          MAX(points) as points,
          MAX(user_tier) as user_tier,
          MAX(tier_expires_at) as tier_expires_at,
          MAX(is_banned) as is_banned,
          GROUP_CONCAT(site_id SEPARATOR ', ') as site_id,
          JSON_ARRAYAGG(JSON_OBJECT('site_id', site_id, 'is_api_enabled', is_api_enabled, 'id', id)) as sites,
          MAX(is_api_enabled) as is_api_enabled,
          MIN(created_at) as created_at
        FROM users 
        WHERE ${whereClause}
        GROUP BY email, CASE WHEN role IN ('admin', 'superadmin', 'owner') OR is_admin = 1 THEN 1 ELSE id END
        ORDER BY MAX(created_at) DESC LIMIT ? OFFSET ?
      `;
    }

    // Get total count
    const [countRows] = await pool.execute<CountRow[]>(countQuery, params);
    const total = Number(countRows[0]?.count ?? 0);

    // Get paginated users
    const selectParams = [...params, String(limit), String(offset)];
    const [rows] = await pool.execute<UserDbRow[]>(dataQuery, selectParams);

    const users = rows.map(toUserDoc);

    return NextResponse.json({ 
      users,
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "ไม่สามารถโหลดรายชื่อผู้ใช้ได้" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const me = await requireAdmin();
    const isSuperAdminOperator = isSuperAdminManagementOperator(me);

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: "Invalid payload" }, { status: 422 });
    }

    const {
      id,
      displayName,
      isAdmin,
      role,
      isActive,
      points,
      pointsDelta,
      userTier,
      user_tier,
      tierExpiresAt,
      tier_expires_at,
      isBanned,
      is_banned,
      isApiEnabled,
    } = parsed.data;

    // ตรวจสอบเบื้องต้น: ห้ามพนักงาน (admin) ตั้ง Super Admin หรือ Owner
    if (!isSuperAdminOperator) {
      if (role !== undefined && isSuperAdminRole(role)) {
        return NextResponse.json({ message: "พนักงานไม่สามารถตั้งซูเปอร์แอดมินหรือ Owner ได้" }, { status: 403 });
      }
    }
    
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const siteId = getSiteId();
      const targetScope = buildUserTargetScope(siteId, id);
      const selectQuery = `SELECT * FROM users WHERE ${targetScope.whereClause} LIMIT 1 FOR UPDATE`;
      const selectParams = targetScope.params;
      const [existingRows] = await connection.execute(selectQuery, selectParams);
      const list = existingRows as UserDbRow[];
      if (list.length === 0) {
        await connection.rollback();
        return NextResponse.json({ message: "ไม่พบผู้ใช้" }, { status: 404 });
      }

      const currentUser = list[0];

      // อนุญาตบัญชีหลัก หรือ Owner ใน Local Demo ตามนโยบายแยกสภาพแวดล้อม
      const targetRole = role !== undefined ? role : currentUser.role;
      const targetIsAdmin = isAdmin !== undefined ? isAdmin : currentUser.is_admin;
      if (isSuperAdminRole(targetRole) || (targetIsAdmin && !targetRole)) {
        if (!canAssignSuperAdminRole(currentUser.email)) {
          await connection.rollback();
          return NextResponse.json({ message: "บัญชีนี้ไม่ได้อยู่ใน PRIMARY_SUPER_ADMIN_EMAIL จึงตั้งเป็น Super Admin/Owner ไม่ได้" }, { status: 403 });
        }
      }

      // ห้ามพนักงาน (admin) แก้ไขข้อมูลผู้ดูแลระบบท่านอื่น (admin, superadmin หรือ owner)
      if (!isSuperAdminOperator) {
        const isTargetAdmin = isAdminRole(currentUser.role) || currentUser.is_admin === 1 || currentUser.is_admin === true;
        if (isTargetAdmin) {
          await connection.rollback();
          return NextResponse.json({ message: "พนักงานไม่สามารถแก้ไขข้อมูลของผู้ดูแลระบบท่านอื่นได้" }, { status: 403 });
        }
      }
      const finalDisplayName = displayName !== undefined ? displayName : currentUser.display_name;
      const finalIsActive = isActive !== undefined ? (isActive ? 1 : 0) : currentUser.is_active;
      const incomingUserTier = userTier !== undefined ? userTier : user_tier;
      const finalUserTier = incomingUserTier !== undefined ? incomingUserTier : currentUser.user_tier;
      const incomingTierExpiry = tierExpiresAt !== undefined ? tierExpiresAt : tier_expires_at;
      const finalTierExpiresAt = finalUserTier === 'normal'
        ? null
        : incomingTierExpiry !== undefined
          ? (incomingTierExpiry ? new Date(incomingTierExpiry) : null)
          : (currentUser.tier_expires_at ?? null);
      const incomingBanStatus = isBanned !== undefined ? isBanned : is_banned;
      const finalIsBanned = incomingBanStatus !== undefined
        ? (incomingBanStatus ? 1 : 0)
        : (currentUser.is_banned === 1 || currentUser.is_banned === true ? 1 : 0);
      const finalIsApiEnabled = isApiEnabled !== undefined ? (isApiEnabled ? 1 : 0) : (currentUser.is_api_enabled !== undefined ? currentUser.is_api_enabled : 1);

      let finalRole = currentUser.role || 'user';
      let finalIsAdmin = currentUser.is_admin === 1 || currentUser.is_admin === true ? 1 : 0;

      if (role !== undefined) {
        finalRole = role;
        finalIsAdmin = isAdminRole(role) ? 1 : 0;
      } else if (isAdmin !== undefined) {
        finalIsAdmin = isAdmin ? 1 : 0;
        if (isAdmin && !currentUser.role) {
          finalRole = 'superadmin';
        } else if (!isAdmin && isSuperAdminRole(currentUser.role)) {
          finalRole = 'user';
        }
      }

      // ห้ามพนักงานตั้งใครเป็น Super Admin หรือ Owner
      if (!isSuperAdminOperator && (isSuperAdminRole(finalRole) || (finalIsAdmin === 1 && finalRole !== 'admin'))) {
        await connection.rollback();
        return NextResponse.json({ message: "พนักงานไม่สามารถตั้งซูเปอร์แอดมินหรือ Owner ได้" }, { status: 403 });
      }

      let targetPoints = points !== undefined ? points : undefined;
      if (targetPoints === undefined) {
        const existingPoints = Number(currentUser.points ?? 0);
        targetPoints = existingPoints + (pointsDelta ?? 0);
      }
      const finalPoints = Math.max(0, Number(targetPoints ?? 0));
      const now = new Date();

      const isEditingAdmin = isAdminRole(finalRole) || finalIsAdmin === 1;

      // Keep points/history attached to the exact locked target row. In the
      // central main view an email may represent several site rows; do not
      // fan a mutation out by email.
      const manualTopupTargets: Array<{ id: string; site_id: string; points: number }> = [{
        id: currentUser.id,
        site_id: currentUser.site_id || siteId,
        points: Number(currentUser.points ?? 0),
      }];

      if (isEditingAdmin && currentUser.email) {
        await connection.execute(
          `UPDATE users 
           SET display_name = ?, is_admin = ?, role = ?, is_active = ?, points = ?, user_tier = ?, tier_expires_at = ?, is_banned = ?, is_api_enabled = ?, updated_at = ?
           WHERE ${targetScope.whereClause}`,
          [
            finalDisplayName,
            finalIsAdmin,
            finalRole,
            finalIsActive,
            finalPoints,
            finalUserTier,
            finalTierExpiresAt,
            finalIsBanned,
            finalIsApiEnabled,
            now,
            ...targetScope.params,
          ]
        );
      } else {
        await connection.execute(
          `UPDATE users 
           SET display_name = ?, is_admin = ?, role = ?, is_active = ?, points = ?, user_tier = ?, tier_expires_at = ?, is_banned = ?, is_api_enabled = ?, updated_at = ?
           WHERE ${targetScope.whereClause}`,
          [
            finalDisplayName,
            finalIsAdmin,
            finalRole,
            finalIsActive,
            finalPoints,
            finalUserTier,
            finalTierExpiresAt,
            finalIsBanned,
            finalIsApiEnabled,
            now,
            ...targetScope.params,
          ]
        );
      }

      if (shouldRecordManualTopupHistory(isEditingAdmin)) {
        for (const target of manualTopupTargets) {
          const creditedAmount = finalPoints - target.points;
          if (Number.isFinite(creditedAmount) && creditedAmount > 0) {
            await connection.execute(
              `UPDATE users
               SET total_topup_amount = COALESCE(total_topup_amount, 0) + ?,
                   topup_count = COALESCE(topup_count, 0) + 1,
                   last_topup_at = ?,
                   updated_at = ?
               WHERE id = ? AND site_id = ?`,
              [creditedAmount, now, now, target.id, target.site_id]
            );
            await insertManualTopupHistory(connection, {
              userId: target.id,
              siteId: target.site_id,
              amount: creditedAmount,
              createdAt: now,
              sourceUserId: me.id,
              sourceLabel: me.displayName,
              sourceEmail: me.email,
              note: "พ้อยท์ถูกเติมเงินสำเร็จผ่าน Admin",
            });
          }
        }
      }

      await connection.commit();

      // Send audit webhook
      const changes: Record<string, { old: string | number | null; new: string | number | null }> = {};
      if (displayName !== undefined) {
        changes["display_name"] = { old: currentUser.display_name, new: displayName };
      }
      if (isAdmin !== undefined) {
        changes["is_admin"] = { old: String(currentUser.is_admin === 1), new: String(isAdmin) };
      }
      if (role !== undefined) {
        changes["role"] = { old: currentUser.role || 'user', new: role };
      }
      if (isActive !== undefined) {
        changes["is_active"] = { old: String(currentUser.is_active === 1), new: String(isActive) };
      }
      if (userTier !== undefined) {
        changes["user_tier"] = { old: currentUser.user_tier || 'normal', new: userTier };
      }
      if (tierExpiresAt !== undefined || tier_expires_at !== undefined) {
        changes["tier_expires_at"] = {
          old: currentUser.tier_expires_at ? new Date(currentUser.tier_expires_at).toISOString() : null,
          new: finalTierExpiresAt ? new Date(finalTierExpiresAt).toISOString() : null,
        };
      }
      if (isBanned !== undefined || is_banned !== undefined) {
        changes["is_banned"] = {
          old: currentUser.is_banned === 1 || currentUser.is_banned === true ? 1 : 0,
          new: finalIsBanned,
        };
      }
      if (points !== undefined || pointsDelta !== undefined) {
        changes["points"] = { old: Number(currentUser.points ?? 0), new: finalPoints };
      }
      if (isApiEnabled !== undefined) {
        changes["is_api_enabled"] = { old: String(currentUser.is_api_enabled === 1), new: String(isApiEnabled) };
      }

      await recordAdminAuditEvent({
        actor: me,
        action: "USER_UPDATE",
        category: ["points", "pointsDelta"].some((key) => Object.prototype.hasOwnProperty.call(parsed.data, key))
          ? "finance"
          : "users",
        severity: role === "owner" || role === "superadmin" || points !== undefined || pointsDelta !== undefined
          ? "critical"
          : role !== undefined || isAdmin !== undefined
          ? "high"
          : "medium",
        entityType: "user",
        entityId: id,
        entityLabel: currentUser.email,
        before: {
          email: currentUser.email,
          displayName: currentUser.display_name,
          role: currentUser.role || "user",
          isAdmin: currentUser.is_admin === 1 || currentUser.is_admin === true,
          isActive: currentUser.is_active === 1 || currentUser.is_active === true,
          points: Number(currentUser.points ?? 0),
          userTier: currentUser.user_tier || "normal",
          isBanned: currentUser.is_banned === 1 || currentUser.is_banned === true,
        },
        after: {
          email: currentUser.email,
          displayName: finalDisplayName,
          role: finalRole,
          isAdmin: finalIsAdmin === 1,
          isActive: finalIsActive === 1,
          points: finalPoints,
          userTier: finalUserTier,
          isBanned: finalIsBanned === 1,
          manualPointsDelta: finalPoints - Number(currentUser.points ?? 0),
        },
        changes,
        details: "Updated a user without storing password or token data",
        ...getAdminAuditRequestContext(request),
      });

      await sendAdminAuditWebhook({
        action: "อัปเดตผู้ใช้",
        target: `User ID: ${id}${currentUser.email ? ` (${currentUser.email})` : ""}`,
        changes: Object.keys(changes).length > 0 ? changes : undefined,
      });

      return NextResponse.json({ success: true });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (error: unknown) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "ไม่สามารถอัปเดตผู้ใช้ได้" },
      { status: 500 }
    );
  }
}

const createUserSchema = z.object({
  email: z.string().email("รูปแบบอีเมลไม่ถูกต้อง"),
  password: z.string().min(8, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"),
  displayName: z.string().min(1, "กรุณากรอกชื่อแสดง").max(64, "ชื่อแสดงต้องไม่ยาวเกิน 64 ตัวอักษร"),
  role: z.enum(['user', 'admin', 'superadmin', 'owner']).optional().default('user'),
  userTier: z.enum(['normal', 'vip', 'walkin']).optional().default('normal'),
  points: z.number().min(0).optional().default(0),
  isActive: z.boolean().optional().default(true),
});

export async function POST(request: Request) {
  try {
    const me = await requireAdmin();
    const isSuperAdminOperator = isSuperAdminManagementOperator(me);

    const body = await request.json();
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          message: "ข้อมูลไม่ถูกต้อง",
          issues: parsed.error.flatten().fieldErrors,
        },
        { status: 422 }
      );
    }

    const { email, password, displayName, role, userTier, points, isActive } = parsed.data;

    // ตรวจสอบ: ห้ามพนักงาน (admin) สร้าง Super Admin หรือ Owner
    if (!isSuperAdminOperator && isSuperAdminRole(role)) {
      return NextResponse.json({ message: "พนักงานไม่สามารถสร้างซูเปอร์แอดมินหรือ Owner ได้" }, { status: 403 });
    }

    // อนุญาตบัญชีหลัก หรือ Owner ใน Local Demo ตามนโยบายแยกสภาพแวดล้อม
    if (isSuperAdminRole(role) && !canAssignSuperAdminRole(email)) {
      return NextResponse.json({ message: "บัญชีนี้ไม่ได้อยู่ใน PRIMARY_SUPER_ADMIN_EMAIL จึงตั้งเป็น Super Admin/Owner ไม่ได้" }, { status: 403 });
    }

    const siteId = getSiteId();
    const normalizedEmail = normalizeEmail(email);

    const [existingRows] = await pool.execute(
      "SELECT 1 FROM users WHERE email = ? AND site_id = ? LIMIT 1",
      [normalizedEmail, siteId]
    );
    const existingList = existingRows as Array<{ id: string }>;
    if (existingList.length > 0) {
      return NextResponse.json(
        { message: "อีเมลนี้ถูกใช้งานแล้ว" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const id = randomUUID();
    const now = new Date();

    const record = {
      id,
      email: normalizedEmail,
      password_hash: passwordHash,
      display_name: displayName,
      role: role,
      is_admin: isAdminRole(role) ? 1 : 0,
      user_tier: userTier,
      points: points,
      is_active: isActive ? 1 : 0,
      created_at: now,
      updated_at: now,
    };

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `INSERT INTO users (
          id, email, password_hash, display_name, role, is_admin, user_tier, points, is_active, site_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.email,
          record.password_hash,
          record.display_name,
          record.role,
          record.is_admin,
          record.user_tier,
          record.points,
          record.is_active,
          siteId,
          record.created_at,
          record.updated_at
        ]
      );

      if (record.points > 0 && shouldRecordManualTopupHistory(record.is_admin === 1)) {
        await connection.execute(
          `UPDATE users
           SET total_topup_amount = ?, topup_count = 1, last_topup_at = ?, updated_at = ?
           WHERE id = ? AND site_id = ?`,
          [record.points, now, now, record.id, siteId]
        );
        await insertManualTopupHistory(connection, {
          userId: record.id,
          siteId,
          amount: record.points,
          createdAt: now,
          sourceUserId: me.id,
          sourceLabel: me.displayName,
          sourceEmail: me.email,
          note: "พ้อยท์ถูกเติมเงินสำเร็จผ่าน Admin",
        });
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    await recordAdminAuditEvent({
      actor: me,
      action: "USER_CREATE",
      category: isAdminRole(role) ? "security" : "users",
      severity: role === "owner" || role === "superadmin" ? "critical" : role === "admin" ? "high" : "medium",
      entityType: "user",
      entityId: record.id,
      entityLabel: record.email,
      after: {
        email: record.email,
        displayName: record.display_name,
        role: record.role,
        userTier: record.user_tier,
        points: record.points,
        isActive: record.is_active === 1,
      },
      details: "Created a user without storing password or token data",
      ...getAdminAuditRequestContext(request),
    });

    await sendAdminAuditWebhook({
      action: "สร้างผู้ใช้ใหม่",
      target: `User ID: ${record.id} (${record.email})`,
      details: `สร้างผู้ใช้ใหม่: ${record.email} (${displayName}) - Role: ${role}, Tier: ${userTier}`,
    });

    return NextResponse.json({ user: toAdminCreatedUser(record, siteId), success: true }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "ไม่สามารถสร้างผู้ใช้ได้" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const me = await requireAdmin();
    const isSuperAdminOperator = isSuperAdminManagementOperator(me);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ message: "กรุณาระบุ ID ของผู้ใช้" }, { status: 422 });
    }

    const siteId = getSiteId();
    const targetScope = buildUserTargetScope(siteId, id);
    const [existingRows] = await pool.execute(
      `SELECT * FROM users WHERE ${targetScope.whereClause} LIMIT 1`,
      targetScope.params,
    );
    const list = existingRows as UserDbRow[];
    if (list.length === 0) {
      return NextResponse.json({ message: "ไม่พบผู้ใช้" }, { status: 404 });
    }

    const user = list[0];

    // ห้ามพนักงาน (admin) ลบผู้ดูแลระบบคนอื่น (admin, superadmin หรือ owner)
    if (!isSuperAdminOperator) {
      const isTargetAdmin = isAdminRole(user.role) || user.is_admin === 1 || user.is_admin === true;
      if (isTargetAdmin) {
        return NextResponse.json({ message: "พนักงานไม่สามารถลบผู้ดูแลระบบได้" }, { status: 403 });
      }
    }

    if (me?.id === id) {
      return NextResponse.json({ message: "ไม่สามารถลบบัญชีของตัวเองได้" }, { status: 400 });
    }

    await pool.execute(`DELETE FROM users WHERE ${targetScope.whereClause}`, targetScope.params);

    await recordAdminAuditEvent({
      actor: me,
      action: "USER_DELETE",
      category: "security",
      severity: "critical",
      entityType: "user",
      entityId: id,
      entityLabel: user.email,
      before: {
        email: user.email,
        displayName: user.display_name,
        role: user.role || "user",
        isAdmin: user.is_admin === 1 || user.is_admin === true,
        points: Number(user.points ?? 0),
        isActive: user.is_active === 1 || user.is_active === true,
      },
      details: "Deleted a user without storing password or token data",
      ...getAdminAuditRequestContext(request),
    });

    await sendAdminAuditWebhook({
      action: "ลบผู้ใช้",
      target: `User ID: ${id} (${user.email})`,
      details: `ลบผู้ใช้ "${user.email}" (${user.display_name || 'ไม่มีชื่อ'}) สำเร็จ`,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "ไม่สามารถลบผู้ใช้ได้" },
      { status: 500 }
    );
  }
}
