import { getSiteId } from "./site";

export const MAIN_SITE_BROWSER_TITLE =
  "✨ Store By Mari ✨ แอปพรีเมียมราคาถูก | Netflix • YouTube • Spotify – Etc.";

export type SiteConfig = {
  siteId: string;
  siteName: string;
  siteUrl: string;
  isChildSite: boolean;
};

/**
 * คืนค่า config ของเว็บไซต์ปัจจุบัน (เว็บหลัก vs เว็บลูก)
 * ใช้ได้ทั้ง server และ client side
 */
export function getSiteConfig(): SiteConfig {
  const siteId = getSiteId();
  const isChildSite = siteId !== "main";

  if (isChildSite) {
    return {
      siteId,
      siteName: "Premium By Som",
      siteUrl:
        process.env.NEXT_PUBLIC_BASE_URL ||
        "https://premium-by-som.vercel.app",
      isChildSite: true,
    };
  }

  return {
    siteId,
    siteName: "App By Mari",
    siteUrl:
      process.env.NEXT_PUBLIC_BASE_URL || "https://storebymari.com",
    isChildSite: false,
  };
}
