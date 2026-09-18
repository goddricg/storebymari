"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import {
  Bell,
  ShoppingCart,
} from "lucide-react";
import { useCart } from "@/components/cart/cart-provider";
import CustomerNotificationBell from "@/components/notifications/customer-notification-bell";
import SupportNotificationBell from "@/components/admin/support-notification-bell";
import LoginForm from "@/components/auth/login-form";
import {
  resolveSiteBrandLogo,
  SITE_BRAND_LOGO_HEIGHT,
  SITE_BRAND_LOGO_WIDTH,
} from "@/lib/site-branding";
import { useSession } from "@/lib/auth/use-session";
import { isAdminUser } from "@/lib/auth/roles";
import { usePublicSettings } from "@/components/public-settings-provider";
import StorefrontAccountMenuButton from "@/components/storefront-account-menu-button";
import StorefrontPrimaryNav from "@/components/storefront-primary-nav";

export default function FrontStoreHeader() {
  const headerRef = useRef<HTMLElement | null>(null);
  const { totalQuantity } = useCart();
  const { user } = useSession();
  const publicSettings = usePublicSettings();
  const isAdmin = isAdminUser(user);
  const siteName = publicSettings.site_name?.trim() || "Store By Mari";
  const siteLogo = resolveSiteBrandLogo(publicSettings.site_logo_url);

  useEffect(() => {
    const header = headerRef.current;
    if (!header || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(([entry]) => {
      header.dataset.scrolled = String(!entry.isIntersecting);
    });
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return (
    <header ref={headerRef} data-scrolled="false" className="front-store-header">
      <div className="front-store-header-main">
        <Link href="/" className="front-store-brand" aria-label={`${siteName} หน้าแรก`}>
          <Image
            src={siteLogo}
            alt={`${siteName} แอพดีๆ ครบจบที่นี่`}
            width={SITE_BRAND_LOGO_WIDTH}
            height={SITE_BRAND_LOGO_HEIGHT}
            priority
            sizes="(max-width: 430px) 184px, (max-width: 767px) 206px, (max-width: 1279px) 210px, 250px"
            className="front-store-brand-image"
            unoptimized={!siteLogo.startsWith("/")}
          />
        </Link>

        <StorefrontPrimaryNav />

        <div className="front-store-header-actions">
          <Link href="/cart" className="front-store-icon-link front-store-cart" aria-label={`ตะกร้าสินค้า ${totalQuantity} ชิ้น`}>
            <ShoppingCart aria-hidden="true" />
            <span className="front-store-cart-count">{totalQuantity > 99 ? "99+" : totalQuantity}</span>
          </Link>

          <div className="front-store-notification" aria-label="การแจ้งเตือน">
            {user ? (
              isAdmin ? <SupportNotificationBell user={user} /> : <CustomerNotificationBell user={user} />
            ) : (
              <Link href="/login" className="front-store-icon-link front-store-notification-trigger" aria-label="เข้าสู่ระบบเพื่อดูการแจ้งเตือน">
                <Bell aria-hidden="true" />
              </Link>
            )}
          </div>

          <StorefrontAccountMenuButton />
        </div>
      </div>
    </header>
  );
}
