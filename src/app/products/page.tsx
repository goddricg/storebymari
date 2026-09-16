import type { Metadata } from "next";
import Link from "next/link";
import {
  ChevronRight,
  Headphones,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Truck,
  Zap,
} from "lucide-react";
import ProductsGridClient from "@/components/products/products-grid-client";
import { getSiteConfig } from "@/lib/site-config";

export async function generateMetadata(): Promise<Metadata> {
  const { siteName } = getSiteConfig();
  return {
    title: "สินค้าทั้งหมด บัญชีพรีเมียมแท้ราคาถูก",
    description: `เลือกซื้อบัญชีพรีเมียมแท้จาก ${siteName} ราคาถูก ปลอดภัย พร้อมรับประกัน ครอบคลุม Netflix, Spotify, YouTube Premium, Disney+ และอีกมากมาย`,
    keywords: [
      siteName,
      "สินค้าพรีเมียม",
      "บัญชีพรีเมียมทั้งหมด",
      "ขายบัญชีพรีเมียม",
      "Premium Account",
      "Netflix Premium",
      "Spotify Premium",
      "YouTube Premium",
      "Disney Plus",
    ],
  };
}

export default function ProductsPage() {
  return (
    <section className="products-catalog-page relative isolate overflow-hidden pt-4 pb-12 sm:pt-6 sm:pb-16">
      <div className="products-catalog-shell relative z-10 mx-auto w-full max-w-[1740px] px-4 sm:px-6 lg:px-8">
        <div className="products-catalog-main">
          <nav className="products-catalog-breadcrumb flex items-center gap-2 text-xs sm:text-sm" aria-label="เส้นทาง">
            <Link href="/" className="transition-colors hover:text-white">หน้าแรก</Link>
            <ChevronRight className="size-4" aria-hidden="true" />
            <span aria-current="page">สินค้า</span>
          </nav>

          <header className="products-catalog-heading mt-4 flex items-start gap-3 sm:mt-5 sm:gap-4">
            <span className="products-catalog-heading-icon flex size-12 shrink-0 items-center justify-center rounded-2xl sm:size-16">
              <ShoppingBag className="size-7 sm:size-9" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold leading-none sm:text-5xl">สินค้า</h1>
                <Sparkles className="hidden size-6 sm:block" aria-hidden="true" />
              </div>
              <p className="mt-2 text-sm sm:text-base">บัญชีพรีเมียม ครบทุกความบันเทิง ในที่เดียว <span aria-hidden="true">|</span> Store by Mari ♡</p>
            </div>
          </header>

          <ProductsGridClient categoryLayout="chips" />

          <div className="products-catalog-trust-strip mt-8 grid gap-3 rounded-3xl px-4 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
            <div className="products-catalog-trust-item flex items-center gap-3">
              <ShieldCheck className="size-7 shrink-0" aria-hidden="true" />
              <span><strong>ปลอดภัย 100%</strong><small>บัญชีแท้มีการรับประกัน</small></span>
            </div>
            <div className="products-catalog-trust-item flex items-center gap-3">
              <Zap className="size-7 shrink-0" aria-hidden="true" />
              <span><strong>จัดส่งไว</strong><small>เปิดใช้งานได้ทันที</small></span>
            </div>
            <div className="products-catalog-trust-item flex items-center gap-3">
              <Headphones className="size-7 shrink-0" aria-hidden="true" />
              <span><strong>ดูแลตลอดการใช้งาน</strong><small>ทีมงานพร้อมช่วยเหลือ</small></span>
            </div>
            <div className="products-catalog-trust-item flex items-center gap-3">
              <Star className="size-7 shrink-0" aria-hidden="true" />
              <span><strong>ลูกค้าพึงพอใจ</strong><small>รีวิวจริงจากผู้ใช้งาน</small></span>
            </div>
          </div>
        </div>
      </div>

      <aside className="products-catalog-benefits relative z-10" aria-label="จุดเด่นของร้าน">
        <div className="products-catalog-benefits-panel rounded-3xl p-5 sm:p-6">
          <p className="flex items-center gap-2 text-sm font-semibold"><Truck className="size-5" aria-hidden="true" /> สั่งซื้อไวทันใจ</p>
          <p className="mt-1 text-xs">เปิดใช้งานเร็ว ใช้ได้ในไม่กี่นาที</p>
          <div className="mt-5 space-y-4">
            <div className="flex gap-3"><ShieldCheck className="size-6 shrink-0" aria-hidden="true" /><span><strong>สินค้าพรีเมียม</strong><small>บัญชีแท้ มีการรับประกัน 100%</small></span></div>
            <div className="flex gap-3"><Headphones className="size-6 shrink-0" aria-hidden="true" /><span><strong>ตอบง่าย ดูแลตลอด</strong><small>ทีมงานพร้อมช่วยเหลือหลังการขาย</small></span></div>
            <div className="flex gap-3"><Star className="size-6 shrink-0" aria-hidden="true" /><span><strong>ลูกค้าพึงพอใจ</strong><small>รีวิวจริงจากผู้ใช้งาน</small></span></div>
          </div>
        </div>
      </aside>
    </section>
  );
}

