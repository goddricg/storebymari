import { getSiteConfig } from "@/lib/site-config";
import { SITE_BRAND_LOGO_PATH } from "@/lib/site-branding";
import { absoluteUrl, serializeJsonLd } from "@/lib/seo";

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
export function OrganizationJsonLd() {
  const { siteName, isChildSite } = getSiteConfig();
  return <JsonLd data={{ "@context": "https://schema.org", "@type": "Organization", "@id": absoluteUrl("/#organization"), name: siteName, url: absoluteUrl(), ...(!isChildSite ? { logo: absoluteUrl(SITE_BRAND_LOGO_PATH) } : {}) }} />;
}
export function WebSiteJsonLd() {
  const { siteName } = getSiteConfig();
  return <JsonLd data={{ "@context": "https://schema.org", "@type": "WebSite", "@id": absoluteUrl("/#website"), name: siteName, url: absoluteUrl(), inLanguage: "th", publisher: { "@id": absoluteUrl("/#organization") } }} />;
}
export function BreadcrumbJsonLd({ items }: { items: { name: string; url: string }[] }) {
  return <JsonLd data={{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: absoluteUrl(item.url) })) }} />;
}
