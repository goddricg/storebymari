import Image from "next/image";
import Link from "next/link";
import {
  AlertCircle,
  BriefcaseBusiness,
  Clapperboard,
  Gamepad2,
  GraduationCap,
  Headphones,
  LayoutGrid,
  Sparkles,
  Tag,
  Video,
} from "lucide-react";
import FrontStoreHeroGlow from "@/components/home/front-store-hero-glow";

type Category = { category: string; imageUrl?: string | null; count?: number };
type Promo = { image: string; link: string | null; alt: string };
type HeroProps = {
  enabled?: boolean;
  imageUrl?: string | null;
  linkUrl?: string | null;
};

const DEFAULT_HERO_IMAGE_URL = "/front-store/hero-section-n1.jpg";
const fallbackCategories = [
  "แอพสตรีมมิ่ง",
  "แอพทำงาน",
  "แอพตัดต่อ",
  "แอพการศึกษา",
  "โปรโมชั่น",
  "อื่นๆ",
];
const fallbackPromos: Promo[] = [
  { image: "/front-store/promo-register.webp", link: "/register", alt: "สมัครสมาชิก รับสิทธิพิเศษมากมาย" },
  { image: "/front-store/promo-support.webp", link: "/support/report", alt: "มีปัญหา ติดต่อเราได้เลย" },
  { image: "/front-store/promo-community.webp", link: "/products", alt: "รวมแอพพรีเมียม เข้าสู่รายการสินค้า" },
  { image: "/front-store/promo-gift.png", link: "/products", alt: "ดูโปรโมชั่นเพิ่มเติม" },
];

function iconFor(name: string) {
  const normalized = name.toLowerCase();
  if (normalized === "ทั้งหมด" || normalized.includes("grid")) return LayoutGrid;
  if (/(สตรีม|หนัง|movie|entertain)/u.test(normalized)) return Clapperboard;
  if (/(ทำงาน|work|business)/u.test(normalized)) return BriefcaseBusiness;
  if (/(เกม|game)/u.test(normalized)) return Gamepad2;
  if (/(ตัดต่อ|video|edit)/u.test(normalized)) return Video;
  if (/(ศึกษา|เรียน|education)/u.test(normalized)) return GraduationCap;
  if (/(โปรโม|promotion|tag)/u.test(normalized)) return Tag;
  return Sparkles;
}

export function FrontStoreHero({ enabled = true, imageUrl, linkUrl }: HeroProps) {
  if (!enabled) return null;

  const resolvedImageUrl = imageUrl?.trim() || DEFAULT_HERO_IMAGE_URL;
  const resolvedLinkUrl = linkUrl?.trim() || null;
  const isRemoteImage = /^https?:\/\//i.test(resolvedImageUrl);
  const heroContent = (
    <section className="front-store-hero" aria-label="แนะนำ StoreByMari">
      <div className="front-store-hero-media">
        <Image
          src={resolvedImageUrl}
          alt="StoreByMari แอพพรีเมียมแท้ ราคาดี ปลอดภัย และมีแอดมินดูแล"
          width={1600}
          height={900}
          priority
          sizes="(max-width: 1536px) 96vw, 1472px"
          unoptimized={isRemoteImage}
          className="front-store-hero-image"
        />
      </div>
      <FrontStoreHeroGlow />
    </section>
  );

  if (!resolvedLinkUrl) return heroContent;

  return /^https?:\/\//i.test(resolvedLinkUrl) ? (
    <a
      href={resolvedLinkUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="front-store-hero-link"
    >
      {heroContent}
    </a>
  ) : (
    <Link href={resolvedLinkUrl} className="front-store-hero-link">
      {heroContent}
    </Link>
  );
}

export function FrontStoreCategories({ categories }: { categories: Category[] }) {
  const liveCategories = categories.filter(
    (item) => !/ข้อมูลจำลอง|\blocal\b|\bdemo\b/i.test(item.category),
  );
  const categoriesToShow = [
    { label: "ทั้งหมด", href: "/products" },
    ...liveCategories.slice(0, 6).map((item) => ({
      label: item.category,
      href: `/products?category=${encodeURIComponent(item.category)}`,
    })),
  ];

  while (categoriesToShow.length < 7) {
    const used = new Set(categoriesToShow.map((item) => item.label));
    const label = fallbackCategories.find((item) => !used.has(item));
    if (!label) break;
    categoriesToShow.push({
      label,
      href: `/products?category=${encodeURIComponent(label)}`,
    });
  }

  const mobileLinks = [
    { label: "แจ้งปัญหา", href: "/support/report", Icon: AlertCircle },
    { label: "ติดต่อเรา", href: "#support", Icon: Headphones },
  ];

  return (
    <nav className="front-store-category-grid" aria-label="เลือกหมวดหมู่สินค้า">
      {categoriesToShow.map(({ label, href }, index) => {
        const Icon = iconFor(label);
        return (
          <Link
            href={href}
            key={`${label}-${index}`}
            data-category={label}
            className={`front-store-category-card${index === 0 ? " is-featured" : ""}`}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
      {mobileLinks.map(({ label, href, Icon }) => (
        <Link href={href} key={label} className="front-store-category-card front-store-mobile-category">
          <Icon aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function FrontStorePromos({
  promos,
  enabled,
  count = 4,
}: {
  promos: Promo[];
  enabled: boolean;
  count?: number;
}) {
  const visibleCount = Math.min(4, Math.max(0, Math.trunc(count)));
  if (!enabled || visibleCount === 0) {
    return <span id="promotions" className="front-store-promos-anchor" aria-hidden="true" />;
  }

  const selectedPromos = [...promos].slice(0, visibleCount);
  for (const fallback of fallbackPromos) {
    if (selectedPromos.length >= visibleCount) break;
    selectedPromos.push(fallback);
  }

  while (selectedPromos.length < visibleCount) {
    selectedPromos.push(fallbackPromos[selectedPromos.length % fallbackPromos.length]);
  }

  return (
    <section id="promotions" className="front-store-promos" aria-label="ทางลัดร้านค้า">
      {selectedPromos.map((promo, index) => {
        const fallback = fallbackPromos[index % fallbackPromos.length];
        const image = promo.image || fallback.image;
        const content = (
          <Image
            src={image}
            alt={promo.alt || fallback.alt}
            fill
            sizes="48vw"
            className="front-store-promo-image"
            unoptimized={image.startsWith("http")}
          />
        );

        return promo.link ? (
          <Link href={promo.link} className="front-store-promo-card" key={`${promo.image}-${index}`} aria-label={promo.alt || fallback.alt}>
            {content}
          </Link>
        ) : (
          <div className="front-store-promo-card" key={`${promo.image}-${index}`}>
            {content}
          </div>
        );
      })}
    </section>
  );
}
