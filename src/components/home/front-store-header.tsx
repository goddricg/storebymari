"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Bell,
  ChevronDown,
  Headphones,
  Home,
  Menu,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Tag,
  UserRound,
  X,
} from "lucide-react";
import { useCart } from "@/components/cart/cart-provider";
import CustomerNotificationBell from "@/components/notifications/customer-notification-bell";
import SupportNotificationBell from "@/components/admin/support-notification-bell";
import LoginForm from "@/components/auth/login-form";
import { SITE_BRAND_LOGO_PATH } from "@/lib/site-branding";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSession } from "@/lib/auth/use-session";
import { isAdminUser } from "@/lib/auth/roles";

const primaryLinks = [
  { href: "/", label: "หน้าแรก", Icon: Home },
  { href: "/products", label: "สินค้า", Icon: ShoppingBag },
  { href: "#promotions", label: "โปรโมชั่น", Icon: Tag },
  { href: "/support/report", label: "แจ้งปัญหา", Icon: AlertCircle },
  { href: "#support", label: "ติดต่อเรา", Icon: Headphones },
];

export default function FrontStoreHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);
  const { totalQuantity } = useCart();
  const { user } = useSession();
  const isAdmin = isAdminUser(user);
  const accountHref = user ? (isAdmin ? "/admin" : "/dashboard") : "/login";
  const accountLabel = user ? (isAdmin ? "Admin" : "บัญชีของฉัน") : "เข้าสู่ระบบ";

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
        <Link href="/" className="front-store-brand" aria-label="Mari Studio หน้าแรก">
          <Image
            src={SITE_BRAND_LOGO_PATH}
            alt="Mari Studio แอพดีๆ ครบจบที่นี่"
            width={1536}
            height={1024}
            priority
            sizes="(max-width: 430px) 184px, (max-width: 767px) 206px, (max-width: 1279px) 210px, 250px"
            className="front-store-brand-image"
          />
        </Link>

        <nav className="front-store-desktop-nav" aria-label="เมนูหลัก">
          {primaryLinks.map(({ href, label, Icon }) => (
            <Link href={href} key={label} className="front-store-nav-link">
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="front-store-header-actions">
          <Link href="/cart" className="front-store-icon-link front-store-cart" aria-label={`ตะกร้าสินค้า ${totalQuantity} ชิ้น`}>
            <ShoppingCart aria-hidden="true" />
            <span className="front-store-cart-count">{totalQuantity > 99 ? "99+" : totalQuantity}</span>
          </Link>

          <div className="front-store-notification" aria-label="การแจ้งเตือน">
            {user ? (
              isAdmin ? <SupportNotificationBell user={user} /> : <CustomerNotificationBell user={user} />
            ) : (
              <Link href="/login" className="front-store-icon-link" aria-label="เข้าสู่ระบบเพื่อดูการแจ้งเตือน">
                <Bell aria-hidden="true" />
              </Link>
            )}
          </div>

          {user ? (
            <Link href={accountHref} className="front-store-login">
              {isAdmin ? <ShieldCheck aria-hidden="true" /> : <UserRound aria-hidden="true" />}
              <span>{accountLabel}</span>
              <ChevronDown aria-hidden="true" className="front-store-login-chevron" />
            </Link>
          ) : (
            <button
              type="button"
              className="front-store-login"
              aria-haspopup="dialog"
              aria-expanded={loginOpen}
              onClick={() => setLoginOpen(true)}
            >
              <UserRound aria-hidden="true" />
              <span>{accountLabel}</span>
            </button>
          )}

          <button
            type="button"
            className="front-store-menu-button"
            aria-label={menuOpen ? "ปิดเมนู" : "เปิดเมนู"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <nav className="front-store-mobile-menu" aria-label="เมนูบนมือถือ">
          {primaryLinks.map(({ href, label, Icon }) => (
            <Link href={href} key={label} onClick={() => setMenuOpen(false)}>
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
          {user ? (
            <Link href={accountHref} onClick={() => setMenuOpen(false)}>
              {isAdmin ? <ShieldCheck aria-hidden="true" /> : <UserRound aria-hidden="true" />}
              <span>{isAdmin ? "เข้าสู่หน้า Admin" : "บัญชีของฉัน"}</span>
            </Link>
          ) : (
            <button
              type="button"
              className="front-store-mobile-login-trigger"
              aria-haspopup="dialog"
              aria-expanded={loginOpen}
              onClick={() => {
                setMenuOpen(false);
                setLoginOpen(true);
              }}
            >
              <ShieldCheck aria-hidden="true" />
              <span>เข้าสู่ระบบ</span>
            </button>
          )}
        </nav>
      ) : null}

      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent
          closeLabel="ปิดหน้าต่างเข้าสู่ระบบ"
          placement="popover"
          className="front-store-login-dialog-panel"
        >
          <DialogHeader className="pr-7">
            <p className="text-xs font-bold tracking-[0.18em] text-[#a41461]">MARI STUDIO</p>
            <DialogTitle className="text-2xl font-semibold text-[#17101c]">เข้าสู่ระบบ</DialogTitle>
            <DialogDescription>
              เข้าสู่ระบบเพื่อเลือกสินค้าและจัดการบัญชีของคุณ
            </DialogDescription>
          </DialogHeader>
          <LoginForm identifierMode="username-or-email" onSuccess={() => setLoginOpen(false)} />
          <p className="border-t border-[#eadce8] pt-4 text-center text-sm text-[#5f5662]">
            ยังไม่มีบัญชี?
            <Link
              href="/register"
              className="ml-1 font-semibold text-[#a41461] hover:underline"
              onClick={() => setLoginOpen(false)}
            >
              สมัครสมาชิก
            </Link>
          </p>
        </DialogContent>
      </Dialog>
    </header>
  );
}
