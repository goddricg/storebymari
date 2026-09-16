import { fetchPublishedProductsPaginatedLive } from "@/lib/products/repository";
import { toPublicStorefrontProduct } from "@/lib/products/public-product";
import { googleProductFeedXml } from "@/lib/products/google-feed";

export const dynamic = "force-dynamic";

export async function GET() {
  const first = await fetchPublishedProductsPaginatedLive(1000, 0);
  const products = [...first.products];
  for (let offset = products.length; offset < first.total; offset += 1000) {
    const batch = await fetchPublishedProductsPaginatedLive(1000, offset);
    products.push(...batch.products);
  }

  return new Response(googleProductFeedXml(products.map(toPublicStorefrontProduct)), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=900, stale-while-revalidate=3600",
    },
  });
}
