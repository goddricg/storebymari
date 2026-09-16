"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  Bell,
  Coins,
  FileText,
  Headphones,
  Home,
  History,
  LogOut,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Tag,
  UserRound,
} from "lucide-react";
import { useCart } from "@/components/cart/cart-provider";
import CustomerNotificationBell from "@/components/notifications/customer-notification-bell";
import SupportNotificationBell from "@/components/admin/support-notification-bell";
import LoginForm from "@/components/auth/login-form";
import CustomHamburgerMenuButton from "@/components/ui/custom-hamburger-menu-button";
import {
  resolveSiteBrandLogo,
  SITE_BRAND_LOGO_HEIGHT,
  SITE_BRAND_LOGO_WIDTH,
} from "@/lib/site-branding";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/lib/auth/use-session";
import { isAdminUser, isSuperAdminUser } from "@/lib/auth/roles";
import { usePublicSettings } from "@/components/public-settings-provider";

const primaryLinks = [
  { href: "/", label: "หน้าแรก", Icon: Home },
  { href: "/products", label: "สินค้า", Icon: ShoppingBag },
  { href: "#promotions", label: "โปรโมชั่น", Icon: Tag },
  { href: "/support/report", label: "แจ้งปัญหา", Icon: AlertCircle },
  { href: "#support", label: "ติดต่อเรา", Icon: Headphones },
] as const;

const ACCOUNT_CAT_ICON_PATH = "/front-store/storebymari-black-cat-account.png";

export default function FrontStoreHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountMenuAnimating, setAccountMenuAnimating] = useState(false);
  const [masterPointStatus, setMasterPointStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [masterPoint, setMasterPoint] = useState<number | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const accountMenuTimerRef = useRef<number | null>(null);
  const router = useRouter();
  const { totalQuantity } = useCart();
  const { user, refreshSession } = useSession();
  const publicSettings = usePublicSettings();
  const isAdmin = isAdminUser(user);
  const canViewMasterPoint = Boolean(user && isSuperAdminUser(user));
  const siteName = publicSettings.site_name?.trim() || "Store By Mari";
  const siteLogo = resolveSiteBrandLogo(publicSettings.site_logo_url);
  const accountHref = user ? (isAdmin ? "/admin" : "/dashboard") : "/login";
  useEffect(() => {
    return () => {
      if (accountMenuTimerRef.current !== null) {
        window.clearTimeout(accountMenuTimerRef.current);
      }
    };
  }, []);

  const handleAccountMenuOpenChange = (open: boolean) => {
    if (!user) return;

    if (accountMenuTimerRef.current !== null) {
      window.clearTimeout(accountMenuTimerRef.current);
      accountMenuTimerRef.current = null;
    }

    if (!open) {
      setAccountMenuAnimating(false);
      setAccountMenuOpen(false);
      return;
    }

    setAccountMenuAnimating(true);
    const animationDelay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 360;
    accountMenuTimerRef.current = window.setTimeout(() => {
      setAccountMenuOpen(true);
      setAccountMenuAnimating(false);
      accountMenuTimerRef.current = null;
    }, animationDelay);
  };

  useEffect(() => {
    if (!canViewMasterPoint || !accountMenuOpen) return;

    let cancelled = false;
    const loadMasterPoint = async () => {
      if (!cancelled) setMasterPointStatus("loading");
      try {
        const response = await fetch("/api/admin/appbymari/balance", {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Master Point unavailable");
        const body = await response.json() as { masterPoint?: unknown };
        const value = Number(body.masterPoint);
        if (!Number.isFinite(value)) throw new Error("Invalid Master Point");
        if (cancelled) return;
        setMasterPoint(value);
        setMasterPointStatus("ready");
      } catch {
        if (cancelled) return;
        setMasterPoint(null);
        setMasterPointStatus("error");
      }
    };

    void loadMasterPoint();
    const refreshTimer = window.setInterval(() => void loadMasterPoint(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [accountMenuOpen, canViewMasterPoint]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    window.dispatchEvent(new Event("auth:session-changed"));
    await refreshSession();
    setAccountMenuOpen(false);
    setAccountMenuAnimating(false);
    toast.success("ออกจากระบบสำเร็จ");
    router.refresh();
  };

  useEffect(() => {
    const header = headerRef.current;
    if (!header || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(([entry]) => {
      header.dataset.scrolled = String(!entry.isIntersecting);
    });
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleAuthChange = () => {
      void refreshSession();
    };

    window.addEventListener("auth:session-changed", handleAuthChange);
    return () => window.removeEventListener("auth:session-changed", handleAuthChange);
  }, [refreshSession]);

  const accountTrigger = (expanded: boolean, popup: "menu" | "dialog") => (
    <button
      type="button"
      className="front-store-login front-store-account-trigger"
      aria-label={user ? "เปิดเมนูบัญชีผู้ใช้" : "เปิดเมนูเข้าสู่ระบบ"}
      aria-haspopup={popup}
      aria-expanded={expanded}
      onClick={() => {
        setMenuOpen(false);
        if (!user) setLoginOpen(true);
      }}
    >
      <span className="front-store-account-cat-wrap" aria-hidden="true">
        <Image
          src={ACCOUNT_CAT_ICON_PATH}
          alt=""
          width={64}
          height={64}
          sizes="56px"
          className={`front-store-account-cat${accountMenuAnimating ? " is-opening" : ""}`}
        />
      </span>
    </button>
  );

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
              <Link href="/login" className="front-store-icon-link front-store-notification-trigger" aria-label="เข้าสู่ระบบเพื่อดูการแจ้งเตือน">
                <Bell aria-hidden="true" />
              </Link>
            )}
          </div>

          {user ? (
            <DropdownMenu open={accountMenuOpen} onOpenChange={handleAccountMenuOpenChange}>
              <DropdownMenuTrigger asChild>
                {accountTrigger(accountMenuOpen, "menu")}
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={10}
                className="front-store-account-popover min-w-[280px] border-[#f47fbe]/70 bg-[#160d1d]/[.98] p-2 text-white shadow-[0_18px_50px_rgba(0,0,0,.48),0_0_24px_rgba(255,40,157,.22)]"
              >
                <DropdownMenuLabel className="front-store-account-summary px-3 py-2">
                  <div className="flex flex-col gap-1">
                    <span className="truncate text-sm font-bold text-white">
                      {user.displayName ?? user.email}
                    </span>
                    <span className="truncate text-xs text-[#f7c9e5]">{user.email}</span>
                    <span className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-[#ffd36b]">
                      <Coins className="size-4" aria-hidden="true" />
                      {user.points.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })} พ้อยท์
                    </span>
                    {canViewMasterPoint ? (
                      <div className="mt-2 rounded-lg border border-[#f47fbe]/25 bg-black/20 px-2.5 py-2" aria-live="polite">
                        <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-[#f7c9e5]">
                          <span className="inline-flex items-center gap-1.5"><Coins className="size-3.5 text-[#ffd36b]" aria-hidden="true" />Master Point</span>
                          <span className={masterPointStatus === "ready" ? "text-emerald-300" : masterPointStatus === "error" ? "text-rose-300" : "text-[#f7c9e5]"}>
                            {masterPointStatus === "ready" ? "ออนไลน์" : masterPointStatus === "error" ? "เชื่อมต่อไม่ได้" : "กำลังตรวจสอบ"}
                          </span>
                        </div>
                        <p className="mt-1 text-sm font-bold text-[#ffd36b]">
                          {masterPointStatus === "ready" && masterPoint !== null
                            ? `${masterPoint.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} พ้อยท์`
                            : masterPointStatus === "error" ? "ไม่สามารถดึงยอดล่าสุดได้" : "กำลังดึงยอดล่าสุด..."}
                        </p>
                        <p className="mt-1 text-[10px] font-normal text-[#f7c9e5]">อัปเดตอัตโนมัติทุก 15 วินาที</p>
                      </div>
                    ) : null}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-[#f47fbe]/25" />
                <DropdownMenuItem asChild className="front-store-account-menu-item">
                  <Link href={accountHref}>
                    {isAdmin ? <ShieldCheck aria-hidden="true" /> : <Home aria-hidden="true" />}
                    <span>{isAdmin ? "ไปหน้า Admin" : "แดชบอร์ด"}</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="front-store-account-menu-item">
                  <Link href="/dashboard/orders">
                    <History aria-hidden="true" />
                    <span>ประวัติสั่งซื้อ</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="front-store-account-menu-item">
                  <Link href="/dashboard/topup">
                    <Coins aria-hidden="true" />
                    <span>เติมพ้อยท์</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="front-store-account-menu-item">
                  <Link href="/dashboard/topup/history">
                    <FileText aria-hidden="true" />
                    <span>ประวัติการเติมเงิน</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="front-store-account-menu-item">
                  <Link href="/support/report">
                    <AlertCircle aria-hidden="true" />
                    <span>แจ้งปัญหา</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-[#f47fbe]/25" />
                <DropdownMenuItem
                  className="front-store-account-menu-item front-store-account-logout"
                  onClick={() => void handleLogout()}
                >
                  <LogOut aria-hidden="true" />
                  <span>ออกจากระบบ</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            accountTrigger(loginOpen, "dialog")
          )}

          <CustomHamburgerMenuButton
            items={primaryLinks}
            catImageSrc={ACCOUNT_CAT_ICON_PATH}
            open={menuOpen}
            onOpenChange={setMenuOpen}
            renderAdditionalItems={(closeMenu) => (
              user ? (
                <Link
                  href={accountHref}
                  role="menuitem"
                  className="front-store-hamburger-menu-item"
                  onClick={closeMenu}
                >
                  <span className="front-store-hamburger-menu-icon" aria-hidden="true">
                    {isAdmin ? <ShieldCheck /> : <UserRound />}
                  </span>
                  <span>{isAdmin ? "เข้าสู่หน้า Admin" : "บัญชีของฉัน"}</span>
                </Link>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className="front-store-hamburger-menu-item"
                  aria-haspopup="dialog"
                  aria-expanded={loginOpen}
                  onClick={() => {
                    closeMenu();
                    setLoginOpen(true);
                  }}
                >
                  <span className="front-store-hamburger-menu-icon" aria-hidden="true">
                    <ShieldCheck />
                  </span>
                  <span>เข้าสู่ระบบ</span>
                </button>
              )
            )}
          />
        </div>
      </div>

      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent
          closeLabel="ปิดหน้าต่างเข้าสู่ระบบ"
          placement="popover"
          className="front-store-login-dialog-panel"
        >
          <DialogHeader className="pr-7">
            <p className="text-xs font-bold tracking-[0.18em] text-[#a41461]">STOREBYMARI</p>
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
