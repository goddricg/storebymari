import type { PublicUser } from "./user";
import { isAdminUser, isSuperAdminUser } from "./roles";

type ScopedAdminUser = Pick<PublicUser, "role" | "isAdmin">;

/** Provider metadata is visible to child Admins; global provider management is main-site SuperAdmin-only. */
export function canReadApiProviderMetadata(
  siteId: string,
  user: ScopedAdminUser | null | undefined,
): boolean {
  return Boolean(user && isAdminUser(user) && (siteId !== "main" || isSuperAdminUser(user)));
}

export function canManageGlobalApiProvider(
  siteId: string,
  user: ScopedAdminUser | null | undefined,
): boolean {
  return Boolean(user && siteId === "main" && isSuperAdminUser(user));
}

/** Provider balances are global configuration data; only main SuperAdmin may query them. */
export function canViewGlobalProviderBalance(
  siteId: string,
  user: ScopedAdminUser | null | undefined,
): boolean {
  return Boolean(user && siteId === "main" && isSuperAdminUser(user));
}

/** The gift-rule table is global in the current repository, so it is main-site-only. */
export function canManageGlobalGiftConfig(
  siteId: string,
  user: ScopedAdminUser | null | undefined,
): boolean {
  return Boolean(user && siteId === "main" && isSuperAdminUser(user));
}

/** The visible Operator/Mimi surface exists on the main site, not child sites. */
export function canUseMainSiteMimiAutopilot(
  siteId: string,
  user: ScopedAdminUser | null | undefined,
): boolean {
  return Boolean(user && siteId === "main" && isAdminUser(user));
}

const MAIN_SITE_ONLY_SETTING_PREFIXES = [
  "site_theme_",
  "ranking_",
  "mimi_",
  "discord_webhook_",
] as const;

export function isMainSiteOnlySettingKey(key: string): boolean {
  const normalizedKey = key.trim().toLowerCase();
  return MAIN_SITE_ONLY_SETTING_PREFIXES.some((prefix) => normalizedKey.startsWith(prefix));
}

/** Mirror the visible Settings boundary for both route authorization and filtered child-site responses. */
export function canAccessAdminSettings(
  siteId: string,
  user: ScopedAdminUser | null | undefined,
  key?: string,
): boolean {
  if (!isAdminUser(user)) return false;
  if (siteId === "main") return isSuperAdminUser(user);
  return key === undefined || !isMainSiteOnlySettingKey(key);
}
