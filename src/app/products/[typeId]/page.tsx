import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { findProductByTypeId } from "@/lib/products/repository";
import { toPublicStorefrontProduct } from "@/lib/products/public-product";
import { productStructuredData } from "@/lib/products/seo";
import { pageMetadata, productPath } from "@/lib/seo";
import { BreadcrumbJsonLd, JsonLd } from "@/components/seo/json-ld";
import { StoreGuideLinks } from "@/components/seo/store-guide-links";
import { PurchaseProductButton } from "@/components/orders/purchase-product-button";
import { ProductPriceDisplay } from "@/components/products/product-price-display";
import { normalizeNewlines } from "@/lib/utils";

type PageProps = { params: Promise<{ typeId: string }> };
// One request-scoped read for metadata and content, never a shared user cache.
const getPublishedProduct = cache(async (typeId: string) => {
  const product = await findProductByTypeId(typeId);
  if (!product || !product.isPublished) notFound();
  return toPublicStorefrontProduct(product);
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const product = await getPublishedProduct((await params).typeId);
  const description = `${product.name} — ${normalizeNewlines(product.details ?? "ดูราคา สต็อก และเงื่อนไขก่อนสั่งซื้อกับ StoreByMari").replace(/\s+/g, " ")}`.slice(0, 180);
  const metadata = pageMetadata(product.name, description, productPath(product.typeId));
  const image = product.imageUrl || product.typeImageUrl;
  if (image && /^(https?:\/\/|\/(?!\/))/.test(image)) {
    metadata.openGraph = { ...metadata.openGraph, images: [{ url: image, alt: product.name }] };
    metadata.twitter = { ...metadata.twitter, images: [image] };
  }
  return metadata;
}

export default async function ProductPage({ params }: PageProps) {
  const product = await getPublishedProduct((await params).typeId);
  const image = product.imageUrl || product.typeImageUrl;
  const hasStock = (product.stock ?? 0) > 0;
  return <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
    <article className="rounded-3xl border border-pink-200 bg-white p-6 text-slate-900 shadow-sm sm:p-10">
      <BreadcrumbJsonLd items={[{ name: "หน้าแรก", url: "/" }, { name: "สินค้า", url: "/products" }, { name: product.name, url: productPath(product.typeId) }]} />
      <JsonLd data={productStructuredData(product)} />
      <nav aria-label="เส้นทาง" className="mb-6 flex flex-wrap gap-2 text-sm"><Link href="/" className="underline">หน้าแรก</Link> / <Link href="/products" className="underline">สินค้า</Link> / <span aria-current="page">{product.name}</span></nav>
      <div className="grid gap-8 md:grid-cols-2">
        <div className="relative aspect-square overflow-hidden rounded-2xl bg-pink-50">
          {image ? <Image src={image} alt={product.name} fill sizes="(max-width: 767px) 90vw, 440px" className="object-contain p-4" unoptimized /> : <span className="flex h-full items-center justify-center text-7xl text-pink-600" aria-hidden="true">{product.name.slice(0, 1)}</span>}
        </div>
        <div className="space-y-5">
          <h1 className="text-2xl font-bold leading-snug sm:text-3xl">{product.name}</h1>
          {product.typeMenu && <p>หมวดหมู่: {product.typeMenu}</p>}
          <ProductPriceDisplay price={product.price} priceVip={product.priceVip} priceWalkin={product.priceWalkin} />
          <p className="text-sm">{hasStock ? `มีสินค้า ${product.stock} ชิ้น` : "สินค้าหมดชั่วคราว"}</p>
          <p className="text-sm leading-7 text-slate-600">ราคาหน้าเว็บแสดงเป็นบาท ชำระด้วยพ้อยท์ของร้าน ราคาสำหรับสมาชิกอาจแตกต่างกัน กรุณาตรวจสอบยอดในหน้าต่างยืนยันก่อนสั่งซื้อ</p>
          <PurchaseProductButton typeId={product.typeId} productName={product.name} productDescription={product.details} price={product.price} priceVip={product.priceVip} priceWalkin={product.priceWalkin} stock={product.stock} disabled={!hasStock}>สั่งซื้อสินค้า</PurchaseProductButton>
        </div>
      </div>
      <section className="mt-8 border-t border-pink-100 pt-6">
        <h2 className="text-xl font-semibold">รายละเอียดและเงื่อนไขสินค้า</h2>
        <p className="mt-4 whitespace-pre-line break-words leading-8">{normalizeNewlines(product.details ?? "ยังไม่มีรายละเอียดเพิ่มเติม กรุณาสอบถามร้านก่อนยืนยันคำสั่งซื้อ")}</p>
      </section>
      <StoreGuideLinks />
    </article>
  </main>;
}
