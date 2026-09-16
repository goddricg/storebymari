import type { PublicUser } from "./user";

type AuthEnvironment = {
  NODE_ENV?: string;
  DB_HOST?: string;
  DB_PORT?: string;
  DB_NAME?: string;
  PRIMARY_SUPER_ADMIN_EMAIL?: string;
};

export function configuredPrimarySuperAdminEmail(env: AuthEnvironment = process.env): string | null {
  const email = env.PRIMARY_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  return email || null;
}

/** Owner is the named top-level account role; superadmin remains supported for compatibility. */
export function isSuperAdminRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "superadmin";
}

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin" || isSuperAdminRole(role);
}

/** Enable the demo Owner policy only for the dedicated loopback database. */
export function isLocalDemoAuthEnabled(
  env: AuthEnvironment = process.env,
): boolean {
  return (
    env.NODE_ENV === "development" &&
    env.DB_HOST === "127.0.0.1" &&
    env.DB_PORT === "3307" &&
    env.DB_NAME === "storebymari_demo"
  );
}

/** Keep the production allowlist and grant local Owner management by role. */
export function isSuperAdminManagementOperator(
  user: Pick<PublicUser, "email" | "role"> | null | undefined,
  env: AuthEnvironment = process.env,
): boolean {
  if (user?.email?.trim().toLowerCase() === configuredPrimarySuperAdminEmail(env)) {
    return true;
  }

  return isLocalDemoAuthEnabled(env) && isSuperAdminRole(user?.role);
}

/** Allow privileged role targets only for the configured primary account or local demo. */
export function canAssignSuperAdminRole(
  email: string | null | undefined,
  env: AuthEnvironment = process.env,
): boolean {
  if (email?.trim().toLowerCase() === configuredPrimarySuperAdminEmail(env)) {
    return true;
  }

  return isLocalDemoAuthEnabled(env);
}

/**
 * Keep the legacy is_admin-only record compatible with the existing
 * superadmin model while rejecting ordinary admin users.
 */
export function isSuperAdminUser(
  user: Pick<PublicUser, "role" | "isAdmin"> | null | undefined,
): boolean {
  return isSuperAdminRole(user?.role) || (user?.isAdmin === true && !user?.role);
}

export function isAdminUser(
  user: Pick<PublicUser, "role" | "isAdmin"> | null | undefined,
): boolean {
  return isAdminRole(user?.role) || user?.isAdmin === true;
}

export function canViewAdminReports(
  siteId: string,
  user: Pick<PublicUser, "role" | "isAdmin"> | null | undefined,
): boolean {
  return siteId === "main" ? isSuperAdminUser(user) : isAdminUser(user);
}

/** Provider balances are global configuration data; only main SuperAdmin may query them. */
