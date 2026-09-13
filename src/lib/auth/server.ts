import { redirect } from "next/navigation";

import { headers } from "next/headers";

import {
  clearAuthCookie,
  getAuthTokenFromCookies,
  verifyAuthToken,
} from "@/lib/auth/session";
import { findUserById, toPublicUser, type PublicUser } from "@/lib/auth/user";
import { isAdminUser, isSuperAdminUser } from "@/lib/auth/roles";

export async function getCurrentUser(): Promise<PublicUser | null> {
  let token = await getAuthTokenFromCookies();

  if (!token) {
    try {
      const headerStore = await headers();
      const authHeader = headerStore.get("authorization") || headerStore.get("Authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7).trim();
      }
    } catch {
      // In case headers() is invoked outside request context
    }
  }

  if (!token) {
    return null;
  }

  const payload = verifyAuthToken(token);

  if (!payload) {
    await clearAuthCookie();
    return null;
  }

  const user = await findUserById(payload.userId);

  if (!user) {
    await clearAuthCookie();
    return null;
  }

  const publicUser = toPublicUser(user);
  if (publicUser.isBanned || publicUser.isActive === false) {
    await clearAuthCookie();
    return null;
  }

  return publicUser;
}

export async function requireUser(redirectPath = "/login"): Promise<PublicUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect(redirectPath);
  }

  return user;
}

export async function requireAdmin(redirectPath = "/login"): Promise<PublicUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect(redirectPath);
  }

  // ตรวจสอบ role: superadmin หรือ admin
  if (!isAdminUser(user)) {
    redirect("/");
  }

  return user;
}

export async function requireSuperAdmin(redirectPath = "/login"): Promise<PublicUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect(redirectPath);
  }

  // ตรวจสอบ role: superadmin เท่านั้น
  if (!isSuperAdminUser(user)) {
    redirect("/");
  }

  return user;
}

