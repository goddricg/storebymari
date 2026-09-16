import type { Metadata } from "next";
import { getSiteConfig } from "./site-config";
import { SITE_BRAND_LOGO_PATH } from "./site-branding";

export const STORE_DESCRIPTION = "StoreByMari ร้านสินค้าและแอปพรีเมียมออนไลน์ เลือกดูราคา ระยะเวลา และเงื่อนไขแต่ละรายการ สั่งซื้อด้วยพ้อยท์ของร้าน พร้อมช่องทางแจ้งปัญหาและติดตามคำสั่งซื้อ";

export function absoluteUrl(path = "/") {
  return new URL(path, `${getSiteConfig().siteUrl}/`).toString();
}

export function productPath(typeId: string) {
  return `/products/${encodeURIComponent(typeId)}`;
}

/**
 * Next route params can arrive either decoded or as the encoded path segment
 * emitted by productPath. Normalize both forms before resolving a product.
 */
export function decodeProductPathSegment(pathSegment: string) {
  let value = pathSegment;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const decoded = decodeURIComponent(value);
      if (decoded === value) break;
      value = decoded;
    } catch {
      break;
    }
  }
  return value;
}

export function pageMetadata(title: string, description: string, path: string, noindex = false): Metadata {
  const { siteName } = getSiteConfig();
  return {
    title, description,
    alternates: { canonical: absoluteUrl(path) },
    robots: noindex ? { index: false, follow: true } : {
      index: true, follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
    },
    openGraph: { title: `${title} | ${siteName}`, description, url: absoluteUrl(path), siteName, locale: "th_TH", type: "website", images: [{ url: absoluteUrl(SITE_BRAND_LOGO_PATH), alt: siteName }] },
    twitter: { card: "summary_large_image", title: `${title} | ${siteName}`, description, images: [absoluteUrl(SITE_BRAND_LOGO_PATH)] },
  };
}

export function serializeJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

export type CatalogQuery = { page: number; category: string; search: string };
export function parseCatalogQuery(params: Record<string, string | string[] | undefined>): CatalogQuery {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
  const rawPage = first(params.page);
  const page = /^\d+$/.test(rawPage) ? Number(rawPage) : 1;
  return { page: Math.min(1000, Math.max(1, Number.isSafeInteger(page) ? page : 1)), category: first(params.category).trim().slice(0, 160), search: first(params.search).trim().slice(0, 160) };
}

export function catalogPath({ page, category, search }: CatalogQuery) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (category && category !== "ทั้งหมด") params.set("category", category);
  if (search) params.set("search", search);
  return `/products${params.size ? `?${params}` : ""}`;
}
