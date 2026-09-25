"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertCircle,
  Headphones,
  Home,
  SearchCheck,
  ShoppingBag,
} from "lucide-react";

import { isStorefrontPrimaryLinkActive } from "@/lib/storefront-primary-nav";
import { cn } from "@/lib/utils";

export const STOREFRONT_PRIMARY_LINKS = [
  { href: "/", label: "หน้าแรก", Icon: Home },
  { href: "/products", label: "สินค้า", Icon: ShoppingBag },
  { href: "/support/check", label: "เช็คเลขเคส", Icon: SearchCheck },
  { href: "/support/report", label: "แจ้งปัญหา", Icon: AlertCircle },
  { href: "/#support", label: "ติดต่อเรา", Icon: Headphones },
] as const;

export default function StorefrontPrimaryNav({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav className={cn("front-store-desktop-nav", className)} aria-label="เมนูหลัก">
      {STOREFRONT_PRIMARY_LINKS.map(({ href, label, Icon }) => {
        const isActive = isStorefrontPrimaryLinkActive(pathname, href);

        return (
          <Link
            href={href}
            key={label}
            className={cn("front-store-nav-link", isActive && "is-active")}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

