'use client';

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Fragment, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  Menu,
  X,
  LogOut,
  Home,
  ShoppingBag,
  History,
  User,
  Coins,
  FileText,
  MessageSquare,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/lib/auth/use-session";
import LogoImage from "@/components/logo-image";
import SupportNotificationBell from "@/components/admin/support-notification-bell";
import CustomerNotificationBell from "@/components/notifications/customer-notification-bell";
import { usePublicSettings } from "@/components/public-settings-provider";
import { DreamyOrnament } from "@/components/dreamy-ui/ornaments";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { clearAppBadge } from "@/lib/ui/badging";
import { usePwaInstall } from "@/components/pwa/pwa-install-provider";
import {
  PwaInstallDropdownMenuItem,
  PwaInstallMobileDrawerItem,
} from "@/components/pwa/pwa-install-menu-item";
import { isAdminUser } from "@/lib/auth/roles";

const NAV_LINKS = [
  { href: "/", label: "หน้าแรก", icon: Home },
  { href: "/products", label: "สินค้า", icon: ShoppingBag },
];

type MobileRadialItem = {
  href?: string;
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  tone?: "accent" | "default";
};

function MobileRadialMenu({
  isOpen,
  items,
  currentUser,
  onClose,
}: {
  isOpen: boolean;
  items: MobileRadialItem[];
  currentUser: ReturnType<typeof useSession>["user"];
  onClose: () => void;
}) {
  const itemTop = currentUser ? 118 : 76;

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence initial={false}>
      {isOpen ? (
        <Fragment key="mobile-radial-menu">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-auto fixed inset-0 z-[55] bg-black/50 lg:hidden"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            key="mobile-radial-navigation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-x-0 bottom-0 top-0 z-[60] lg:hidden"
            aria-label="เมนูนำทางแบบวงโค้ง"
          >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, x: 24, y: -12 }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, x: 24, y: -12 }}
            transition={{ type: "spring", stiffness: 560, damping: 32, mass: 0.72 }}
            onClick={onClose}
            className="pointer-events-auto absolute inset-x-0 bottom-0 top-0 overflow-hidden"
          >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label="ปิดเมนู"
            className="pointer-events-auto absolute right-3 top-3 z-20 flex size-11 items-center justify-center rounded-full border border-[#f3a4c0]/80 bg-white/95 text-[#d85a86] shadow-[0_8px_22px_rgba(211,78,126,0.2)] backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-color)]"
          >
            <X className="size-5" />
          </button>

          <div
            className="absolute inset-x-0 bottom-0 top-16 overflow-y-auto overscroll-contain px-2 pb-10 touch-pan-y"
            aria-label="รายการเมนูแบบวงโค้ง เลื่อนเพื่อดูรายการเพิ่มเติม"
          >
            <div
              className="relative w-full"
              style={{ minHeight: `${itemTop + items.length * 96 + 80}px` }}
            >
            {currentUser ? (
              <div
                className="absolute right-5 top-3 z-10 w-[min(18rem,calc(100%-2.5rem))] rounded-2xl border border-[#f3a4c0]/65 bg-white/92 px-4 py-3 text-right shadow-[0_8px_22px_rgba(211,78,126,0.14)] backdrop-blur-md"
                onClick={(event) => event.stopPropagation()}
              >
                <p className="truncate text-sm font-semibold text-[#7f485c]">
                  {currentUser.displayName ?? currentUser.email}
                </p>
                <p className="truncate text-xs text-[#9a6b78]">{currentUser.email}</p>
                <div className="mt-2 flex items-center justify-end gap-2 text-sm font-semibold text-[#e2882a]">
                  <Coins className="size-4" />
                  {currentUser.points.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>
            ) : null}

              {items.map((item, index) => {
              const Icon = item.icon;
              const t = items.length <= 1 ? 0.5 : index / (items.length - 1);
              const rightOffset = 18 + Math.round(126 * Math.sin(t * Math.PI));
              const itemStyle = {
                top: `${itemTop + index * 96}px`,
                right: `${rightOffset}px`,
              };
              const contentClassName = cn(
                "flex min-h-16 w-[min(10.5rem,calc(100vw-7rem))] items-center gap-3 rounded-2xl border border-[#f3a4c0]/80 bg-white/95 px-4 py-3 text-sm font-semibold text-[#7f485c] shadow-[0_8px_22px_rgba(211,78,126,0.18)] backdrop-blur-md transition-colors hover:border-[#e979a2] hover:text-[var(--theme-color)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-color)]",
                item.tone === "accent" && "border-[#ee80a8] bg-[#fff1f6] text-[var(--theme-color)]"
              );

              return (
                <motion.div
                  key={`${item.href ?? "action"}-${item.label}`}
                  initial={{ opacity: 0, scale: 0.72, x: 42, y: -14 }}
                  animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                  exit={{ opacity: 0, scale: 0.72, x: 42, y: -14 }}
                  transition={{
                    type: "spring",
                    stiffness: 680,
                    damping: 34,
                    mass: 0.66,
                    delay: index * 0.025,
                  }}
                  className="absolute"
                  style={itemStyle}
                >
                  {item.href ? (
                    <Link
                      href={item.href}
                      onClick={(event) => {
                        event.stopPropagation();
                        onClose();
                      }}
                      className={contentClassName}
                    >
                      <Icon className="size-6 shrink-0 text-[#e979a2]" />
                      <span className="leading-tight">{item.label}</span>
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        item.onClick?.();
                        onClose();
                      }}
                      className={contentClassName}
                    >
                      <Icon className="size-6 shrink-0 text-[#e979a2]" />
                      <span className="leading-tight">{item.label}</span>
                    </button>
                  )}
                </motion.div>
              );
              })}
            </div>
          </div>
        </motion.div>
          </motion.div>
        </Fragment>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

export default function NavigationBar() {
  const isMainSite = process.env.NEXT_PUBLIC_SITE_ID === "main";
  const pathname = usePathname();
  const visibleNavLinks = pathname === "/cart" ? NAV_LINKS.filter((link) => link.href !== "/") : NAV_LINKS;
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const { user: currentUser, isLoading: isLoadingSession, refreshSession } = useSession();
  const settings = usePublicSettings();
  const { isInstallable, triggerInstall } = usePwaInstall();
  const [currentHash, setCurrentHash] = useState<string>("");

  const handleToggle = () => setIsOpen((prev) => !prev);
  const closeMenu = () => setIsOpen(false);

  // Listen for custom auth events (login/register/logout)
  useEffect(() => {
    const handleAuthChange = () => {
      refreshSession();
    };

    window.addEventListener("auth:session-changed", handleAuthChange);
    return () => {
      window.removeEventListener("auth:session-changed", handleAuthChange);
    };
  }, [refreshSession]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateHash = () => {
      setCurrentHash(pathname === "/" ? window.location.hash : "");
    };
    const frameId = window.requestAnimationFrame(updateHash);
    window.addEventListener("hashchange", updateHash);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("hashchange", updateHash);
    };
  }, [pathname]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const isLinkActive = (href: string) => {
    if (href === "/") {
      return pathname === "/" && (!currentHash || currentHash === "" || currentHash === "#hero");
    }
    if (href.startsWith("/#")) {
      if (pathname !== "/") return false;
      const hash = href.replace("/", "");
      if (!currentHash && hash === "#hero") return true;
      return currentHash === hash;
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const handleLogout = async () => {
    clearAppBadge();
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    
    // Dispatch custom event to notify Navbar to reload session
    window.dispatchEvent(new Event("auth:session-changed"));
    
    toast.success("ออกจากระบบสำเร็จ");
    router.refresh();
    closeMenu();
  };

  const isLoginPage = pathname === "/login";
  const isDreamyPublicPage = pathname === "/" || pathname.startsWith("/products");
  const mobileRadialItems: MobileRadialItem[] = currentUser
    ? [
        ...visibleNavLinks,
        ...(isInstallable
          ? [{ label: "ติดตั้งแอป", icon: Smartphone, onClick: triggerInstall, tone: "accent" as const }]
          : []),
        { href: "/dashboard/topup", label: "เติมพ้อย", icon: Coins },
        { href: "/dashboard", label: "แดชบอร์ด", icon: Home },
        { href: "/dashboard/orders", label: "ประวัติสั่งซื้อ", icon: History },
        { href: "/dashboard/topup/history", label: "ประวัติการเติมเงิน", icon: FileText },
        { href: "/support/report", label: "แจ้งปัญหา", icon: MessageSquare },
        ...(currentUser.isAdmin
          ? [{ href: "/admin", label: "แอดมิน", icon: ShieldCheck, tone: "accent" as const }]
          : []),
        { label: "ออกจากระบบ", icon: LogOut, onClick: handleLogout, tone: "accent" },
      ]
    : [
        ...visibleNavLinks,
        { href: "/register", label: "สมัครสมาชิก", icon: User },
        { href: "/login", label: "เข้าสู่ระบบ", icon: LogOut, tone: "accent" as const },
        ...(isInstallable
          ? [{ label: "ติดตั้งแอป", icon: Smartphone, onClick: triggerInstall, tone: "accent" as const }]
          : []),
      ];

  if (pathname === "/") return null;

  return (
    <header data-site-global-navigation className={cn(
      "z-40 w-full transition-all",
      isDreamyPublicPage && "dreamy-navbar",
      isLoginPage
        ? "absolute top-0 left-0 border-b-0 bg-transparent shadow-none backdrop-blur-none"
        : isDreamyPublicPage
          ? "sticky top-0 border-b border-white/70 bg-[var(--theme-color-nav)]/20 shadow-[0_8px_28px_rgba(211,78,126,0.12)] backdrop-blur-xl"
          : "sticky top-0 border-b border-white/30 bg-[var(--theme-color-nav)]/35 shadow-[0_4px_12px_rgba(0,0,0,0.08)] backdrop-blur-xl dark:bg-[var(--theme-color-nav)]/35"
    )}>
      {isDreamyPublicPage ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <DreamyOrnament
            kind="sparkle"
            className="absolute left-[28%] top-2 size-5 opacity-75"
          />
          <DreamyOrnament
            kind="star"
            className="absolute left-[52%] top-4 hidden size-5 rotate-12 opacity-70 sm:block"
          />
          <DreamyOrnament
            kind="cloud"
            className="absolute right-3 top-7 hidden size-10 opacity-65 md:block"
          />
          <DreamyOrnament
            kind="heart"
            className="absolute left-[72%] top-2 hidden size-5 -rotate-12 opacity-60 lg:block"
          />
        </div>
      ) : null}
      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-10">
        <nav className="flex items-center justify-between py-3">
          <Link
            href="/"
            className="dreamy-brand-lockup flex min-w-0 items-center gap-2 sm:gap-3"
            onClick={closeMenu}
            aria-label={`${settings.site_name || "Home"}`}
          >
            <LogoImage />
            {isDreamyPublicPage ? (
              <motion.span
                initial={{ opacity: 0, y: 4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
                className="block min-w-0"
              >
                <Image
                  src="/ui/appbymari-dreamy/app-by-mari-wordmark.png"
                  alt="App By Mari"
                  width={1667}
                  height={323}
                  priority
                  unoptimized
                  sizes="(max-width: 480px) 150px, (max-width: 1024px) 220px, 300px"
                  className="dreamy-brand-wordmark dreamy-brand-wordmark-default h-8 w-auto object-contain sm:h-11 lg:h-[52px]"
                />
                <Image
                  src="/ui/appbymari-halloween/wordmark-night-orange.png"
                  alt="App By Mari Halloween Night"
                  width={2158}
                  height={729}
                  priority
                  unoptimized
                  sizes="(max-width: 480px) 150px, (max-width: 1024px) 220px, 300px"
                  className="dreamy-brand-wordmark dreamy-brand-wordmark-halloween-night h-8 w-auto object-contain sm:h-11 lg:h-[52px]"
                />
              </motion.span>
            ) : settings.site_name ? (
              <span className="text-lg font-bold text-[var(--theme-color)] hidden sm:block">
                {settings.site_name}
              </span>
            ) : null}
          </Link>
          <div
            className={cn(
              "hidden items-center gap-6 text-base font-medium text-[#333333] lg:flex",
              isDreamyPublicPage &&
                "dreamy-nav-pill rounded-full border border-white/75 bg-white/55 px-6 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_8px_22px_rgba(211,78,126,0.1)]"
            )}
          >
            {visibleNavLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "transition-colors hover:text-[var(--theme-color)]",
                    isLinkActive(link.href) ? "text-[var(--theme-color)]" : "text-[#9a5832]"
                  )}
                  onClick={closeMenu}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="size-5" />
                    {link.label}
                  </span>
                </Link>
              );
            })}
            <ThemeToggle />
            {currentUser ? (
              isAdminUser(currentUser) ? (
                <SupportNotificationBell user={currentUser} />
              ) : (
                <CustomerNotificationBell user={currentUser} />
              )
            ) : (
              <CustomerNotificationBell user={null} />
            )}
            {currentUser ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button aria-label="โปรไฟล์" className="rounded-full outline-none ring-0">
                    <Avatar>
                      <AvatarFallback className="bg-[var(--theme-color)]/10 text-[#9a5832]">
                        <User className="size-5" />
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-[#0B0B0B]">
                          {currentUser.displayName ?? currentUser.email}
                        </span>
                        <span className="text-xs text-[#6B7280]">{currentUser.email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-[#FFD700] to-[#FFA500] shadow-md">
                          <Coins className="size-4 text-white" />
                        </div>
                        <span className="text-lg font-semibold text-[#FF8C00]">
                          {currentUser.points.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <Link
                        href="/dashboard/topup"
                        className="flex h-9 items-center justify-center rounded-lg bg-[var(--theme-color)] text-sm font-semibold text-white transition-colors hover:bg-[var(--theme-color)]"
                        onClick={(e) => {
                          e.stopPropagation();
                          closeMenu();
                        }}
                      >
                        เติมพ้อย
                      </Link>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    asChild
                    className="cursor-pointer px-3 py-2 text-sm focus:bg-[var(--theme-color)]/10 focus:text-[var(--theme-color)]"
                  >
                    <Link href="/dashboard" className="flex items-center gap-2">
                      <Home className="size-4" /> แดชบอร์ด
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    asChild
                    className="cursor-pointer px-3 py-2 text-sm focus:bg-[var(--theme-color)]/10 focus:text-[var(--theme-color)]"
                  >
                    <Link href="/dashboard/orders" className="flex items-center gap-2">
                      <History className="size-4" /> ประวัติสั่งซื้อ
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    asChild
                    className="cursor-pointer px-3 py-2 text-sm focus:bg-[var(--theme-color)]/10 focus:text-[var(--theme-color)]"
                  >
                    <Link href="/dashboard/topup/history" className="flex items-center gap-2">
                      <FileText className="size-4" /> ประวัติการเติมเงิน
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    asChild
                    className="cursor-pointer px-3 py-2 text-sm focus:bg-[var(--theme-color)]/10 focus:text-[var(--theme-color)]"
                  >
                    <Link href="/support/report" className="flex items-center gap-2">
                      <MessageSquare className="size-4" /> แจ้งปัญหา
                    </Link>
                  </DropdownMenuItem>
                  <PwaInstallDropdownMenuItem />
                  {currentUser.isAdmin ? (
                    <DropdownMenuItem
                      asChild
                      className="cursor-pointer px-3 py-2 text-sm focus:bg-[var(--theme-color)]/10 focus:text-[var(--theme-color)]"
                    >
                      <Link href="/admin">แอดมิน</Link>
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="cursor-pointer px-3 py-2 text-sm text-[var(--theme-color)] focus:bg-[var(--theme-color)]/10 focus:text-[var(--theme-color)]"
                  >
                    <LogOut className="mr-2 size-4" /> ออกจากระบบ
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button aria-label="เมนูผู้ใช้" className="rounded-full outline-none ring-0">
                    <Avatar>
                      <AvatarFallback className="bg-[var(--theme-color)]/10 text-[#9a5832]">
                        <User className="size-5" />
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-48">
                  <DropdownMenuItem
                    asChild
                    className="px-3 py-2 text-sm focus:bg-[var(--theme-color)]/10 focus:text-[var(--theme-color)]"
                  >
                    <Link href="/login">เข้าสู่ระบบ</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    asChild
                    className="px-3 py-2 text-sm focus:bg-[var(--theme-color)]/10 focus:text-[var(--theme-color)]"
                  >
                    <Link href="/register">สมัครสมาชิก</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <PwaInstallDropdownMenuItem />
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <div className="flex items-center gap-1 lg:hidden">
            <ThemeToggle />
            {currentUser ? (
              isAdminUser(currentUser) ? (
                <SupportNotificationBell user={currentUser} />
              ) : (
                <CustomerNotificationBell user={currentUser} />
              )
            ) : (
              <CustomerNotificationBell user={null} />
            )}
            <Button
              variant="ghost"
              size="icon"
              className="flex size-10 items-center justify-center rounded-xl text-[#9a5832] hover:bg-[var(--theme-color)]/10 hover:text-[var(--theme-color)]"
              onClick={handleToggle}
              aria-label="เปิดเมนูนำทาง"
            >
              {isOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </Button>
          </div>
        </nav>
      </div>
      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && !isMainSite && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[55] bg-black/50 lg:hidden"
            onClick={closeMenu}
          />
        )}
      </AnimatePresence>

      {isMainSite ? (
        <MobileRadialMenu
          isOpen={isOpen}
          items={mobileRadialItems}
          currentUser={currentUser}
          onClose={closeMenu}
        />
      ) : (
        <AnimatePresence>
        {isOpen && (
          <motion.div
            key="mobile-nav"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 z-[60] h-[100dvh] w-[85vw] max-w-sm bg-white shadow-[0_0_24px_rgba(0,0,0,0.15)] lg:hidden"
          >
            <div className="flex h-full flex-col">
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-[#E5E7EB] px-4 py-4">
                <h2 className="text-lg font-semibold text-[#0B0B0B]">เมนู</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={closeMenu}
                  className="rounded-full"
                  aria-label="ปิดเมนู"
                >
                  <X className="size-5" />
                </Button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto px-4 py-4 pb-12">
                <div className="flex flex-col gap-2 text-base font-medium text-[#0B0B0B]">
                  {visibleNavLinks.map((link) => {
                    const Icon = link.icon;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-4 py-4 transition-colors hover:bg-[var(--theme-color)]/10 hover:text-[var(--theme-color)]",
                          isLinkActive(link.href) ? "bg-[var(--theme-color)]/10 text-[var(--theme-color)]" : "text-[#9a5832]"
                        )}
                        onClick={closeMenu}
                      >
                        <Icon className="size-6" />
                        <span className="font-medium">{link.label}</span>
                      </Link>
                    );
                  })}
                </div>
                {currentUser ? (
                  <>
                    {/* User Info */}
                    <div className="mb-4 rounded-2xl bg-[#F9FAFB] p-4">
                      <div className="mb-3 flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-full bg-[var(--theme-color)]/10 text-[var(--theme-color)]">
                          <User className="size-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-semibold text-[#0B0B0B]">
                            {currentUser.displayName ?? currentUser.email}
                          </p>
                          <p className="truncate text-xs text-[#6B7280]">{currentUser.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-3">
                        <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-[#FFD700] to-[#FFA500] shadow-md">
                          <Coins className="size-4 text-white" />
                        </div>
                        <span className="text-lg font-semibold text-[#FF8C00]">
                          {currentUser.points.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <Link
                        href="/dashboard/topup"
                        className="mt-3 flex h-10 items-center justify-center rounded-xl bg-[var(--theme-color)] text-sm font-semibold text-white transition-colors hover:bg-[var(--theme-color)]"
                        onClick={closeMenu}
                      >
                        เติมพ้อย
                      </Link>
                    </div>

                    {/* Menu Items */}
                    <div className="space-y-2">
                      {currentUser.isAdmin && (
                        <Link
                          href="/admin"
                          className="flex items-center gap-3 rounded-xl border border-[var(--theme-color)]/40 bg-[#fff4ed] px-4 py-4 text-base font-semibold text-[var(--theme-color)] transition-colors hover:border-[var(--theme-color)] hover:bg-[#fff4ed]"
                          onClick={closeMenu}
                        >
                          <ShieldCheck className="size-6" />
                          <span>แอดมิน</span>
                        </Link>
                      )}
                      <Link
                        href="/dashboard"
                        className="flex items-center gap-3 rounded-xl px-4 py-4 text-base text-[#9a5832] transition-colors hover:bg-[var(--theme-color)]/10 hover:text-[var(--theme-color)]"
                        onClick={closeMenu}
                      >
                        <Home className="size-6" />
                        <span className="font-medium">แดชบอร์ด</span>
                      </Link>
                      <Link
                        href="/dashboard/orders"
                        className="flex items-center gap-3 rounded-xl px-4 py-4 text-base text-[#9a5832] transition-colors hover:bg-[var(--theme-color)]/10 hover:text-[var(--theme-color)]"
                        onClick={closeMenu}
                      >
                        <History className="size-6" />
                        <span className="font-medium">ประวัติสั่งซื้อ</span>
                      </Link>
                      <Link
                        href="/dashboard/topup/history"
                        className="flex items-center gap-3 rounded-xl px-4 py-4 text-base text-[#9a5832] transition-colors hover:bg-[var(--theme-color)]/10 hover:text-[var(--theme-color)]"
                        onClick={closeMenu}
                      >
                        <FileText className="size-6" />
                        <span className="font-medium">ประวัติการเติมเงิน</span>
                      </Link>
                      <Link
                        href="/support/report"
                        className="flex items-center gap-3 rounded-xl px-4 py-4 text-base text-[#9a5832] transition-colors hover:bg-[var(--theme-color)]/10 hover:text-[var(--theme-color)]"
                        onClick={closeMenu}
                      >
                        <MessageSquare className="size-6" />
                        <span className="font-medium">แจ้งปัญหา</span>
                      </Link>
                      <PwaInstallMobileDrawerItem onSelect={closeMenu} />
                    </div>
                  </>
                ) : (
                  <div className="mt-4 space-y-2">
                    <Link
                      href="/register"
                      className="flex h-11 items-center justify-center rounded-xl bg-[var(--theme-color)] text-base font-semibold text-white transition-colors hover:bg-[var(--theme-color)]"
                      onClick={closeMenu}
                    >
                      สมัครสมาชิก
                    </Link>
                    <Link
                      href="/login"
                      className="flex h-11 items-center justify-center rounded-xl border border-[var(--theme-color)]/40 text-[var(--theme-color)] transition-colors hover:border-[var(--theme-color)] hover:bg-[var(--theme-color)]/10 hover:text-[var(--theme-color)]"
                      onClick={closeMenu}
                    >
                      เข้าสู่ระบบ
                    </Link>
                    <PwaInstallMobileDrawerItem
                      onSelect={closeMenu}
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--theme-color)]/40 text-[var(--theme-color)] transition-colors hover:bg-[var(--theme-color)]/10 text-sm font-medium"
                    />
                  </div>
                )}

                {/* Logout Button (if logged in) */}
                {currentUser && (
                  <div className="mt-auto border-t border-[#E5E7EB] pt-4">
                    <Button
                      className="h-11 w-full rounded-xl bg-[var(--theme-color)] text-base font-semibold text-white transition-colors hover:bg-[var(--theme-color)]"
                      onClick={handleLogout}
                      disabled={isLoadingSession}
                    >
                      <LogOut className="mr-2 size-4" /> ออกจากระบบ
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      )}
    </header>
  );
}

