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

const iconNames = ["grid", "movie", "work", "video", "education", "tag", "more"] as const;
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
];

function iconFor(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes("grid")) return LayoutGrid;
  if (normalized.includes("movie")) return Clapperboard;
  if (normalized.includes("work")) return BriefcaseBusiness;
  if (normalized.includes("game")) return Gamepad2;
  if (normalized.includes("video")) return Video;
  if (normalized.includes("education")) return GraduationCap;
  if (normalized.includes("tag")) return Tag;
  return Sparkles;
}

export function FrontStoreHero() {
  return (
    <section className="front-store-hero" aria-label="แนะนำ Mari Studio">
      <div className="front-store-hero-media">
        <Image
          src="/front-store/hero-section-v1.webp"
          alt="Mari Studio แอพดีๆ ครบจบในที่เดียว ปลอดภัย มีแอดมินดูแล และใช้งานได้จริง"
          width={1365}
          height={619}
          priority
          sizes="(max-width: 1536px) 96vw, 1472px"
          className="front-store-hero-image"
        />
      </div>
      <FrontStoreHeroGlow />
    </section>
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
    categoriesToShow.push({ label, href: "/products" });
  }

  const mobileLinks = [
    { label: "แจ้งปัญหา", href: "/support/report", Icon: AlertCircle },
    { label: "ติดต่อเรา", href: "#support", Icon: Headphones },
  ];

  return (
    <nav className="front-store-category-grid" aria-label="เลือกหมวดหมู่สินค้า">
      {categoriesToShow.map(({ label, href }, index) => {
        const Icon = iconFor(iconNames[index] ?? "more");
        return (
          <Link
            href={href}
            key={`${label}-${index}`}
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
}: {
  promos: Promo[];
  enabled: boolean;
}) {
  if (!enabled) {
    return <span id="promotions" className="front-store-promos-anchor" aria-hidden="true" />;
  }
  const selectedPromos = [...promos].slice(0, 4);
  for (const fallback of fallbackPromos) {
    if (selectedPromos.length >= 3) break;
    selectedPromos.push(fallback);
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
            sizes="(max-width: 767px) 96vw, 32vw"
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
