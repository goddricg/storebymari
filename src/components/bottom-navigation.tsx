'use client';

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Heart,
  Home,
  MessageSquare,
  ShoppingBag,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth/use-session";
import { DreamyOrnament } from "@/components/dreamy-ui/ornaments";
import { triggerHaptic } from "@/lib/ui/haptics";
import { getSiteId } from "@/lib/site";

type BottomNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  requiresAuth?: boolean;
};

type RadialNavItem = BottomNavItem & {
  x: number;
  y: number;
};

const NAV_ITEMS: BottomNavItem[] = [
  { href: "/dashboard/topup", label: "เติมพ้อยท์", icon: Wallet, requiresAuth: true },
  { href: "/products", label: "ซื้อแอพ", icon: ShoppingBag },
  { href: "/", label: "หน้าหลัก", icon: Home },
  { href: "/dashboard/orders", label: "ประวัติ", icon: Bell, requiresAuth: true },
  { href: "/dashboard", label: "บัญชี", icon: UserRound, requiresAuth: true },
];

// The six actions orbit the raised home action without changing any existing route.
const RADIAL_ITEMS: RadialNavItem[] = [
  { ...NAV_ITEMS[0], x: -92, y: -42 },
  { ...NAV_ITEMS[1], x: 92, y: -42 },
  { ...NAV_ITEMS[2], x: 0, y: -176 },
  { ...NAV_ITEMS[3], x: -92, y: -136 },
  { ...NAV_ITEMS[4], x: 92, y: -136 },
  { href: "/support/report", label: "แจ้งปัญหา", icon: MessageSquare, requiresAuth: true, x: 0, y: -22 },
];

function LegacyBottomNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { user: currentUser } = useSession();
  const navRef = useRef<HTMLDivElement | null>(null);

  const updateBodyOffset = useCallback(() => {
    if (typeof window === "undefined") return;

    if (window.innerWidth >= 768 || !navRef.current) {
      document.body.style.removeProperty("--mobile-bottom-nav-offset");
      return;
    }

    document.body.style.setProperty(
      "--mobile-bottom-nav-offset",
      `${navRef.current.offsetHeight}px`
    );
  }, []);

  const activeIndex = useMemo(
    () => NAV_ITEMS.findIndex((item) => isItemActive(pathname, item.href)),
    [pathname]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => updateBodyOffset();
    const id = window.requestAnimationFrame(() => updateBodyOffset());
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.cancelAnimationFrame(id);
      document.body.style.removeProperty("--mobile-bottom-nav-offset");
    };
  }, [updateBodyOffset]);

  useEffect(() => {
    updateBodyOffset();
  }, [activeIndex, updateBodyOffset]);

  return (
    <AnimatePresence initial={false}>
      <motion.nav
        data-site-global-bottom-navigation
        initial={{ y: 120, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 120, opacity: 0 }}
        transition={{ type: "spring", stiffness: 140, damping: 20 }}
        className="fixed inset-x-0 bottom-0 z-50 block md:hidden"
        aria-label="เมนูหลักสำหรับมือถือ"
      >
        <div
          ref={navRef}
          className="relative border-t border-white/80 bg-gradient-to-t from-[#fff3f8] via-white/95 to-[#ffeaf2]/88 shadow-[0_-10px_28px_rgba(211,78,126,0.14)] backdrop-blur-xl dark:border-white/10 dark:from-[#141414] dark:via-[#0F0F0F]/95 dark:to-[#141414]/70"
        >
          <DreamyOrnament
            kind="sparkle"
            className="pointer-events-none absolute left-[18%] top-1 size-4 opacity-65"
          />
          <DreamyOrnament
            kind="heart"
            className="pointer-events-none absolute right-[18%] top-1 size-4 rotate-12 opacity-55"
          />
          <div
            className="mx-auto flex h-full max-w-xl items-end justify-between px-2"
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.45rem)",
              paddingTop: "0.65rem",
            }}
          >
            {NAV_ITEMS.map((item, index) => {
              const Icon = item.icon;
              const isActive = activeIndex === index;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-1 text-[11px] font-semibold text-[#9a5832] transition-all hover:text-[var(--theme-color)]",
                    isActive && "text-[var(--theme-color)]"
                  )}
                  prefetch
                  aria-current={isActive ? "page" : undefined}
                  onClick={(event) => {
                    triggerHaptic("light");
                    if (item.requiresAuth && !currentUser) {
                      event.preventDefault();
                      router.push(`/login?redirect=${encodeURIComponent(item.href)}`);
                    }
                  }}
                >
                  <div className="relative flex h-11 w-full items-center justify-center">
                    <AnimatePresence>
                      {isActive && (
                        <motion.span
                          layoutId="legacy-mobile-bottom-nav-active"
                          className="absolute inset-y-0 w-full rounded-2xl border border-white/80 bg-[var(--theme-color)]/12 shadow-[inset_0_1px_0_white,0_5px_14px_rgba(211,78,126,0.18)]"
                          transition={{ type: "spring", stiffness: 260, damping: 28 }}
                        />
                      )}
                    </AnimatePresence>
                    <Icon className="relative size-5" strokeWidth={isActive ? 2.4 : 2.1} />
                  </div>
                  <span className="relative select-none">
                    {isActive ? (
                      <motion.span
                        layoutId="legacy-mobile-bottom-nav-label"
                        className="rounded-full bg-[var(--theme-color)]/10 px-2 py-0.5 text-[var(--theme-color)]"
                        transition={{ type: "spring", stiffness: 260, damping: 28 }}
                      >
                        {item.label}
                      </motion.span>
                    ) : (
                      item.label
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </motion.nav>
    </AnimatePresence>
  );
}

function isItemActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function BottomNavigation() {
  const isMainSite = getSiteId() === "main";
  const pathname = usePathname();
  const router = useRouter();
  const { user: currentUser } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const navRef = useRef<HTMLDivElement | null>(null);

  const updateBodyOffset = useCallback(() => {
    if (typeof window === "undefined") return;

    const isMobileOrTablet = isMainSite && window.innerWidth < 1024;

    if (!isMobileOrTablet || !navRef.current) {
      document.body.style.removeProperty("--mobile-bottom-nav-offset");
      return;
    }

    document.body.style.setProperty(
      "--mobile-bottom-nav-offset",
      `${navRef.current.offsetHeight}px`
    );
  }, [isMainSite]);

  const activeIndex = useMemo(
    () => NAV_ITEMS.findIndex((item) => isItemActive(pathname, item.href)),
    [pathname]
  );

  const handleItemClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, item: BottomNavItem) => {
      triggerHaptic("light");
      if (item.requiresAuth && !currentUser) {
        setIsOpen(false);
        event.preventDefault();
        router.push(`/login?redirect=${encodeURIComponent(item.href)}`);
        return;
      }

      // Let the anchor's native navigation start before unmounting the radial menu.
      window.setTimeout(() => setIsOpen(false), 0);
    },
    [currentUser, router]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isMainSite) return;

    const handleResize = () => updateBodyOffset();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    const id = window.requestAnimationFrame(() => updateBodyOffset());
    window.addEventListener("resize", handleResize);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleKeyDown);
      window.cancelAnimationFrame(id);
      document.body.style.removeProperty("--mobile-bottom-nav-offset");
    };
  }, [isMainSite, updateBodyOffset]);

  useEffect(() => {
    if (!isMainSite) return;
    updateBodyOffset();
  }, [activeIndex, isMainSite, updateBodyOffset]);

  if (!isMainSite) {
    return <LegacyBottomNavigation />;
  }

  const homeItem = NAV_ITEMS[2];

  return (
    <AnimatePresence initial={false}>
      <motion.nav
        data-site-global-bottom-navigation
        initial={{ y: 120, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 120, opacity: 0 }}
        transition={{ type: "spring", stiffness: 140, damping: 20 }}
        className="fixed inset-x-0 bottom-0 z-50 block lg:hidden"
        aria-label="เมนูหลักสำหรับมือถือ"
      >
        <div
          ref={navRef}
          className="relative"
        >
          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.75 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.75 }}
                transition={{ duration: 0.18 }}
                className="pointer-events-none absolute left-1/2 top-1/2 z-0 size-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/55 bg-[#fff6fa]/35 shadow-[0_0_45px_rgba(245,122,162,0.16)]"
                aria-hidden="true"
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {isOpen && (
              <div
                id="mobile-radial-menu"
                className="pointer-events-none absolute inset-x-0 bottom-0 z-40 h-[260px]"
                aria-label="เมนูทางลัด"
              >
                {RADIAL_ITEMS.map((item, index) => {
                  const Icon = item.icon;
                  const isActive = isItemActive(pathname, item.href);

                  return (
                    <motion.div
                      key={`${item.href}-${item.label}`}
                      initial={{ opacity: 0, scale: 0.68, x: 0, y: 0 }}
                      animate={{ opacity: 1, scale: 1, x: item.x, y: item.y }}
                      exit={{ opacity: 0, scale: 0.68, x: 0, y: 0 }}
                      transition={{
                        type: "spring",
                        stiffness: 520,
                        damping: 30,
                        delay: index * 0.012,
                      }}
                      className="pointer-events-auto absolute left-1/2 top-1/2"
                      style={{ marginLeft: "-46px", marginTop: "-46px" }}
                    >
                      <Link
                        href={item.href}
                        prefetch
                        aria-current={isActive ? "page" : undefined}
                        aria-label={item.label}
                        onClick={(event) => handleItemClick(event, item)}
                        className={cn(
                          "flex w-[5.75rem] flex-col items-center gap-1 rounded-2xl border border-[#f3a4c0]/75 bg-white/92 px-1 py-2 text-[11px] font-semibold text-[#9a5832] shadow-[0_7px_18px_rgba(211,78,126,0.18)] backdrop-blur-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-color)]",
                          isActive && "text-[var(--theme-color)]"
                        )}
                      >
                        <motion.span
                          animate={{ scale: isActive ? 1.12 : 1 }}
                          whileTap={{ scale: 0.9 }}
                          className={cn(
                            "flex size-11 items-center justify-center rounded-full border border-[#f7bfd2]/70 bg-[#fff0f5] text-[#b66a7e]",
                            isActive && "bg-[var(--theme-color)]/15 text-[var(--theme-color)]"
                          )}
                        >
                          <Icon className="size-[1.2rem]" strokeWidth={isActive ? 2.5 : 2.1} />
                        </motion.span>
                        <span className="max-w-full truncate leading-tight">{item.label}</span>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </AnimatePresence>

          <div
            className="relative z-50 flex justify-center px-2"
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.45rem)",
              paddingTop: "0.65rem",
            }}
          >
            <button
              key={homeItem.href}
              type="button"
              aria-label="เปิดเมนูทางลัด"
              aria-expanded={isOpen}
              aria-controls="mobile-radial-menu"
              onClick={() => {
                triggerHaptic("medium");
                setIsOpen((open) => !open);
              }}
              className="group relative z-40 -mt-7 flex flex-col items-center gap-1 rounded-2xl px-2 py-1 text-[11px] font-semibold text-[var(--theme-color)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-color)]"
            >
              <motion.span
                animate={{ y: isOpen ? -2 : 0, scale: isOpen ? 1.04 : 1 }}
                whileTap={{ scale: 0.94 }}
                transition={{ type: "spring", stiffness: 460, damping: 26 }}
                className="dreamy-home-action relative flex size-[4.25rem] items-center justify-center rounded-full border border-white/95 bg-[#ffd8e5] text-[#ef6f9c] shadow-[inset_0_2px_5px_rgba(255,255,255,0.95),0_7px_18px_rgba(211,78,126,0.24)]"
              >
                <span className="dreamy-home-action-ring absolute inset-1 rounded-full border border-[#f7a8c2]/70" />
                <Heart
                  className="dreamy-home-heart relative size-8"
                  fill="currentColor"
                  strokeWidth={2.2}
                />
                <span
                  aria-hidden="true"
                  className="dreamy-halloween-pumpkin-icon"
                />
              </motion.span>
              <span className="dreamy-home-label rounded-full bg-white/65 px-2 py-0.5 text-[var(--theme-color)] shadow-sm">
                {homeItem.label}
              </span>
            </button>
          </div>
        </div>
      </motion.nav>
    </AnimatePresence>
  );
}
