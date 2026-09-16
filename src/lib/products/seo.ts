import type { PublicStorefrontProduct } from "./public-product";
import { absoluteUrl, productPath } from "../seo";
import { getPriceByTier } from "../utils/pricing";

export function productStructuredData(product: PublicStorefrontProduct) {
  const price = getPriceByTier(product.price, product.priceVip, product.priceWalkin, "walkin");
  const url = absoluteUrl(productPath(product.typeId));
  const image = product.imageUrl || product.typeImageUrl;
  return {
    "@context": "https://schema.org", "@type": "Product", "@id": `${url}#product`,
    name: product.name, url, sku: product.typeId,
    ...(product.details ? { description: product.details } : {}),
    ...(product.typeMenu ? { category: product.typeMenu } : {}),
    ...(image && /^(https?:\/\/|\/(?!\/))/.test(image) ? { image: absoluteUrl(image) } : {}),
    ...(price !== null && Number.isFinite(price) && price >= 0 ? {
      offers: { "@type": "Offer", url, price: price.toFixed(2), priceCurrency: "THB", availability: (product.stock ?? 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", seller: { "@id": absoluteUrl("/#organization") } },
    } : {}),
  };
}
