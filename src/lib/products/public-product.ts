import type { Product } from "@/lib/products/types";

/**
 * Fields intentionally permitted in an unauthenticated storefront response.
 * Delivery credentials and internal margin/provider fields must stay server-side.
 */
export type PublicStorefrontProduct = Pick<
  Product,
  | "id"
  | "typeId"
  | "name"
  | "imageUrl"
  | "typeImageUrl"
  | "details"
  | "price"
  | "priceVip"
  | "priceWalkin"
  | "stock"
  | "typeMenu"
  | "categoryId"
  | "isPublished"
  | "badge"
  | "createdAt"
  | "updatedAt"
>;

export function toPublicStorefrontProduct(
  product: Product
): PublicStorefrontProduct {
  return {
    id: product.id,
    typeId: product.typeId,
    name: product.name,
    imageUrl: product.imageUrl,
    typeImageUrl: product.typeImageUrl,
    details: product.details,
    price: product.price,
    priceVip: product.priceVip,
    priceWalkin: product.priceWalkin,
    stock: product.stock,
    typeMenu: product.typeMenu,
    categoryId: product.categoryId,
    isPublished: product.isPublished,
    badge: product.badge,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}
