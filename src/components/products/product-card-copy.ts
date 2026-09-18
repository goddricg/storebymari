import { normalizeNewlines } from "@/lib/utils";

const PRODUCT_CARD_SUMMARY_FALLBACK = "ดูรายละเอียดสินค้าและเงื่อนไขก่อนสั่งซื้อ";
const PRODUCT_CARD_SUMMARY_LIMIT = 140;

/**
 * Keep the storefront card readable without exposing raw markup or long copy.
 * The complete product details remain available on the product detail page.
 */
export function getProductCardSummary(details: string | null | undefined): string {
  const plainText = normalizeNewlines(details)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!plainText) {
    return PRODUCT_CARD_SUMMARY_FALLBACK;
  }

  if (plainText.length <= PRODUCT_CARD_SUMMARY_LIMIT) {
    return plainText;
  }

  return `${plainText.slice(0, PRODUCT_CARD_SUMMARY_LIMIT - 1).trimEnd()}…`;
}
