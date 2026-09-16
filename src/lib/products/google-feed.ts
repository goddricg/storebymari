import type { PublicStorefrontProduct } from "@/lib/products/public-product";
import { absoluteUrl, productPath } from "@/lib/seo";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cleanText(value: string | null | undefined, fallback: string) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function publicUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value, absoluteUrl("/"));
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function guestPrice(product: PublicStorefrontProduct) {
  const price = product.priceWalkin ?? product.price ?? product.priceVip;
  const numericPrice = Number(price);
  return Number.isFinite(numericPrice) && numericPrice >= 0 ? `${numericPrice.toFixed(2)} THB` : null;
}

export function googleProductFeedXml(products: PublicStorefrontProduct[]) {
  const items = products
    .filter((product) => product.isPublished && product.name.trim() && guestPrice(product))
    .map((product) => {
      const link = absoluteUrl(productPath(product.typeId));
      const image = publicUrl(product.imageUrl || product.typeImageUrl);
      const price = guestPrice(product)!;
      const description = cleanText(product.details, `${product.name} สินค้าดิจิทัลจาก StoreByMari`);
      const availability = (product.stock ?? 0) > 0 ? "in stock" : "out of stock";
      return [
        "<item>",
        `<g:id>${escapeXml(product.typeId)}</g:id>`,
        `<g:title>${escapeXml(cleanText(product.name, "สินค้า StoreByMari"))}</g:title>`,
        `<g:description>${escapeXml(description)}</g:description>`,
        `<link>${escapeXml(link)}</link>`,
        image ? `<g:image_link>${escapeXml(image)}</g:image_link>` : "",
        `<g:availability>${availability}</g:availability>`,
        `<g:price>${price}</g:price>`,
        "<g:condition>new</g:condition>",
        "<g:identifier_exists>no</g:identifier_exists>",
        "<g:brand>StoreByMari</g:brand>",
        "</item>",
      ].filter(Boolean).join("");
    })
    .join("");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "<channel>",
    `<title>${escapeXml("StoreByMari สินค้าออนไลน์")}</title>`,
    `<link>${escapeXml(absoluteUrl("/products"))}</link>`,
    `<description>${escapeXml("แคตตาล็อกสินค้าดิจิทัลของ StoreByMari")}</description>`,
    items,
    "</channel>",
    "</rss>",
  ].join("");
}
