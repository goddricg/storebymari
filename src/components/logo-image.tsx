"use client";

import Image from "next/image";
import { usePublicSettings } from "@/components/public-settings-provider";
import { getSiteConfig } from "@/lib/site-config";
import { getSiteId } from "@/lib/site";
import {
  resolveSiteBrandLogo,
  SITE_BRAND_LOGO_ALT,
  SITE_BRAND_LOGO_HEIGHT,
  SITE_BRAND_LOGO_PATH,
  SITE_BRAND_LOGO_WIDTH,
} from "@/lib/site-branding";

const DEFAULT_LOGO = SITE_BRAND_LOGO_PATH;

export default function LogoImage() {
  const settings = usePublicSettings();
  const { siteName } = getSiteConfig();
  const custom = settings.site_logo_url?.trim();
  const siteId = getSiteId();
  
  if (!custom && siteId !== "main") {
    return (
      <div className="flex items-center h-12 sm:h-16 px-2">
        <span className="text-xl sm:text-2xl font-extrabold text-white/90 drop-shadow-md">
          {siteName}
        </span>
      </div>
    );
  }

  const logoUrl = siteId === "main" ? resolveSiteBrandLogo(custom) : custom || DEFAULT_LOGO;
  const logoAlt = siteId === "main" ? SITE_BRAND_LOGO_ALT : `${siteName} logo`;

  return (
    <Image
      src={logoUrl}
      alt={logoAlt}
      width={SITE_BRAND_LOGO_WIDTH}
      height={SITE_BRAND_LOGO_HEIGHT}
      priority
      sizes="(max-width: 640px) 72px, 96px"
      className="dreamy-image-preserve h-12 w-auto object-contain sm:h-16"
      unoptimized={!logoUrl.startsWith("/")}
    />
  );
}
