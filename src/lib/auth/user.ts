import pool from "@/lib/mysql";
import { unstable_cache } from "next/cache";
import { count } from "drizzle-orm";
import { db, users } from "@/lib/db/drizzle";
import type { RowDataPacket } from "mysql2/promise";
import { normalizeEmail } from "@/lib/auth/password";
import { randomUUID } from "crypto";
import { getSiteId } from "@/lib/site";
import { getEffectiveUserTier, toOptionalIsoDate, type ManagedUserTier } from "@/lib/auth/tier";
import { isAdminRole } from "@/lib/auth/roles";

export type UserRole = 'user' | 'admin' | 'superadmin' | 'owner';
export type UserTier = ManagedUserTier;

export type UserRecord = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  is_admin?: boolean;
  role?: UserRole;
  is_active?: boolean;
  points?: number | null;
  user_tier?: UserTier;
  tier_expires_at?: string | null;
  is_banned?: boolean;
  total_topup_amount?: number;
  topup_count?: number;
  last_topup_at?: string;
  site_id?: string;
  created_at: string;
  updated_at: string;
};

export type PublicUser = {
  id: string;
  email: string;
  displayName: string | null;
  isAdmin?: boolean;
  role?: UserRole;
  isActive?: boolean;
  points: number;
  tier: UserTier;
  tierExpiresAt: string | null;
  isBanned: boolean;
  createdAt: string;
};

type UserDbRow = RowDataPacket & {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  is_admin: number | boolean;
  role: string | null;
  is_active: number | boolean;
  points: number | string | null;
  user_tier: string | null;
  tier_expires_at: Date | string | null;
  is_banned: number | boolean;
  total_topup_amount: number | string | null;
  topup_count: number | string | null;
  last_topup_at: Date | string | null;
  site_id: string | undefined;
  created_at: Date | string | null;
  updated_at: Date | string | null;
};

type PointsRow = RowDataPacket & { points: number | string | null };

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function toUserRecord(row: UserDbRow): UserRecord {
  const effectiveTier = getEffectiveUserTier(row.user_tier || 'walkin', row.tier_expires_at);
  return {
    id: row.id,
    email: row.email,
    password_hash: row.password_hash,
    display_name: row.display_name ?? null,
    is_admin: row.is_admin === 1 || row.is_admin === true,
    role: (row.role || 'user') as UserRole,
    is_active: row.is_active === 1 || row.is_active === true,
    points: row.points !== null ? Number(row.points) : 0,
    user_tier: effectiveTier,
    tier_expires_at: toOptionalIsoDate(row.tier_expires_at),
    is_banned: row.is_banned === 1 || row.is_banned === true,
    total_topup_amount: row.total_topup_amount !== null ? Number(row.total_topup_amount) : 0,
    topup_count: row.topup_count !== null ? Number(row.topup_count) : 0,
    last_topup_at: row.last_topup_at ? new Date(row.last_topup_at).toISOString() : undefined,
    site_id: row.site_id,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

export function toPublicUser(user: UserRecord): PublicUser {
  const role = user.role || (user.is_admin ? 'superadmin' : 'user');
  const tier = getEffectiveUserTier(user.user_tier ?? 'normal', user.tier_expires_at);

  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    isAdmin: isAdminRole(user.role) || !!user.is_admin,
    role: role as UserRole,
    isActive: user.is_active ?? true,
    points: Number(user.points ?? 0),
    tier,
    tierExpiresAt: tier === 'normal' ? null : toOptionalIsoDate(user.tier_expires_at),
    isBanned: user.is_banned === true,
    createdAt: user.created_at,
  };
}

export async function findUserByEmail(
  email: string
): Promise<UserRecord | null> {
  try {
    const normalizedEmail = normalizeEmail(email);
    const siteId = getSiteId();
    const [rows] = await pool.execute<UserDbRow[]>(
      "SELECT * FROM users WHERE email = ? AND site_id = ? LIMIT 1",
      [normalizedEmail, siteId]
    );
    if (rows.length === 0) return null;
    return toUserRecord(rows[0]);
  } catch (error: unknown) {
    throw new Error(`ไม่สามารถค้นหาผู้ใช้ได้: ${errorMessage(error, "unknown error")}`);
  }
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  try {
    const siteId = getSiteId();
    const [rows] = await pool.execute<UserDbRow[]>(
      "SELECT * FROM users WHERE id = ? AND site_id = ? LIMIT 1",
      [id, siteId]
    );
    if (rows.length === 0) return null;
    return toUserRecord(rows[0]);
  } catch (error: unknown) {
    throw new Error(`ไม่สามารถค้นหาผู้ใช้ได้: ${errorMessage(error, "unknown error")}`);
  }
}

export async function updateUserDisplayName(userId: string, displayName: string): Promise<boolean> {
  const [result] = await pool.execute(
    "UPDATE users SET display_name = ?, updated_at = ? WHERE id = ? AND site_id = ?",
    [displayName, new Date(), userId, getSiteId()]
  );

  return Number((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
}

export async function updateUserPasswordHash(userId: string, passwordHash: string): Promise<boolean> {
  const [result] = await pool.execute(
    "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ? AND site_id = ?",
    [passwordHash, new Date(), userId, getSiteId()]
  );

  return Number((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
}

export async function createUser(params: {
  email: string;
  passwordHash: string;
  displayName: string;
}): Promise<UserRecord> {
  try {
    const id = randomUUID();
    const normalizedEmail = normalizeEmail(params.email);
    const now = new Date();

    const siteId = getSiteId();
    const defaultTier = siteId === 'main' ? 'walkin' : 'normal';
    const insertParams = [
      id,
      normalizedEmail,
      params.passwordHash,
      params.displayName,
      0, // is_admin = false
      'user', // role
      1, // is_active = true
      0.00, // points
      defaultTier, // user_tier
      siteId, // site_id
      now,
      now
    ];

    await pool.execute(
      `INSERT INTO users (
        id, email, password_hash, display_name, is_admin, role, is_active, points, user_tier, site_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      insertParams
    );

    return {
      id,
      email: normalizedEmail,
      password_hash: params.passwordHash,
      display_name: params.displayName,
      is_admin: false,
      role: 'user',
      is_active: true,
      points: 0,
      user_tier: defaultTier,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
  } catch (error: unknown) {
    throw new Error(
      `ไม่สามารถสร้างผู้ใช้ใหม่ได้: ${errorMessage(error, "unknown error")}`
    );
  }
}

export const countUsers = unstable_cache(
  _countUsers,
  ["count-users"],
  { tags: ["users"], revalidate: 604800 }
);

async function _countUsers(): Promise<number> {
  try {
    const [row] = await db.select({ count: count() }).from(users);
    return Number(row?.count ?? 0);
  } catch (error: unknown) {
    console.error("Error in countUsers:", error);
    return 0;
  }
}


export async function setUserPoints(userId: string, points: number, email?: string, isAdmin?: boolean): Promise<void> {
  try {
    const sanitized = Math.max(0, Number(points ?? 0));
    const now = new Date();
    if (isAdmin && email) {
      await pool.execute(
        "UPDATE users SET points = ?, updated_at = ? WHERE email = ?",
        [sanitized, now, email]
      );
    } else {
      await pool.execute(
        "UPDATE users SET points = ?, updated_at = ? WHERE id = ?",
        [sanitized, now, userId]
      );
    }
  } catch (error: unknown) {
    throw new Error(`ไม่สามารถอัปเดตพ้อยท์ผู้ใช้ได้: ${errorMessage(error, "unknown error")}`);
  }
}

export async function adjustUserPoints(userId: string, delta: number, email?: string, isAdmin?: boolean): Promise<number> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute<PointsRow[]>(
      "SELECT points FROM users WHERE id = ? FOR UPDATE",
      [userId]
    );
    if (rows.length === 0) {
      throw new Error("ไม่พบผู้ใช้งาน");
    }

    const currentPoints = Number(rows[0].points ?? 0);
    const next = Math.max(0, Number(currentPoints + delta));
    const now = new Date();

    if (isAdmin && email) {
      await connection.execute(
        "UPDATE users SET points = ?, updated_at = ? WHERE email = ?",
        [next, now, email]
      );
    } else {
      await connection.execute(
        "UPDATE users SET points = ?, updated_at = ? WHERE id = ?",
        [next, now, userId]
      );
    }

    await connection.commit();
    return next;
  } catch (error: unknown) {
    await connection.rollback();
    throw new Error(`ไม่สามารถอัปเดตพ้อยท์ผู้ใช้ได้: ${errorMessage(error, "unknown error")}`);
  } finally {
    connection.release();
  }
}
