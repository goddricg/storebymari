'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth/use-session";
import LogoImage from "@/components/logo-image";
import SupportNotificationBell from "@/components/admin/support-notification-bell";
import CustomerNotificationBell from "@/components/notifications/customer-notification-bell";
import { usePublicSettings } from "@/components/public-settings-provider";
import { DreamyOrnament } from "@/components/dreamy-ui/ornaments";
import StorefrontAccountMenuButton from "@/components/storefront-account-menu-button";
import { isAdminUser } from "@/lib/auth/roles";

const NAV_LINKS = [
  { href: "/", label: "หน้าแรก", icon: Home },
  { href: "/products", label: "สินค้า", icon: ShoppingBag },
] as const;

export default function NavigationBar() {
  const pathname = usePathname();
  const visibleNavLinks = pathname === "/cart"
    ? NAV_LINKS.filter((link) => link.href !== "/")
    : NAV_LINKS;
  const { user: currentUser } = useSession();
  const settings = usePublicSettings();
  const [currentHash, setCurrentHash] = useState<string>("");

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

  const isLoginPage = pathname === "/login";
  const isDreamyPublicPage = pathname === "/" || pathname.startsWith("/products");

  // The homepage owns its own full storefront header. All other routes use
  // this shared header and the same cat account-menu control.
  if (pathname === "/") return null;

  return (
    <header
      data-site-global-navigation
      className={cn(
        "z-40 w-full transition-all",
        isDreamyPublicPage && "dreamy-navbar",
        isLoginPage
          ? "absolute left-0 top-0 border-b-0 bg-transparent shadow-none backdrop-blur-none"
          : isDreamyPublicPage
            ? "sticky top-0 border-b border-white/70 bg-[var(--theme-color-nav)]/20 shadow-[0_8px_28px_rgba(211,78,126,0.12)] backdrop-blur-xl"
            : "sticky top-0 border-b border-white/30 bg-[var(--theme-color-nav)]/35 shadow-[0_4px_12px_rgba(0,0,0,0.08)] backdrop-blur-xl dark:bg-[var(--theme-color-nav)]/35",
      )}
    >
      {isDreamyPublicPage ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <DreamyOrnament kind="sparkle" className="absolute left-[28%] top-2 size-5 opacity-75" />
          <DreamyOrnament kind="star" className="absolute left-[52%] top-4 hidden size-5 rotate-12 opacity-70 sm:block" />
          <DreamyOrnament kind="cloud" className="absolute right-3 top-7 hidden size-10 opacity-65 md:block" />
          <DreamyOrnament kind="heart" className="absolute left-[72%] top-2 hidden size-5 -rotate-12 opacity-60 lg:block" />
        </div>
      ) : null}

      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-10">
        <nav className="flex items-center justify-between gap-3 py-3">
          <Link
            href="/"
            className="dreamy-brand-lockup flex min-w-0 items-center gap-2 sm:gap-3"
            aria-label={`${settings.site_name || "Home"}`}
          >
            <LogoImage />
            {!isDreamyPublicPage && settings.site_name ? (
              <span className="hidden text-lg font-bold text-[var(--theme-color)] sm:block">
                {settings.site_name}
              </span>
            ) : null}
          </Link>

          <div
            className={cn(
              "hidden items-center gap-4 text-base font-medium text-[#333333] lg:flex",
              isDreamyPublicPage &&
                "dreamy-nav-pill rounded-full border border-white/75 bg-white/55 px-5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_8px_22px_rgba(211,78,126,0.1)]",
            )}
          >
            {visibleNavLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "whitespace-nowrap transition-colors hover:text-[var(--theme-color)]",
                    isLinkActive(link.href) ? "text-[var(--theme-color)]" : "text-[#9a5832]",
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="size-5" aria-hidden="true" />
                    {link.label}
                  </span>
                </Link>
              );
            })}
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

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 lg:gap-3">
            <div className="lg:hidden">
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
            <StorefrontAccountMenuButton />
          </div>
        </nav>
      </div>
    </header>
  );
}
