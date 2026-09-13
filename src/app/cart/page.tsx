import type { Metadata } from "next";

import { getSiteConfig } from "@/lib/site-config";
import CartPageClient from "@/components/cart/cart-page-client";

export async function generateMetadata(): Promise<Metadata> {
  const { siteName } = getSiteConfig();
  return {
    title: `ตะกร้าสินค้า | ${siteName}`,
    description: "ตรวจสอบรายการสินค้าและสั่งซื้อหลายรายการพร้อมกัน",
    robots: { index: false, follow: false },
  };
}

export default function CartPage() {
  return <CartPageClient />;
}
