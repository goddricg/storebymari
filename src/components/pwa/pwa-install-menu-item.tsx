"use client";

import React from "react";
import { Smartphone } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { usePwaInstall } from "@/components/pwa/pwa-install-provider";

interface PwaInstallDropdownMenuItemProps {
  className?: string;
}

export function PwaInstallDropdownMenuItem({ className }: PwaInstallDropdownMenuItemProps) {
  const { isInstallable, triggerInstall } = usePwaInstall();

  if (!isInstallable) return null;

  return (
    <DropdownMenuItem
      onSelect={(e) => {
        e.preventDefault();
        triggerInstall();
      }}
      onClick={triggerInstall}
      className={
        className ??
        "cursor-pointer px-3 py-2 text-sm focus:bg-[var(--theme-color)]/10 focus:text-[var(--theme-color)]"
      }
    >
      <div className="flex items-center gap-2">
        <Smartphone className="size-4 text-[var(--theme-color)]" />
        <span>ติดตั้งแอป</span>
      </div>
    </DropdownMenuItem>
  );
}

interface PwaInstallMobileDrawerItemProps {
  onSelect?: () => void;
  className?: string;
}

export function PwaInstallMobileDrawerItem({ onSelect, className }: PwaInstallMobileDrawerItemProps) {
  const { isInstallable, triggerInstall } = usePwaInstall();

  if (!isInstallable) return null;

  return (
    <button
      type="button"
      onClick={() => {
        onSelect?.();
        triggerInstall();
      }}
      className={
        className ??
        "flex w-full items-center gap-3 rounded-xl px-4 py-4 text-base text-[#9a5832] transition-colors hover:bg-[var(--theme-color)]/10 hover:text-[var(--theme-color)] text-left"
      }
    >
      <Smartphone className="size-6 text-[var(--theme-color)]" />
      <span className="font-medium">ติดตั้งแอป</span>
    </button>
  );
}
