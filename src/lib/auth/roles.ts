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

  return isLocalDemoAuthEnabled(env) && user?.role === "superadmin";
}

/** Allow Super Admin targets only for the existing owner or the local demo. */
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
  return user?.role === "superadmin" || (user?.isAdmin === true && !user?.role);
}

export function isAdminUser(
  user: Pick<PublicUser, "role" | "isAdmin"> | null | undefined,
): boolean {
  return user?.role === "superadmin" || user?.role === "admin" || user?.isAdmin === true;
}

export function canViewAdminReports(
  siteId: string,
  user: Pick<PublicUser, "role" | "isAdmin"> | null | undefined,
): boolean {
  return siteId === "main" ? isSuperAdminUser(user) : isAdminUser(user);
}
