"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MAX_CART_LINE_ITEMS } from "@/lib/cart/limits";

export type CartItem = {
  typeId: string;
  productName: string;
  imageUrl: string | null;
  price: number | null;
  stock: number | null;
  quantity: number;
};

type AddCartItem = Omit<CartItem, "quantity"> & { quantity?: number };

type CartContextValue = {
  items: CartItem[];
  isHydrated: boolean;
  totalQuantity: number;
  estimatedTotal: number;
  addItem: (item: AddCartItem) => void;
  updateQuantity: (typeId: string, quantity: number) => void;
  removeItem: (typeId: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function storageKey() {
  return `storebymari.cart.${process.env.NEXT_PUBLIC_SITE_ID || "main"}`;
}

function readItems(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(storageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is CartItem => {
      return Boolean(
        item &&
          typeof item === "object" &&
          typeof (item as CartItem).typeId === "string" &&
          typeof (item as CartItem).productName === "string" &&
          Number.isInteger((item as CartItem).quantity) &&
          (item as CartItem).quantity > 0 &&
          Number.isSafeInteger((item as CartItem).quantity),
      );
    });
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setItems(readItems());
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    window.localStorage.setItem(storageKey(), JSON.stringify(items));
  }, [items, isHydrated]);

  const value = useMemo<CartContextValue>(() => {
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const estimatedTotal = items.reduce(
      (sum, item) => sum + (Number(item.price ?? 0) * item.quantity),
      0,
    );

    return {
      items,
      isHydrated,
      totalQuantity,
      estimatedTotal,
      addItem: (input) => {
        setItems((current) => {
          const requestedQuantity = Math.trunc(Number(input.quantity ?? 1));
          const quantity = Number.isSafeInteger(requestedQuantity) && requestedQuantity > 0
            ? requestedQuantity
            : 1;
          const existing = current.find((item) => item.typeId === input.typeId);
          if (existing) {
            const nextQuantity = existing.quantity + quantity;
            if (!Number.isSafeInteger(nextQuantity)) {
              toast.error("จำนวนสินค้าในตะกร้ามากเกินไป");
              return current;
            }
            toast.success("เพิ่มจำนวนสินค้าในตะกร้าแล้ว");
            return current.map((item) => item.typeId === input.typeId
              ? { ...item, ...input, quantity: nextQuantity }
              : item);
          }
          if (current.length >= MAX_CART_LINE_ITEMS) {
            toast.error("ตะกร้ารองรับสินค้าได้ไม่เกิน 10 รายการต่อครั้ง");
            return current;
          }
          toast.success("เพิ่มสินค้าในตะกร้าแล้ว");
          return [...current, { ...input, quantity }];
        });
      },
      updateQuantity: (typeId, quantity) => {
        const nextQuantity = Math.trunc(Number(quantity));
        if (!Number.isFinite(nextQuantity)) return;
        if (!Number.isSafeInteger(nextQuantity) && nextQuantity > 0) {
          toast.error("จำนวนสินค้าในตะกร้ามากเกินไป");
          return;
        }
        setItems((current) => nextQuantity <= 0
          ? current.filter((item) => item.typeId !== typeId)
          : current.map((item) => item.typeId === typeId
            ? { ...item, quantity: nextQuantity }
            : item));
      },
      removeItem: (typeId) => setItems((current) => current.filter((item) => item.typeId !== typeId)),
      clear: () => setItems([]),
    };
  }, [items, isHydrated]);

  return (
    <CartContext.Provider value={value}>
      {children}
      {isHydrated && value.totalQuantity > 0 ? <CartFloatingButton count={value.totalQuantity} /> : null}
    </CartContext.Provider>
  );
}

function CartFloatingButton({ count }: { count: number }) {
  return (
    <Button
      asChild
      data-cart-floating-button
      className={cn(
        "fixed bottom-24 right-4 z-50 h-12 rounded-full bg-[var(--theme-color)] px-4 text-white shadow-[0_10px_26px_rgba(211,78,126,0.32)] hover:bg-[var(--theme-color)] hover:text-white sm:bottom-8 sm:right-8",
      )}
    >
      <Link href="/cart" aria-label={`เปิดตะกร้า มีสินค้า ${count} ชิ้น`}>
        <ShoppingCart className="size-5" />
        <span>ตะกร้า</span>
        <span className="flex size-6 items-center justify-center rounded-full bg-white text-xs font-bold text-[var(--theme-color)]">
          {count > 99 ? "99+" : count}
        </span>
      </Link>
    </Button>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
