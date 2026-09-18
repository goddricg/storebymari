'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth/use-session";
import LogoImage from "@/components/logo-image";
import SupportNotificationBell from "@/components/admin/support-notification-bell";
import CustomerNotificationBell from "@/components/notifications/customer-notification-bell";
import { usePublicSettings } from "@/components/public-settings-provider";
import { DreamyOrnament } from "@/components/dreamy-ui/ornaments";
import StorefrontAccountMenuButton from "@/components/storefront-account-menu-button";
import StorefrontPrimaryNav from "@/components/storefront-primary-nav";
import { isAdminUser } from "@/lib/auth/roles";

export default function NavigationBar() {
  const pathname = usePathname();
  const { user: currentUser } = useSession();
  const settings = usePublicSettings();

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

          <div className="hidden items-center lg:flex">
            <StorefrontPrimaryNav />
          </div>

          <div className="front-store-header-actions ml-auto">
            {currentUser ? (
              isAdminUser(currentUser) ? (
                <SupportNotificationBell user={currentUser} />
              ) : (
                <CustomerNotificationBell user={currentUser} />
              )
            ) : (
              <CustomerNotificationBell user={null} />
            )}
            <StorefrontAccountMenuButton />
          </div>
        </nav>
      </div>
    </header>
  );
}
