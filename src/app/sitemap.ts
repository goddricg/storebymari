import type { MetadataRoute } from "next";
import { fetchPublishedProductsPaginated } from "@/lib/products/repository";
import { absoluteUrl, productPath } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = ["/", "/products", "/buying-guide"].map(path => ({ url: absoluteUrl(path) }));
  // Throw on database failure instead of publishing a successful empty catalogue.
  const first = await fetchPublishedProductsPaginated(200, 0);
  const products = [...first.products];
  for (let offset = 200; offset < first.total; offset += 200) {
    const batch = await fetchPublishedProductsPaginated(200, offset);
    products.push(...batch.products);
  }
  const seen = new Set<string>();
  for (const product of products) {
    if (!product.isPublished || seen.has(product.typeId)) continue;
    seen.add(product.typeId);
    // Do not synthesize lastmod from request time; omit when unavailable.
    entries.push({ url: absoluteUrl(productPath(product.typeId)) });
  }
  return entries;
}
