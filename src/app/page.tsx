// Test deployment auto trigger by Mimi #3
import Image from "next/image";
import { Suspense } from "react";
import type { Metadata } from "next";
import { pageMetadata, STORE_DESCRIPTION } from "@/lib/seo";
import { StoreGuideLinks } from "@/components/seo/store-guide-links";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import ProductsGridClient from "@/components/products/products-grid-client";
import {
  fetchRecommendedProducts,
  fetchPublishedProductsPaginated,
  getAllCategoriesCached,
} from "@/lib/products/repository";
import { listRecentOrders } from "@/lib/orders/repository";
import type { Order } from "@/lib/orders/types";
import { Marquee } from "@/components/ui/marquee";
import { Sparkles, Crown } from "lucide-react";
import { getSettingValuesCached } from "@/lib/settings/repository";
import { normalizeNewlines } from "@/lib/utils";
import MovieGallery from "@/components/home/movie-gallery";
import {
  FeaturedProductCard,
  FeaturedProductCardDesktop,
  type FeaturedProduct,
} from "@/components/products/featured-product-cards";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { DreamyOrnament } from "@/components/dreamy-ui/ornaments";
import { MAIN_SITE_BROWSER_TITLE, getSiteConfig } from "@/lib/site-config";
import { loadLayoutPublicSettings } from "@/lib/settings/load-layout-public-settings";
import FrontStoreHeader from "@/components/home/front-store-header";
import FrontStoreExtras from "@/components/home/front-store-extras";
import AnnouncementBar from "@/components/announcement-bar";
import {
  FrontStoreCategories,
  FrontStoreHero,
  FrontStorePromos,
} from "@/components/home/front-store-showcase";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const { siteName } = getSiteConfig();
  const publicSettings = await loadLayoutPublicSettings();
  const configuredTitle = publicSettings.site_title?.trim();
  return pageMetadata(
    configuredTitle || `${siteName} สินค้าและแอปพรีเมียมออนไลน์`,
    STORE_DESCRIPTION,
    "/",
  );
}

// The root layout remains request-rendered for live tenant theme settings.
// Cache public homepage reads at their repository boundaries instead.

const GRID_PAGE_SIZE = 10;
const HOME_SETTINGS_KEYS = [
  "home_youtube_url",
  "home_youtube_enabled",
  "home_youtube_title",
  "home_movies_enabled",
  "home_movie_poster_1",
  "home_movie_poster_2",
  "home_movie_poster_3",
  "home_movie_poster_4",
  "home_movie_poster_5",
  "home_movie_poster_6",
  "home_featured_enabled",
  "home_poster_enabled",
  "home_poster_image_url",
  "home_poster_link_url",
  "home_shortcuts_enabled",
  "home_shortcuts_count",
  "home_shortcut_image_1",
  "home_shortcut_link_1",
  "home_shortcut_image_2",
  "home_shortcut_link_2",
  "home_shortcut_image_3",
  "home_shortcut_link_3",
  "home_shortcut_image_4",
  "home_shortcut_link_4",
];

type RecentOrder = Order;

async function readHomeData<T>(
  source: string,
  read: () => Promise<T>,
  fallback: T,
): Promise<{ value: T; available: boolean }> {
  try {
    return { value: await read(), available: true };
  } catch {
    console.warn(`Homepage data unavailable: ${source}`);
    return { value: fallback, available: false };
  }
}

function formatOrderTimestamp(value: string | null) {
  if (!value) {
    return "เมื่อสักครู่";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function normalizeShortcutCount(value: string | null) {
  if (value === null || value.trim() === "") return 4;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 4;
  return Math.min(4, Math.max(0, Math.trunc(parsed)));
}

// ✨ คืนชีพฟังก์ชันหลักที่มิมิทำหล่นหายไป! 
export default function Home() {
  const { siteName, siteUrl } = getSiteConfig();
  return (
    <main className="front-store-page">
      <BreadcrumbJsonLd items={[{ name: "หน้าแรก", url: siteUrl }]} />
      <h1 className="sr-only">{siteName} สินค้าและแอปพรีเมียมออนไลน์</h1>
      <div className="front-store-scale-shell">
        <FrontStoreHeader />
        <AnnouncementBar />
        <section className="front-store-primary">
          <div className="front-store-container">
            <Suspense fallback={<HomeProductsSkeleton />}>
              <ProductsSection />
            </Suspense>
          </div>
        </section>
      </div>

    </main>
  );
}

async function ProductsSection() {
  const { siteName } = getSiteConfig();
  const [
    recommendedProductsResult,
    recentOrdersResult,
    gridPageResult,
    gridCategoriesResult,
    homeSettingsResult,
  ] = await Promise.all([
    readHomeData("recommended products", fetchRecommendedProducts, []),
    readHomeData("recent orders", () => listRecentOrders(20), []),
    readHomeData(
      "published products",
      () => fetchPublishedProductsPaginated(GRID_PAGE_SIZE, 0),
      { products: [], total: 0 },
    ),
    readHomeData("categories", () => getAllCategoriesCached(false), []),
    readHomeData(
      "storefront settings",
      () => getSettingValuesCached(HOME_SETTINGS_KEYS),
      Object.fromEntries(HOME_SETTINGS_KEYS.map((key) => [key, null])),
    ),
  ]);

  const homeDataResults = [
    recommendedProductsResult,
    recentOrdersResult,
    gridPageResult,
    gridCategoriesResult,
    homeSettingsResult,
  ];
  const hasHomeDataFailure = homeDataResults.some((result) => !result.available);
  const recommendedProducts = recommendedProductsResult.value;
  const recentOrders = recentOrdersResult.value;
  const gridPage = gridPageResult.value;
  const gridCategories = gridCategoriesResult.value;
  const homeSettings = homeSettingsResult.value;
  const youtubeUrl = homeSettings["home_youtube_url"];
  const youtubeEnabled = homeSettings["home_youtube_enabled"] !== "false";
  const youtubeTitle = homeSettings["home_youtube_title"] || "";
  const moviesEnabled = homeSettings["home_movies_enabled"] === "true";
  const featuredEnabled = homeSettings["home_featured_enabled"] !== "false";
  const shortcutsEnabled = homeSettings["home_shortcuts_enabled"] !== "false";
  const shortcutCount = normalizeShortcutCount(homeSettings["home_shortcuts_count"]);
  const heroEnabled = homeSettings["home_poster_enabled"] !== "false";
  const heroImageUrl = homeSettings["home_poster_image_url"]?.trim() || null;
  const heroLinkUrl = homeSettings["home_poster_link_url"]?.trim() || null;

  const moviePosters = [
    homeSettings["home_movie_poster_1"],
    homeSettings["home_movie_poster_2"],
    homeSettings["home_movie_poster_3"],
    homeSettings["home_movie_poster_4"],
    homeSettings["home_movie_poster_5"],
    homeSettings["home_movie_poster_6"],
  ].filter((p): p is string => typeof p === "string" && p !== "");

  const shortcutCards = [
    { image: homeSettings["home_shortcut_image_1"], link: homeSettings["home_shortcut_link_1"] },
    { image: homeSettings["home_shortcut_image_2"], link: homeSettings["home_shortcut_link_2"] },
    { image: homeSettings["home_shortcut_image_3"], link: homeSettings["home_shortcut_link_3"] },
    { image: homeSettings["home_shortcut_image_4"], link: homeSettings["home_shortcut_link_4"] },
  ].filter((card): card is { image: string; link: string | null } => typeof card.image === "string" && card.image !== "");

  const videoId = getYoutubeId(youtubeUrl);
  const gridInitialProducts = gridPage.products.map((product) => ({
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
    badge: product.badge,
  }));
  const gridInitialCategories = gridCategories.map((c) => ({
    category: c.category,
    imageUrl: c.imageUrl,
    count: c.count,
  }));

  const featuredProducts: FeaturedProduct[] = recommendedProducts.map((product) => ({
    id: product.id,
    typeId: product.typeId,
    name: product.name,
    category: product.typeMenu ?? "หมวดอื่นๆ",
    price: product.price,
    priceVip: product.priceVip,
    priceWalkin: product.priceWalkin,
    imageUrl: product.imageUrl,
    details: product.details,
    stock: product.stock,
    badge: product.badge,
  }));

  const latestOrders = recentOrders
    .filter((order) => order.productName)
    .slice(0, 12);

  return (
    <div className="front-store-content">
      <FrontStoreHero
        enabled={heroEnabled}
        imageUrl={heroImageUrl}
        linkUrl={heroLinkUrl}
      />
      <FrontStorePromos
        enabled={shortcutsEnabled}
        count={shortcutCount}
        promos={shortcutCards.slice(0, 4).map((card, index) => ({
          image: card.image,
          link: card.link ?? ["/register", "/support/report", "/products"][index],
          alt: [
            "สมัครสมาชิก รับสิทธิพิเศษมากมาย",
            "มีปัญหา ติดต่อทีมงานได้เลย",
            "เลือกดูแอพพรีเมียมทั้งหมด",
            "ดูโปรโมชั่นเพิ่มเติม",
          ][index],
        }))}
      />
      <FrontStoreCategories categories={gridInitialCategories} />

      {hasHomeDataFailure ? (
        <section
          role="status"
          className="dreamy-glass-panel mx-auto w-full max-w-4xl rounded-2xl border border-[var(--theme-color)]/25 p-6 text-center"
        >
          <h2 className="text-xl font-semibold text-[var(--dreamy-text)]">{siteName}</h2>
          <p className="mt-2 text-sm text-[var(--dreamy-text-muted)]">
            ขณะนี้ไม่สามารถโหลดข้อมูลหน้าร้านได้ครบ กรุณาลองใหม่อีกครั้งภายหลัง
          </p>
        </section>
      ) : null}

      {youtubeEnabled && videoId && (
        <section className="flex flex-col items-center justify-center py-2">
          <div className="dreamy-glass-panel w-full max-w-xl overflow-hidden rounded-2xl p-3">
            <div className="aspect-video w-full">
              <iframe
                className="h-full w-full rounded-xl"
                src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}`}
                title="YouTube video player"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                style={{ border: 0 }}
              ></iframe>
            </div>
            {youtubeTitle && (
              <p className="mt-2.5 text-center text-sm font-semibold text-[#0B0B0B]">
                {youtubeTitle}
              </p>
            )}
          </div>
        </section>
      )}

      {moviesEnabled && moviePosters.length > 0 && (
        <section className="dreamy-glass-panel relative space-y-4 rounded-xl p-5">
          <DreamyOrnament
            kind="bow"
            className="pointer-events-none absolute -right-2 -top-3 size-10 rotate-6"
          />
          <div className="text-center space-y-0.5">
            <p className="text-xs font-bold text-[var(--theme-color)]">NEW RELEASES</p>
            <h2 className="text-lg font-bold text-[var(--dreamy-text)]">แนะนำหนังใหม่น่าดู</h2>
          </div>
          
          <MovieGallery posters={moviePosters} />
        </section>
      )}


      {featuredEnabled && featuredProducts.length > 0 ? (
        <section id="products" className="front-store-product-section space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--theme-color)]">
                <Sparkles className="size-4" />
                สินค้าแนะนำสำหรับคุณ
              </div>
              <h2 className="flex items-center gap-2 text-2xl font-semibold text-[#0B0B0B]">
                <span className="flex size-8 items-center justify-center rounded-full bg-[var(--theme-color)]/10 text-[var(--theme-color)]">
                  <Crown className="size-4" />
                </span>
                สินค้าขายดีและน่าสนใจ
              </h2>
              <p className="text-sm text-[#6B7280]">
                เรารวบรวมสินค้าที่ได้รับความนิยมและคุ้มค่าที่สุดมาไว้ให้คุณที่นี่
              </p>
            </div>
          </div>

          {/* Mobile: single-column layout */}
          <div className="grid grid-cols-1 gap-5 md:hidden">
            {featuredProducts.slice(0, 8).map((product) => (
              <FeaturedProductCard key={product.id} product={product} />
            ))}
          </div>

          {/* Desktop: Full details layout */}
          <div className="hidden md:grid md:grid-cols-2 xl:grid-cols-3 gap-6">
            {featuredProducts.slice(0, 8).map((product) => (
              <FeaturedProductCardDesktop
                key={product.id}
                product={product}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="front-store-product-section">
        <ProductsGridClient
          initialProducts={gridInitialProducts}
          initialTotal={gridPage.total}
          initialTotalPages={Math.max(1, Math.ceil(gridPage.total / GRID_PAGE_SIZE))}
          showFilters={false}
          showOutOfStockBadge
          layout="home"
          pageSize={GRID_PAGE_SIZE}
          showPagination
        />
      </section>

      <StoreGuideLinks />
      <FrontStoreExtras />
    </div>
  );
}

function RecentOrderChip({ order }: { order: RecentOrder }) {
  const initial = order.productName.slice(0, 1).toUpperCase();
  const imageUrl = order.productImage ?? "/logos/default.svg";
  const isRemoteLogo = imageUrl.startsWith("http");
  return (
    <div className="flex min-w-[200px] sm:min-w-[260px] items-center gap-2 sm:gap-3 rounded-lg border border-[var(--theme-color)]/30 bg-white px-3 sm:px-4 py-2 text-[#0B0B0B] shadow-sm shadow-[var(--theme-color)]/10">
      <span className="relative flex size-9 items-center justify-center overflow-hidden rounded-md bg-[#F4F4F5]">
        <Image
          src={imageUrl}
          alt={order.productName}
          fill
          sizes="36px"
          className="object-contain"
          unoptimized={isRemoteLogo}
        />
        <span className="sr-only">{initial}</span>
      </span>
      <div className="flex min-w-0 flex-col text-left">
        <p className="truncate text-sm font-semibold">{order.productName}</p>
        <span className="text-xs text-[#6B7280]">
          {formatOrderTimestamp(order.purchaseDate ?? order.createdAt)}
        </span>
      </div>
    </div>
  );
}

function HomeProductsSkeleton() {
  return (
    <div className="mt-10 space-y-12">
      <div className="grid grid-cols-2 gap-4 md:hidden">
        {Array.from({ length: 8 }).map((_, index) => (
          <Card key={index} className="border-transparent bg-white/95 shadow-sm">
            <CardContent className="flex flex-col items-center h-full p-5 text-center">
              <div className="size-32 rounded-2xl bg-[var(--theme-color)]/10 animate-pulse mb-4" />
              <div className="h-4 w-full rounded bg-[var(--theme-color)]/15 animate-pulse mb-auto min-h-[3rem]" />
              <div className="flex flex-col items-center gap-2 mt-auto pt-4 w-full">
                <div className="h-6 w-20 rounded bg-[var(--theme-color)]/20 animate-pulse" />
                <div className="h-9 w-full rounded-lg bg-[var(--theme-color)]/20 animate-pulse" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="hidden md:grid md:grid-cols-2 xl:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index} className="border-transparent bg-white shadow-sm">
            <CardContent className="gap-6 py-6 flex h-full flex-col">
              <div className="flex flex-row items-start gap-4">
                <div className="h-16 w-16 rounded-2xl bg-[var(--theme-color)]/10 animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-full rounded bg-[var(--theme-color)]/15 animate-pulse" />
                  <div className="h-4 w-20 rounded bg-[var(--theme-color)]/10 animate-pulse" />
                </div>
              </div>
              <div className="flex-1 space-y-2">
                <div className="h-3 w-full rounded bg-[var(--theme-color)]/10 animate-pulse" />
                <div className="h-3 w-full rounded bg-[var(--theme-color)]/10 animate-pulse" />
                <div className="h-3 w-3/4 rounded bg-[var(--theme-color)]/10 animate-pulse" />
              </div>
              <div className="mt-auto space-y-4">
                <div className="h-16 rounded-2xl bg-[var(--theme-color)]/10 animate-pulse" />
                <div className="h-4 w-full rounded bg-[var(--theme-color)]/10 animate-pulse" />
                <div className="h-10 w-full rounded-xl bg-[var(--theme-color)]/20 animate-pulse" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function getYoutubeId(url: string | null): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}
