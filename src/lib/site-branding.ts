export const SITE_BRAND_LOGO_PATH = "/branding/storebymari-logo.png";
export const SITE_BRAND_LOGO_WIDTH = 1774;
export const SITE_BRAND_LOGO_HEIGHT = 887;
export const SITE_BRAND_LOGO_ALT = "Store by Mari logo";

export const SITE_BRAND_PWA_ICON_192_PATH = "/pwa-app-icon-192.png?v=20260916";
export const SITE_BRAND_PWA_ICON_512_PATH = "/pwa-app-icon-512.png?v=20260916";
export const SITE_BRAND_PWA_MASKABLE_192_PATH = "/pwa-app-icon-maskable-192.png?v=20260916";
export const SITE_BRAND_PWA_MASKABLE_512_PATH = "/pwa-app-icon-maskable-512.png?v=20260916";
export const SITE_BRAND_PWA_BADGE_PATH = "/badge-72x72.png?v=20260916";

const LEGACY_SITE_BRAND_LOGO_PATH = "/branding/mari-studio-logo.png";

/** Keep an old persisted default from bringing the retired artwork back. */
export function resolveSiteBrandLogo(customLogo?: string | null): string {
  const normalized = customLogo?.trim();
  return !normalized || normalized === LEGACY_SITE_BRAND_LOGO_PATH
    ? SITE_BRAND_LOGO_PATH
    : normalized;
}
