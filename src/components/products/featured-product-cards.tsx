"use client";

import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardTitle,
} from "@/components/ui/card";
import { PurchaseProductButton } from "@/components/orders/purchase-product-button";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { ProductPriceDisplay } from "@/components/products/product-price-display";
import { VipBadge } from "@/components/products/vip-badge";
import { useLiveProductStock } from "@/components/products/product-stock-realtime-provider";
import { cn, normalizeNewlines } from "@/lib/utils";

export type FeaturedProduct = {
  id: string;
  typeId: string;
  name: string;
  category: string;
  price: number | null;
  priceVip: number | null;
  priceWalkin: number | null;
  imageUrl: string | null;
  details: string | null;
  stock: number | null;
  badge: "hot_sale" | "recommended" | null;
};

export function FeaturedProductCard({
  product,
}: {
  product: FeaturedProduct;
}) {
  const { stock, badge, isOutOfStock, price, priceVip, priceWalkin } = useLiveProductStock(
    product.id,
    product.stock,
    product.badge,
    product.price,
    product.priceVip,
    product.priceWalkin
  );
  const logoUrl = product.imageUrl ?? "/logos/default.svg";
  const hasVipPrice = priceVip != null;

  return (
    <Card
      className={cn(
        "storefront-product-card dreamy-card dreamy-product-card dreamy-compact-product-card group relative isolate flex h-full min-h-0 flex-col overflow-hidden border py-0 transition-all",
        isOutOfStock
          ? "border-[#D1D5DB]/60 bg-gray-50/95 grayscale hover:shadow-sm hover:border-[#D1D5DB]"
          : "hover:-translate-y-1 theme-hover-border-55"
      )}
      data-card-layer="background"
      data-stock-state={isOutOfStock ? "out-of-stock" : "available"}
    >
      <CardContent data-card-layer="content" className="storefront-product-card-content relative z-10 flex h-full min-h-0 flex-col gap-2.5 p-2.5 text-left sm:gap-3 sm:p-4">
        <div data-card-layer="image" className="storefront-product-image dreamy-compact-product-media relative z-30 w-full shrink-0 overflow-hidden rounded-xl bg-white">
          <Image
            src={logoUrl}
            alt={normalizeNewlines(product.name)}
            fill
            sizes="(max-width: 1279px) 50vw, 33vw"
            className="dreamy-image-preserve object-contain p-1.5 sm:p-2"
          />
        </div>
        <div className="storefront-product-card-details flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 sm:gap-2">
          <CardTitle
            data-card-layer="title"
            className={cn(
              "dreamy-compact-product-title relative z-40 min-h-[2.45rem] text-pretty whitespace-pre-line break-words [overflow-wrap:anywhere] text-[13px] font-semibold leading-[1.22] sm:text-base",
              isOutOfStock ? "text-gray-500" : "text-[#0B0B0B]"
            )}
          >
            {normalizeNewlines(product.name)}
          </CardTitle>
          {((product.category && product.category !== "หมวดอื่นๆ") || isOutOfStock || badge || hasVipPrice) && (
            <div className="storefront-product-card-badges relative z-40 flex min-w-0 flex-wrap items-center gap-1">
              {product.category && product.category !== "หมวดอื่นๆ" ? (
                <Badge
                  variant="secondary"
                  className={cn(
                    "w-fit max-w-full truncate text-[10px] sm:text-xs",
                    isOutOfStock
                      ? "bg-gray-200 text-gray-500"
                      : "theme-bg-10 text-[var(--theme-color)]"
                  )}
                >
                  {product.category.toUpperCase()}
                </Badge>
              ) : null}
              {hasVipPrice && <VipBadge />}
              {isOutOfStock ? (
                <Badge className="bg-gray-700 text-white text-[10px] font-semibold shadow-sm sm:text-xs">
                  สินค้าหมด
                </Badge>
              ) : badge === "hot_sale" ? (
                <Badge className="bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                  HOT SALE
                </Badge>
              ) : badge === "recommended" ? (
                <Badge className="bg-green-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                  แนะนำ
                </Badge>
              ) : null}
            </div>
          )}
          <div data-card-layer="price" className="dreamy-price-capsule storefront-price-tag relative z-10 mt-auto">
            <ProductPriceDisplay
              price={price}
              priceVip={priceVip}
              priceWalkin={priceWalkin}
              isOutOfStock={isOutOfStock}
              className="text-sm font-semibold sm:text-base"
            />
          </div>
          <div className="dreamy-product-meta flex w-full items-center justify-between gap-2 text-xs leading-snug text-[#6B7280] sm:text-sm">
            <span className="dreamy-product-stock min-w-0 truncate font-medium">
              สต็อก: <span className="font-semibold text-[#0B0B0B]">{(stock ?? 0).toLocaleString()}</span> ชิ้น
            </span>
            <span className="dreamy-product-code min-w-0 truncate text-right text-[#9CA3AF]">รหัส: {product.typeId}</span>
          </div>
          <div data-card-layer="actions" className="storefront-product-actions relative z-20 grid grid-cols-2 gap-1">
            <PurchaseProductButton
              typeId={product.typeId}
              productName={product.name}
              productDescription={product.details}
              price={price}
              priceVip={priceVip}
              priceWalkin={priceWalkin}
              stock={stock}
              className="dreamy-buy-button storefront-buy-button w-full rounded-lg px-2 py-1.5 text-xs sm:rounded-xl sm:py-2 sm:text-sm"
              disabled={isOutOfStock}
            >
              ซื้อทันที
            </PurchaseProductButton>
            <AddToCartButton
              typeId={product.typeId}
              productName={product.name}
              imageUrl={logoUrl}
              price={price}
              priceVip={priceVip}
              priceWalkin={priceWalkin}
              stock={stock}
              disabled={isOutOfStock}
              className="dreamy-cart-button w-full rounded-lg px-2 py-1.5 text-xs sm:rounded-xl sm:py-2 sm:text-sm"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function FeaturedProductCardDesktop({
  product,
}: {
  product: FeaturedProduct;
}) {
  return <FeaturedProductCard product={product} />;
}
