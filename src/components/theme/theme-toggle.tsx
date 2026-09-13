"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme/theme-provider";

type ThemeToggleProps = {
  className?: string;
};

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { allowUserMode, resolvedMode, toggleMode } = useTheme();

  if (!allowUserMode) return null;

  const isNight = resolvedMode === "night";
  const nextLabel = isNight ? "เปลี่ยนเป็นโหมดกลางวัน" : "เปลี่ยนเป็นโหมดกลางคืน";

  return (
    <button
      type="button"
      aria-label={nextLabel}
      aria-pressed={isNight}
      title={nextLabel}
      onClick={toggleMode}
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--theme-color)]/25 bg-[var(--card)]/80 text-[var(--theme-color)] shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[var(--theme-color)]/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
        className,
      )}
    >
      {isNight ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
      <span className="sr-only">{nextLabel}</span>
    </button>
  );
}
