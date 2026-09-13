import { getEffectiveStockFromRecord } from "@/lib/products/stock-utils";
import type { ProductRecord } from "@/lib/products/types";
import { getSiteId } from "@/lib/site";

export type ProductLivePatch = {
  id: string;
  typeId: string;
  stock: number;
  badge: "hot_sale" | "recommended" | null;
  isPublished: boolean;
  price?: number | null;
  priceVip?: number | null;
  priceWalkin?: number | null;
};

export type ProductRealtimeRow = {
  id: string;
  type_id: string;
  stock: number | null;
  account_data: unknown;
  badge: "hot_sale" | "recommended" | null;
  is_published: boolean;
  price?: number | null;
  price_vip?: number | null;
  price_walkin?: number | null;

  price_main?: number | null;
  price_main_vip?: number | null;
  price_main_walkin?: number | null;

  price_child1?: number | null;
  price_child1_vip?: number | null;
  price_child1_walkin?: number | null;

  price_child2?: number | null;
  price_child2_vip?: number | null;
  price_child2_walkin?: number | null;
};

export function rowToProductLivePatch(
  row: ProductRealtimeRow
): ProductLivePatch | null {
  if (!row?.id || !row?.type_id) {
    return null;
  }

  const siteId = getSiteId();
  let price = row.price;
  let priceVip = row.price_vip;
  let priceWalkin = row.price_walkin;

  if (siteId === "main") {
    price = row.price_main !== undefined ? row.price_main : row.price;
    priceVip = row.price_main_vip !== undefined ? row.price_main_vip : row.price_vip;
    priceWalkin = row.price_main_walkin !== undefined ? row.price_main_walkin : row.price_walkin;
  } else {
    const childPriceKey = `price_${siteId}`;
    const childVipKey = `price_${siteId}_vip`;
    const childWalkinKey = `price_${siteId}_walkin`;

    if ((row as any)[childPriceKey] !== undefined && (row as any)[childPriceKey] !== null) {
      price = (row as any)[childPriceKey];
    }
    if ((row as any)[childVipKey] !== undefined && (row as any)[childVipKey] !== null) {
      priceVip = (row as any)[childVipKey];
    }
    if ((row as any)[childWalkinKey] !== undefined && (row as any)[childWalkinKey] !== null) {
      priceWalkin = (row as any)[childWalkinKey];
    }
  }

  return {
    id: row.id,
    typeId: row.type_id,
    stock: getEffectiveStockFromRecord({
      stock: row.stock,
      account_data: row.account_data as ProductRecord["account_data"],
    }),
    badge: row.badge ?? null,
    isPublished: Boolean(row.is_published),
    price: price !== undefined ? (price != null ? Number(price) : null) : undefined,
    priceVip: priceVip !== undefined ? (priceVip != null ? Number(priceVip) : null) : undefined,
    priceWalkin: priceWalkin !== undefined ? (priceWalkin != null ? Number(priceWalkin) : null) : undefined,
  };
}
