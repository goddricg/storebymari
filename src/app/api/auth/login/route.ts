import { NextResponse } from "next/server";
import { z } from "zod";

import { findUserByEmail, toPublicUser, type UserRecord } from "@/lib/auth/user";
import { normalizeEmail, verifyPassword } from "@/lib/auth/password";
import { setAuthCookie, signAuthToken } from "@/lib/auth/session";
import { isAdminUser } from "@/lib/auth/roles";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";
import {
  consumeRequestRateLimit,
  rateLimitResponse,
} from "@/lib/security/rate-limit";

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "กรุณากรอกอีเมล")
    .email("รูปแบบอีเมลไม่ถูกต้อง"),
  password: z.string().min(1, "กรุณากรอกรหัสผ่าน"),
});

export async function POST(request: Request) {
  const networkRateLimit = consumeRequestRateLimit(request, {
    scope: "auth:login:network",
    limit: 60,
    windowMs: 10 * 60 * 1000,
  });
  if (!networkRateLimit.allowed) {
    return rateLimitResponse(undefined, networkRateLimit);
  }

  const body = await request.json();

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "ข้อมูลไม่ถูกต้อง",
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 422 }
    );
  }

  const email = normalizeEmail(parsed.data.email);
  const accountRateLimit = consumeRequestRateLimit(request, {
    scope: "auth:login:account",
    subject: email,
    limit: 12,
    windowMs: 10 * 60 * 1000,
  });
  if (!accountRateLimit.allowed) {
    return rateLimitResponse(
      "มีการเข้าสู่ระบบของบัญชีนี้บ่อยเกินไป กรุณาลองใหม่ภายหลัง",
      accountRateLimit,
    );
  }

  let user: UserRecord | null;
  try {
    user = await findUserByEmail(email);
  } catch {
    return NextResponse.json(
      { message: "ระบบตรวจสอบบัญชีไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง" },
      { status: 503 },
    );
  }

  if (!user) {
    return NextResponse.json(
      { message: "ไม่พบบัญชีผู้ใช้" },
      { status: 401 }
    );
  }

  const isValid = await verifyPassword(parsed.data.password, user.password_hash);

  if (!isValid) {
    const failedUser = toPublicUser(user);
    if (isAdminUser(failedUser)) {
      await recordAdminAuditEvent({
        actor: failedUser,
        action: "AUTH_LOGIN_FAILED",
        category: "security",
        severity: "high",
        entityType: "admin_session",
        entityId: failedUser.id,
        entityLabel: failedUser.email,
        result: "failed",
        reasonCode: "INVALID_PASSWORD",
        details: "Failed login attempt for an administrative account",
        ...getAdminAuditRequestContext(request),
      });
    }
    return NextResponse.json(
      { message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" },
      { status: 401 }
    );
  }

  if (user.is_banned) {
    const blockedUser = toPublicUser(user);
    if (isAdminUser(blockedUser)) {
      await recordAdminAuditEvent({
        actor: blockedUser,
        action: "AUTH_LOGIN_DENIED",
        category: "security",
        severity: "critical",
        entityType: "admin_session",
        entityId: blockedUser.id,
        entityLabel: blockedUser.email,
        result: "denied",
        reasonCode: "BANNED",
        details: "Login denied because the administrative account is banned",
        ...getAdminAuditRequestContext(request),
      });
    }
    return NextResponse.json(
      { message: "บัญชีนี้ถูกแบน ไม่สามารถเข้าสู่ระบบได้" },
      { status: 403 }
    );
  }

  if (user.is_active === false) {
    const blockedUser = toPublicUser(user);
    if (isAdminUser(blockedUser)) {
      await recordAdminAuditEvent({
        actor: blockedUser,
        action: "AUTH_LOGIN_DENIED",
        category: "security",
        severity: "high",
        entityType: "admin_session",
        entityId: blockedUser.id,
        entityLabel: blockedUser.email,
        result: "denied",
        reasonCode: "INACTIVE",
        details: "Login denied because the administrative account is inactive",
        ...getAdminAuditRequestContext(request),
      });
    }
    return NextResponse.json(
      { message: "บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ" },
      { status: 403 }
    );
  }

  const publicUser = toPublicUser(user);
  const token = signAuthToken({
    userId: publicUser.id,
    email: publicUser.email,
    displayName: publicUser.displayName,
  });

  await setAuthCookie(token);

  if (isAdminUser(publicUser)) {
    await recordAdminAuditEvent({
      actor: publicUser,
      action: "AUTH_LOGIN_SUCCESS",
      category: "security",
      severity: "low",
      entityType: "admin_session",
      entityId: publicUser.id,
      entityLabel: publicUser.email,
      details: "Administrative login succeeded",
      ...getAdminAuditRequestContext(request),
    });
  }

  return NextResponse.json({ user: publicUser, token });
}

