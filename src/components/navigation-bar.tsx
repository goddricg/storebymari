'use client';

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import { PwaInstallDropdownMenuItem } from "@/components/pwa/pwa-install-menu-item";
import { isAdminUser } from "@/lib/auth/roles";

import CustomHamburgerMenuButton, {
  type CustomHamburgerMenuItem,
} from "@/components/ui/custom-hamburger-menu-button";

const NAV_LINKS = [
  { href: "/", label: "หน้าแรก", icon: Home },
  { href: "/products", label: "สินค้า", icon: ShoppingBag },
];

const MENU_CAT_IMAGE_PATH = "/front-store/storebymari-black-cat-account.png";

export default function NavigationBar() {
  const pathname = usePathname();
  const visibleNavLinks = pathname === "/cart" ? NAV_LINKS.filter((link) => link.href !== "/") : NAV_LINKS;
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const { user: currentUser, refreshSession } = useSession();
  const settings = usePublicSettings();
  const { isInstallable, triggerInstall } = usePwaInstall();
  const [currentHash, setCurrentHash] = useState<string>("");

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
  const hamburgerItems: CustomHamburgerMenuItem[] = currentUser
    ? [
        ...visibleNavLinks.map(({ href, label, icon: Icon }) => ({ href, label, Icon })),
        ...(isInstallable
          ? [{ label: "ติดตั้งแอป", Icon: Smartphone, onSelect: triggerInstall, tone: "accent" as const }]
          : []),
        { href: "/dashboard/topup", label: "เติมพ้อย", Icon: Coins },
        { href: "/dashboard", label: "แดชบอร์ด", Icon: Home },
        { href: "/dashboard/orders", label: "ประวัติสั่งซื้อ", Icon: History },
        { href: "/dashboard/topup/history", label: "ประวัติการเติมเงิน", Icon: FileText },
        { href: "/support/report", label: "แจ้งปัญหา", Icon: MessageSquare },
        ...(isAdminUser(currentUser)
          ? [{ href: "/admin", label: "แอดมิน", Icon: ShieldCheck, tone: "accent" as const }]
          : []),
        { label: "ออกจากระบบ", Icon: LogOut, onSelect: handleLogout, tone: "accent" },
      ]
    : [
        ...visibleNavLinks.map(({ href, label, icon: Icon }) => ({ href, label, Icon })),
        { href: "/register", label: "สมัครสมาชิก", Icon: User },
        { href: "/login", label: "เข้าสู่ระบบ", Icon: LogOut, tone: "accent" as const },
        ...(isInstallable
          ? [{ label: "ติดตั้งแอป", Icon: Smartphone, onSelect: triggerInstall, tone: "accent" as const }]
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
            {!isDreamyPublicPage && settings.site_name ? (
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
          </div>
          <CustomHamburgerMenuButton
            items={hamburgerItems}
            catImageSrc={MENU_CAT_IMAGE_PATH}
            open={isOpen}
            onOpenChange={setIsOpen}
          />
        </nav>
      </div>
    </header>
  );
}

