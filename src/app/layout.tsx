import type { Metadata, Viewport } from "next";
import { Mali, Noto_Sans_Thai } from "next/font/google";
import { Toaster } from "sonner";
import NavigationBar from "@/components/navigation-bar";
import BottomNavigation from "@/components/bottom-navigation";
import AdminContactIcon from "@/components/admin-contact-icon";
import { PublicSettingsProvider } from "@/components/public-settings-provider";
import { ProductStockRealtimeProvider } from "@/components/products/product-stock-realtime-provider";
import { CartProvider } from "@/components/cart/cart-provider";
import SiteAnalyticsTracker from "@/components/site-analytics-tracker";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { loadLayoutPublicSettings } from "@/lib/settings/load-layout-public-settings";
import {
  getThemeCssVariables,
  normalizeThemeMode,
  normalizeThemePack,
  resolveThemeMode,
} from "@/lib/theme/catalog";
import { OrganizationJsonLd, WebSiteJsonLd, FAQJsonLd, ItemListJsonLd } from "@/components/seo/json-ld";
import { MAIN_SITE_BROWSER_TITLE, getSiteConfig } from "@/lib/site-config";
import {
  resolveSiteBrandLogo,
  SITE_BRAND_LOGO_ALT,
  SITE_BRAND_LOGO_HEIGHT,
  SITE_BRAND_LOGO_WIDTH,
  SITE_BRAND_PWA_ICON_192_PATH,
  SITE_BRAND_PWA_ICON_512_PATH,
} from "@/lib/site-branding";
import { PwaInstallProvider } from "@/components/pwa/pwa-install-provider";
import { PwaNotificationPermissionGate } from "@/components/pwa/pwa-notification-permission-gate";
import { PushAutoSync } from "@/components/push/push-auto-sync";
import { MimiNotificationPrompt } from "@/components/push/mimi-notification-prompt";
import { PwaAppLoadingScreen } from "@/components/pwa/pwa-app-loading-screen";
import { PopupAnnouncementModal } from "@/components/popup-announcement-modal";
import "./globals.css";

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-noto-sans-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

const mali = Mali({
  variable: "--font-mali",
  subsets: ["thai", "latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const { siteName: defaultSiteName, siteUrl, isChildSite } = getSiteConfig();
  const publicSettings = await loadLayoutPublicSettings();
  const siteName = publicSettings.site_name?.trim() || defaultSiteName;
  const siteTitle = publicSettings.site_title?.trim() || (isChildSite
    ? `${siteName} | ขายแอพพรีเมียมราคาถูก Netflix, Spotify, YouTube แท้`
    : MAIN_SITE_BROWSER_TITLE);
  const shortTitle = siteTitle.split('|')[0].trim();

  const siteDescription = `${siteName} ศูนย์รวมบัญชีพรีเมียมแท้ ราคาถูก ปลอดภัย พร้อมรับประกัน ใช้งานได้จริง ทั้ง Netflix Ultra HD, Spotify Premium, YouTube Premium, Disney+, Prime Video, HBO GO, VIU, WeTV และอีกมากมาย แชร์ Netflix หาร Netflix แบบไม่โดนแบน บริการรวดเร็ว ตอบไว ดูแลหลังขาย 24 ชม.`;

  const siteLogo = isChildSite
    ? publicSettings.site_logo_url?.trim() || undefined
    : resolveSiteBrandLogo(publicSettings.site_logo_url);

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: siteTitle,
      template: `%s | ${shortTitle}`,
    },
  description: siteDescription,
  keywords: [
    // Main keywords
    siteName,
    "ขายแอพพรีเมียม",
    "เช่าแอพพรีเมียมราคาถูก",
    "บัญชีพรีเมียมแท้ ราคาถูก ปลอดภัย",
    "Premium App Service Thailand",
    // Netflix Focus
    "Netflix",
    "ขาย Netflix แท้",
    "เช่าNetflix ราคาถูก",
    "Netflix Ultra HD",
    "Netflix UHD",
    "Netflix Premium",
    "แชร์ Netflix",
    "หาร Netflix",
    "สมัคร Netflix",
    "Netflix รายเดือน",
    "Netflix 89 บาท",
    "ขายnetflix",
    "ขายแอคnf",
    "แอคแท้ไม่มีจอปลิว",
    "หารเน็ตฟลิกรายเดือน",
    "สมัครnetflixราคาถูก",
    // Spotify Focus
    "Spotify",
    "Spotify Premium",
    "Spotify Premium ราคาถูก",
    "วิธีเช่า Spotify Premium อย่างปลอดภัย",
    "สปอติฟายพรีเมี่ยม",
    // YouTube Focus
    "Youtube",
    "Youtube Premium",
    "YouTube Premium Family",
    "แชร์บัญชี YouTube Premium",
    "youtube premium ราคาถูก",
    // Other Streaming Services
    "Disney+",
    "Disney+ Hotstar Premium",
    "Prime Video",
    "HBO GO",
    "AIS Play",
    "TrueID",
    "VIU",
    "WeTV",
    "Monomax",
    "iQIYI",
    "Bilibili",
    // Secondary & Broad Categories
    "ขายบัญชีพรีเมียม",
    "เช่าบัญชีพรีเมียม",
    "แอปดูหนังพรีเมียม",
    "แอปเพลงพรีเมียม",
    "Premium Account Thailand",
    "Shared Subscription",
    "บัญชีพรีเมียมไม่โดนแบน",
    "บัญชีแท้พร้อมรับประกัน",
    "เว็บขายแอพพรีเมียมถูกและปลอดภัย",
    "ซื้อบัญชี Netflix Premium ราคาถูก",
    "Premium App Marketplace สำหรับคนไทย",
    "ซื้อแอพพรีเมียมราคาถูก ปลอดภัย พร้อมรับประกันหลังขาย",
    // Local & GEO keywords
    "ขายแอพพรีเมียมในไทย",
    "ร้านขายบัญชีพรีเมียมไทย",
    "เช่าแอพพรีเมียมราคาถูกที่สุดในไทย",
    "บริการคนไทย",
    // Extras
    "แอคพรี่เมี่ยม",
    "ราคาถูก",
    "รับตัวแทน",
    "แอปพรีเมี่ยมแท้รับประกัน",
  ],
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: siteUrl,
    siteName: shortTitle,
    locale: "th_TH",
    type: "website",
    ...(siteLogo && {
      images: [
        {
          url: siteLogo,
          width: SITE_BRAND_LOGO_WIDTH,
          height: SITE_BRAND_LOGO_HEIGHT,
          alt: SITE_BRAND_LOGO_ALT,
        },
      ],
    }),
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    ...(siteLogo && {
      images: [siteLogo],
    }),
  },
  alternates: {
    canonical: siteUrl,
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: shortTitle,
  },
  icons: {
    icon: [
      { url: SITE_BRAND_PWA_ICON_192_PATH, sizes: "192x192", type: "image/png" },
      { url: SITE_BRAND_PWA_ICON_512_PATH, sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png?v=20260916", sizes: "180x180", type: "image/png" },
      { url: SITE_BRAND_PWA_ICON_192_PATH, sizes: "192x192", type: "image/png" },
    ],
  },
  other: {
    'geo.region': 'TH',
    'geo.placename': 'Thailand',
    'geo.position': '13.7563;100.5018',
    'ICBM': '13.7563, 100.5018',
  },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#170f1d" },
    { media: "(prefers-color-scheme: light)", color: "#170f1d" },
  ],
};

// Theme Manager settings are tenant-scoped runtime configuration. Keep the
// root shell dynamic so every public route sees a newly published theme
// without requiring a storefront rebuild or changing purchase workflows.
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const publicSettings = await loadLayoutPublicSettings();
  const { siteId } = getSiteConfig();
  const isMainSite = siteId === "main";
  const localThemePreviewEnabled =
    process.env.NODE_ENV === "development" && Boolean(process.env.APP_THEME_PREVIEW_PACK);
  const localThemePreviewPack = localThemePreviewEnabled
    ? process.env.APP_THEME_PREVIEW_PACK
    : undefined;
  const localThemePreviewMode = localThemePreviewEnabled
    ? process.env.APP_THEME_PREVIEW_MODE
    : undefined;
  const themePack = isMainSite
    ? normalizeThemePack(localThemePreviewPack ?? publicSettings.site_theme_pack)
    : "default";
  const themeMode = isMainSite
    ? normalizeThemeMode(localThemePreviewMode ?? publicSettings.site_theme_mode)
    : "day";
  const resolvedThemeMode = resolveThemeMode(themeMode);
  const allowUserThemeMode = isMainSite && publicSettings.site_theme_allow_user_mode !== "false";
  const legacyThemeColors = {
    theme_color: publicSettings.theme_color || process.env.NEXT_PUBLIC_THEME_COLOR || (siteId === "main" ? "#ffb1c1" : "#ff985c"),
    theme_color_nav: publicSettings.theme_color_nav || (siteId === "main" ? "#f598b0" : "#e79940"),
    theme_color_header_bg: publicSettings.theme_color_header_bg || "#ffffff",
    theme_color_bg_top: publicSettings.theme_color_bg_top || (siteId === "main" ? "#fbe3e8" : "#F5DDC2"),
    theme_color_bg_bottom: publicSettings.theme_color_bg_bottom || (siteId === "main" ? "#f9c5d1" : "#F7C58D"),
    theme_color_text_accent: publicSettings.theme_color_text_accent || "#D94654",
    theme_color_announcement: publicSettings.theme_color_announcement || (siteId === "main" ? "#ffb1c1" : "#ff985c"),
  };
  const legacyThemeVariables = {
    "--theme-color": legacyThemeColors.theme_color,
    "--theme-color-nav": legacyThemeColors.theme_color_nav,
    "--theme-color-header-bg": legacyThemeColors.theme_color_header_bg,
    "--theme-color-bg-top": legacyThemeColors.theme_color_bg_top,
    "--theme-color-bg-bottom": legacyThemeColors.theme_color_bg_bottom,
    "--theme-color-text-accent": legacyThemeColors.theme_color_text_accent,
    "--theme-color-announcement": legacyThemeColors.theme_color_announcement,
  };
  // Seasonal tokens are a main-site feature. Child sites keep their existing
  // tenant colour variables exactly as before.
  const initialThemeVariables = isMainSite
    ? getThemeCssVariables(themePack, resolvedThemeMode, legacyThemeColors)
    : legacyThemeVariables;

  return (
    <html
      lang="th"
      className={resolvedThemeMode === "night" ? "dark" : undefined}
      data-theme-mode={resolvedThemeMode}
      suppressHydrationWarning
    >
      <head>
        <meta name="theme-color" content="#170f1d" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=20260916" />
      </head>
      <body 
        data-site-id={siteId}
        data-theme-pack={themePack}
        data-theme-mode={resolvedThemeMode}
        className={`${notoSansThai.variable} ${mali.variable} font-sans antialiased bg-[var(--theme-color-header-bg)]`}
        style={initialThemeVariables as React.CSSProperties}
      >
        <SiteAnalyticsTracker />
        <OrganizationJsonLd />
        <WebSiteJsonLd />
        <PublicSettingsProvider settings={publicSettings}>
        <ThemeProvider
          enabled={isMainSite}
          pack={themePack}
          defaultMode={themeMode}
          allowUserMode={allowUserThemeMode}
          legacyColors={legacyThemeColors}
        >
        <ProductStockRealtimeProvider>
        <CartProvider>
        <PwaInstallProvider>
        <PwaAppLoadingScreen />
        <PwaNotificationPermissionGate />
        <PushAutoSync />
        <MimiNotificationPrompt />
        <PopupAnnouncementModal />
        <NavigationBar />
        {children}
        <AdminContactIcon />
        <BottomNavigation />
        <Toaster
          position="top-center"
          richColors
          expand
          closeButton
          duration={3000}
          className="font-sans"
          toastOptions={{
            style: { borderRadius: 12 },
            classNames: {
              toast: "font-sans",
              title: "font-sans",
              description: "font-sans",
              actionButton: "font-sans",
              cancelButton: "font-sans",
            },
          }}
        />
        </PwaInstallProvider>
        </CartProvider>
        </ProductStockRealtimeProvider>
        </ThemeProvider>
        </PublicSettingsProvider>
      </body>
    </html>
  );
}
