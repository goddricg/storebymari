"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  Coins,
  FileText,
  History,
  LogOut,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import LoginForm from "@/components/auth/login-form";
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
import { cn } from "@/lib/utils";
import { PwaInstallDropdownMenuItem } from "@/components/pwa/pwa-install-menu-item";
import {
  getDefaultAvatarKeyForUser,
  getProfileAvatarUrl,
  isValidRankingAvatarKey,
} from "@/lib/ranking/avatars";
import { STOREFRONT_PRIMARY_LINKS } from "@/components/storefront-primary-nav";

const ACCOUNT_CAT_ICON_PATH = "/front-store/storebymari-black-cat-account.png";

type StorefrontAccountMenuButtonProps = {
  className?: string;
};

export default function StorefrontAccountMenuButton({
  className,
}: StorefrontAccountMenuButtonProps) {
  const [loginOpen, setLoginOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountMenuAnimating, setAccountMenuAnimating] = useState(false);
  const [masterPointStatus, setMasterPointStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [masterPoint, setMasterPoint] = useState<number | null>(null);
  const [avatarKey, setAvatarKey] = useState<string | null>(null);
  const accountMenuTimerRef = useRef<number | null>(null);
  const router = useRouter();
  const { user, refreshSession } = useSession();
  const publicSettings = usePublicSettings();
  const isAdmin = isAdminUser(user);
  const canViewMasterPoint = Boolean(user && isSuperAdminUser(user));
  const siteName = publicSettings.site_name?.trim() || "Store By Mari";
  const accountHref = user ? (isAdmin ? "/admin" : "/dashboard") : "/login";
  const userId = user?.id ?? null;

  useEffect(() => {
    return () => {
      if (accountMenuTimerRef.current !== null) {
        window.clearTimeout(accountMenuTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleAuthChange = () => {
      void refreshSession();
    };

    window.addEventListener("auth:session-changed", handleAuthChange);
    return () => window.removeEventListener("auth:session-changed", handleAuthChange);
  }, [refreshSession]);

  useEffect(() => {
    if (!userId) {
      setAvatarKey(null);
      return;
    }

    const fallbackAvatarKey = getDefaultAvatarKeyForUser(userId);
    const localStorageKey = `appbymari:profile-avatar:${userId}`;
    const localAvatarKey = window.localStorage.getItem(localStorageKey);
    setAvatarKey(localAvatarKey && isValidRankingAvatarKey(localAvatarKey) ? localAvatarKey : fallbackAvatarKey);

    let cancelled = false;
    const loadAvatar = async () => {
      try {
        const response = await fetch("/api/profile/avatar", {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) return;
        const body = (await response.json()) as { avatarKey?: unknown };
        if (!cancelled && typeof body.avatarKey === "string" && isValidRankingAvatarKey(body.avatarKey)) {
          setAvatarKey(body.avatarKey);
        }
      } catch {
        // Keep the deterministic/local fallback avatar when profile storage is unavailable.
      }
    };

    const handleAvatarUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; avatarKey?: string }>).detail;
      if (detail?.userId === userId && detail.avatarKey && isValidRankingAvatarKey(detail.avatarKey)) {
        setAvatarKey(detail.avatarKey);
      }
    };

    window.addEventListener("appbymari:profile-avatar-updated", handleAvatarUpdate);
    void loadAvatar();
    return () => {
      cancelled = true;
      window.removeEventListener("appbymari:profile-avatar-updated", handleAvatarUpdate);
    };
  }, [userId]);

  const handleAccountMenuOpenChange = (open: boolean) => {
    if (accountMenuTimerRef.current !== null) {
      window.clearTimeout(accountMenuTimerRef.current);
      accountMenuTimerRef.current = null;
    }

    // Radix controls the menu lifecycle through this callback. Keep the
    // controlled `open` state in sync immediately so repeated clicks cannot
    // race a delayed state update and leave the portal visually stuck open.
    setAccountMenuOpen(open);
    setAccountMenuAnimating(open);

    if (!open || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setAccountMenuAnimating(false);
      return;
    }

    accountMenuTimerRef.current = window.setTimeout(() => {
      setAccountMenuAnimating(false);
      accountMenuTimerRef.current = null;
    }, 360);
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

  return (
    <>
      <DropdownMenu open={accountMenuOpen} onOpenChange={handleAccountMenuOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn("front-store-login front-store-account-trigger", className)}
            aria-label={user ? "เปิดเมนูบัญชีผู้ใช้" : "เปิดเมนูเข้าสู่ระบบ"}
            aria-haspopup="menu"
            aria-expanded={accountMenuOpen}
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
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={10}
          className="front-store-account-popover min-w-[280px] border-[#f47fbe]/70 bg-[#160d1d]/[.98] p-2 text-white shadow-[0_18px_50px_rgba(0,0,0,.48),0_0_24px_rgba(255,40,157,.22)]"
        >
          <DropdownMenuLabel className="front-store-account-summary px-3 py-2">
            <div className="flex items-start gap-3">
              {user ? (
                <span className="front-store-account-avatar-frame" aria-hidden="true">
                  <Image
                    src={getProfileAvatarUrl(avatarKey)}
                    alt=""
                    width={52}
                    height={52}
                    sizes="44px"
                    className="front-store-account-avatar"
                  />
                </span>
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-1">
                  <span className="truncate text-sm font-bold text-white">
                    {user ? (user.displayName ?? user.email) : siteName}
                  </span>
                  <span className="truncate text-xs text-[#f7c9e5]">
                    {user ? user.email : "เมนูหลักและการเข้าสู่ระบบ"}
                  </span>
                  {user ? (
                    <span className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-[#ffd36b]">
                      <Coins className="size-4" aria-hidden="true" />
                      {user.points.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })} พ้อยท์
                    </span>
                  ) : null}
                </div>
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
            </div>
          </DropdownMenuLabel>

          {STOREFRONT_PRIMARY_LINKS.map(({ href, label, Icon }) => (
            <DropdownMenuItem key={`mobile-${label}`} asChild className="front-store-account-mobile-nav-item">
              <Link href={href}>
                <Icon aria-hidden="true" />
                <span>{label}</span>
              </Link>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator className="front-store-account-mobile-nav-separator bg-[#f47fbe]/25" />
          <PwaInstallDropdownMenuItem />

          {user ? (
            <>
              <DropdownMenuItem asChild className="front-store-account-menu-item">
                <Link href="/dashboard">
                  <UserRound aria-hidden="true" />
                  <span>เข้าโปรไฟล์</span>
                </Link>
              </DropdownMenuItem>
              {isAdmin ? (
                <DropdownMenuItem asChild className="front-store-account-menu-item">
                  <Link href={accountHref}>
                    <ShieldCheck aria-hidden="true" />
                    <span>ไปหน้า Admin</span>
                  </Link>
                </DropdownMenuItem>
              ) : null}
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
              <DropdownMenuItem asChild className="front-store-account-menu-item">
                <Link href="/support/history">
                  <FileText aria-hidden="true" />
                  <span>ประวัติการส่งเคลม</span>
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
            </>
          ) : (
            <DropdownMenuItem
              className="front-store-account-menu-item"
              onClick={() => setLoginOpen(true)}
            >
              <ShieldCheck aria-hidden="true" />
              <span>เข้าสู่ระบบ</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

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
    </>
  );
}

