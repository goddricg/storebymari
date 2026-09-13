/**
 * Role-Based App Badging API Utility
 * Syncs unread / pending support issue counts to the device PWA app badge for Admins.
 */

export function isAppBadgeSupported(): boolean {
  return typeof window !== "undefined" && "setAppBadge" in navigator;
}

export function updateAdminAppBadge(count: number, isAdmin: boolean): void {
  if (typeof window === "undefined" || !isAdmin) return;

  if ("setAppBadge" in navigator) {
    const badgeCount = Math.max(0, Math.floor(count));
    if (badgeCount > 0) {
      navigator.setAppBadge(badgeCount).catch(() => {
        // Silently catch platform limitations or permissions
      });
    } else if ("clearAppBadge" in navigator) {
      navigator.clearAppBadge().catch(() => {});
    }
  }
}

export function updateCustomerAppBadge(resolvedCount: number): void {
  if (typeof window === "undefined") return;

  if ("setAppBadge" in navigator) {
    const badgeCount = Math.max(0, Math.floor(resolvedCount));
    if (badgeCount > 0) {
      navigator.setAppBadge(badgeCount).catch(() => {});
    } else if ("clearAppBadge" in navigator) {
      navigator.clearAppBadge().catch(() => {});
    }
  }
}

export function clearAppBadge(): void {
  if (typeof window === "undefined") return;

  if ("clearAppBadge" in navigator) {
    navigator.clearAppBadge().catch(() => {});
  }
}
