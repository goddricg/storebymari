export const SITE_BRAND_LOGO_PATH = "/branding/storebymari-logo.png";
export const SITE_BRAND_LOGO_WIDTH = 1774;
export const SITE_BRAND_LOGO_HEIGHT = 887;
export const SITE_BRAND_LOGO_ALT = "Store by Mari logo";

// Keep browser, Apple, PWA, and notification icons on one cache-busted
// release identifier so a new Store by Mari logo is picked up consistently.
export const SITE_BRAND_ICON_VERSION = "20260916-favicon";
export const SITE_BRAND_FAVICON_PATH = `/favicon.ico?v=${SITE_BRAND_ICON_VERSION}`;
export const SITE_BRAND_ICON_PATH = `/icon.png?v=${SITE_BRAND_ICON_VERSION}`;
export const SITE_BRAND_APPLE_ICON_PATH = `/apple-touch-icon.png?v=${SITE_BRAND_ICON_VERSION}`;
export const SITE_BRAND_PWA_ICON_192_PATH = `/pwa-app-icon-192.png?v=${SITE_BRAND_ICON_VERSION}`;
export const SITE_BRAND_PWA_ICON_512_PATH = `/pwa-app-icon-512.png?v=${SITE_BRAND_ICON_VERSION}`;
export const SITE_BRAND_PWA_MASKABLE_192_PATH = `/pwa-app-icon-maskable-192.png?v=${SITE_BRAND_ICON_VERSION}`;
export const SITE_BRAND_PWA_MASKABLE_512_PATH = `/pwa-app-icon-maskable-512.png?v=${SITE_BRAND_ICON_VERSION}`;
export const SITE_BRAND_PWA_BADGE_PATH = `/badge-72x72.png?v=${SITE_BRAND_ICON_VERSION}`;

const LEGACY_SITE_BRAND_LOGO_PATH = "/branding/mari-studio-logo.png";

/** Keep an old persisted default from bringing the retired artwork back. */
export function resolveSiteBrandLogo(customLogo?: string | null): string {
  const normalized = customLogo?.trim();
  return !normalized || normalized === LEGACY_SITE_BRAND_LOGO_PATH
    ? SITE_BRAND_LOGO_PATH
    : normalized;
}
