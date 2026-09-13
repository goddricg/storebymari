"use client";

import { useMemo } from "react";
import { ShoppingCart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCart } from "@/components/cart/cart-provider";
import { useSession } from "@/lib/auth/use-session";
import { getPriceByTier } from "@/lib/utils/pricing";

export function AddToCartButton({
  typeId,
  productName,
  imageUrl = null,
  price,
  priceVip = null,
  priceWalkin = null,
  stock,
  disabled = false,
  className,
}: {
  typeId: string;
  productName: string;
  imageUrl?: string | null;
  price: number | null;
  priceVip?: number | null;
  priceWalkin?: number | null;
  stock: number | null;
  disabled?: boolean;
  className?: string;
}) {
  const { addItem, isHydrated } = useCart();
  const { user } = useSession();
  const effectivePrice = useMemo(
    () => getPriceByTier(price, priceVip, priceWalkin, user?.tier ?? "walkin"),
    [price, priceVip, priceWalkin, user?.tier],
  );

  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled || !isHydrated}
      className={className}
      onClick={() => addItem({ typeId, productName, imageUrl, price: effectivePrice, stock })}
    >
      <ShoppingCart className="size-4" />
      ใส่ตะกร้า
    </Button>
  );
}
