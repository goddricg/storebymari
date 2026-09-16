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
import { notFound } from "next/navigation";
import { fetchPublishedProductsPaginated, getAllCategoriesCached } from "@/lib/products/repository";
import { toPublicStorefrontProduct } from "@/lib/products/public-product";
import { catalogPath, pageMetadata, parseCatalogQuery } from "@/lib/seo";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { StoreGuideLinks } from "@/components/seo/store-guide-links";
type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const PAGE_SIZE = 12;

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const query = parseCatalogQuery(await searchParams);
  return pageMetadata(`สินค้าทั้งหมด${query.page > 1 ? ` หน้า ${query.page}` : ""}`,
    "เลือกดูสินค้าและแอปพรีเมียม StoreByMari เปรียบเทียบราคา สต็อก ระยะเวลาและเงื่อนไขก่อนสั่งซื้อด้วยพ้อยท์ของร้าน",
    catalogPath(query), Boolean(query.search || query.category));
}

export default async function ProductsPage({ searchParams }: PageProps) {
  const query = parseCatalogQuery(await searchParams);
  const [catalog, categories] = await Promise.all([
    fetchPublishedProductsPaginated(PAGE_SIZE, (query.page - 1) * PAGE_SIZE, query.category, query.search),
    getAllCategoriesCached(false),
  ]);
  if (query.page > 1 && !catalog.products.length) notFound();
  const totalPages = Math.max(1, Math.ceil(catalog.total / PAGE_SIZE));
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

          <BreadcrumbJsonLd items={[{ name: "หน้าแรก", url: "/" }, { name: "สินค้า", url: catalogPath(query) }]} />
          <ProductsGridClient key={catalogPath(query)} categoryLayout="chips"
            initialProducts={catalog.products.map(toPublicStorefrontProduct)}
            initialCategories={categories.map(c => ({ category: c.category, imageUrl: c.imageUrl, count: c.count }))}
            initialTotal={catalog.total} initialTotalPages={totalPages}
            initialPage={query.page} initialCategory={query.category} initialSearch={query.search} />
          <StoreGuideLinks />

          <div className="products-catalog-trust-strip mt-8 grid gap-3 rounded-3xl px-4 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
            <div className="products-catalog-trust-item flex items-center gap-3">
              <ShieldCheck className="size-7 shrink-0" aria-hidden="true" />
              <span><strong>อ่านรายละเอียดก่อนซื้อ</strong><small>ตรวจสอบเงื่อนไขแต่ละรายการ</small></span>
            </div>
            <div className="products-catalog-trust-item flex items-center gap-3">
              <Zap className="size-7 shrink-0" aria-hidden="true" />
              <span><strong>จัดส่งไว</strong><small>ดูข้อมูลในประวัติคำสั่งซื้อ</small></span>
            </div>
            <div className="products-catalog-trust-item flex items-center gap-3">
              <Headphones className="size-7 shrink-0" aria-hidden="true" />
              <span><strong>แจ้งปัญหาการใช้งาน</strong><small>ทีมงานพร้อมช่วยเหลือ</small></span>
            </div>
            <div className="products-catalog-trust-item flex items-center gap-3">
              <Star className="size-7 shrink-0" aria-hidden="true" />
              <span><strong>ติดตามคำสั่งซื้อ</strong><small>ตรวจสอบรายการได้ในบัญชีของคุณ</small></span>
            </div>
          </div>
        </div>
      </div>

      <aside className="products-catalog-benefits relative z-10" aria-label="จุดเด่นของร้าน">
        <div className="products-catalog-benefits-panel rounded-3xl p-5 sm:p-6">
          <p className="flex items-center gap-2 text-sm font-semibold"><Truck className="size-5" aria-hidden="true" /> สั่งซื้อไวทันใจ</p>
          <p className="mt-1 text-xs">ตรวจสอบสินค้าและราคาก่อนยืนยัน</p>
          <div className="mt-5 space-y-4">
            <div className="flex gap-3"><ShieldCheck className="size-6 shrink-0" aria-hidden="true" /><span><strong>สินค้าพรีเมียม</strong><small>ดูเงื่อนไขในรายละเอียดสินค้า</small></span></div>
            <div className="flex gap-3"><Headphones className="size-6 shrink-0" aria-hidden="true" /><span><strong>ตอบง่าย ดูแลตลอด</strong><small>ทีมงานพร้อมช่วยเหลือหลังการขาย</small></span></div>
            <div className="flex gap-3"><Star className="size-6 shrink-0" aria-hidden="true" /><span><strong>ติดตามคำสั่งซื้อ</strong><small>ตรวจสอบรายการได้ในบัญชีของคุณ</small></span></div>
          </div>
        </div>
      </aside>
    </section>
  );
}

