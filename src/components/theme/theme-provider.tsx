"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  getThemeCssVariables,
  normalizeThemeMode,
  resolveThemeMode,
  type LegacyThemeColors,
  type ResolvedThemeMode,
  type ThemeMode,
  type ThemePackId,
} from "@/lib/theme/catalog";

const THEME_MODE_STORAGE_KEY = "appbymari:theme-mode";

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedMode: ResolvedThemeMode;
  allowUserMode: boolean;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

type ThemeProviderProps = {
  children: ReactNode;
  enabled: boolean;
  pack: ThemePackId;
  defaultMode: ThemeMode;
  allowUserMode: boolean;
  legacyColors: LegacyThemeColors;
};

function isBackOfficePath(pathname: string | null) {
  return (
    pathname === "/admin" ||
    pathname?.startsWith("/admin/") === true ||
    pathname === "/dashboard" ||
    pathname?.startsWith("/dashboard/") === true
  );
}

export function ThemeProvider({
  children,
  enabled,
  pack,
  defaultMode,
  allowUserMode,
  legacyColors,
}: ThemeProviderProps) {
  const pathname = usePathname();
  const isBackOffice = isBackOfficePath(pathname);
  const themeEnabled = enabled && !isBackOffice;
  const [mode, setModeState] = useState<ThemeMode>(defaultMode);
  const [systemPrefersNight, setSystemPrefersNight] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemPreference = () => setSystemPrefersNight(media.matches);
    syncSystemPreference();
    media.addEventListener("change", syncSystemPreference);
    return () => media.removeEventListener("change", syncSystemPreference);
  }, []);

  useEffect(() => {
    if (!enabled || !allowUserMode) {
      setModeState(defaultMode);
      return;
    }

    const stored = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
    setModeState(normalizeThemeMode(stored ?? defaultMode));
  }, [allowUserMode, defaultMode, enabled]);

  const resolvedMode = themeEnabled ? resolveThemeMode(mode, systemPrefersNight) : "day";

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const root = document.documentElement;
    const body = document.body;

    if (isBackOffice) {
      const defaultVariables = getThemeCssVariables("default", "day", legacyColors);

      root.classList.remove("dark");
      root.dataset.themeMode = "day";
      body.dataset.themePack = "default";
      body.dataset.themeMode = "day";

      for (const [key, value] of Object.entries(defaultVariables)) {
        body.style.setProperty(key, value);
      }
      return;
    }

    const variables = getThemeCssVariables(pack, resolvedMode, legacyColors);

    root.classList.toggle("dark", resolvedMode === "night");
    root.dataset.themeMode = resolvedMode;
    body.dataset.themePack = pack;
    body.dataset.themeMode = resolvedMode;

    for (const [key, value] of Object.entries(variables)) {
      body.style.setProperty(key, value);
    }
  }, [enabled, isBackOffice, legacyColors, pack, resolvedMode]);

  const setMode = useCallback((nextMode: ThemeMode) => {
    if (!themeEnabled || !allowUserMode) return;
    setModeState(nextMode);
    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, nextMode);
  }, [allowUserMode, themeEnabled]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      resolvedMode,
      allowUserMode: themeEnabled && allowUserMode,
      setMode,
      toggleMode: () => setMode(resolvedMode === "night" ? "day" : "night"),
    }),
    [allowUserMode, mode, resolvedMode, setMode, themeEnabled],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return value;
}
