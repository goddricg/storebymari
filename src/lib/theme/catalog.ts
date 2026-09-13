export const THEME_PACK_IDS = [
  "default",
  "halloween",
  "christmas",
  "new-year",
  "valentine",
  "songkran",
] as const;

export type ThemePackId = (typeof THEME_PACK_IDS)[number];

export const THEME_MODE_IDS = ["day", "night", "auto"] as const;

export type ThemeMode = (typeof THEME_MODE_IDS)[number];
export type ResolvedThemeMode = Exclude<ThemeMode, "auto">;

export const THEME_SETTING_KEYS = [
  "site_theme_pack",
  "site_theme_mode",
  "site_theme_allow_user_mode",
] as const;

export type ThemeSettingKey = (typeof THEME_SETTING_KEYS)[number];

export type LegacyThemeColors = {
  theme_color?: string | null;
  theme_color_nav?: string | null;
  theme_color_header_bg?: string | null;
  theme_color_bg_top?: string | null;
  theme_color_bg_bottom?: string | null;
  theme_color_text_accent?: string | null;
  theme_color_announcement?: string | null;
};

type ThemePalette = {
  primary: string;
  nav: string;
  header: string;
  bgTop: string;
  bgBottom: string;
  accent: string;
  announcement: string;
  surface: string;
  surfaceStrong: string;
  text: string;
  textMuted: string;
  border: string;
  shadow: string;
  shadowHover: string;
  peach: string;
  lilac: string;
  sky: string;
  mint: string;
  yellow: string;
};

export type ThemePack = {
  id: ThemePackId;
  label: string;
  description: string;
  season: string;
  palettes: Record<ResolvedThemeMode, ThemePalette>;
};

const commonDay = {
  surface: "#ffffff",
  surfaceStrong: "#fffdfd",
  text: "#402c35",
  textMuted: "#7f6570",
  border: "rgba(123, 67, 92, 0.2)",
  shadow: "0 14px 34px rgba(63, 34, 48, 0.12)",
  shadowHover: "0 19px 42px rgba(63, 34, 48, 0.18)",
};

const commonNight = {
  surface: "#241b27",
  surfaceStrong: "#2c2130",
  text: "#fff4f7",
  textMuted: "#dbc7d0",
  border: "rgba(255, 238, 245, 0.18)",
  shadow: "0 18px 44px rgba(0, 0, 0, 0.32)",
  shadowHover: "0 22px 54px rgba(0, 0, 0, 0.42)",
};

export const THEME_PACKS: Record<ThemePackId, ThemePack> = {
  default: {
    id: "default",
    label: "Default",
    description: "โทน Mari Studio แบบอ่อนโยน ใช้งานได้ตลอดปี",
    season: "ใช้งานปกติ",
    palettes: {
      day: {
        ...commonDay,
        primary: "#f57aa2",
        nav: "#f8adc3",
        header: "#fffafd",
        bgTop: "#fbe3e8",
        bgBottom: "#f9c5d1",
        accent: "#d9466d",
        announcement: "#ffd1de",
        peach: "#ffc9b8",
        lilac: "#d8c1f2",
        sky: "#b9e4ed",
        mint: "#bfe7d5",
        yellow: "#ffe68f",
      },
      night: {
        ...commonNight,
        primary: "#ff8fba",
        nav: "#422638",
        header: "#1b121b",
        bgTop: "#2a1825",
        bgBottom: "#110d14",
        accent: "#ffd2e3",
        announcement: "#61344e",
        peach: "#a55c65",
        lilac: "#755ca3",
        sky: "#497b92",
        mint: "#4c846d",
        yellow: "#b5984f",
      },
    },
  },
  halloween: {
    id: "halloween",
    label: "Halloween",
    description: "ส้ม ม่วง และประกายลึกลับแบบพรีเมียม ไม่รบกวนการซื้อสินค้า",
    season: "Halloween",
    palettes: {
      day: {
        ...commonDay,
        primary: "#ef6c16",
        nav: "#6f3b82",
        header: "#fff9f3",
        bgTop: "#fff0dc",
        bgBottom: "#f6d4b1",
        accent: "#743f91",
        announcement: "#f9c995",
        peach: "#ffb36f",
        lilac: "#d3b4ed",
        sky: "#b7d9df",
        mint: "#b9d9c5",
        yellow: "#ffd481",
      },
      night: {
        ...commonNight,
        primary: "#ff8a2a",
        nav: "#31173f",
        header: "#170f1d",
        bgTop: "#2a1835",
        bgBottom: "#120b17",
        accent: "#e2c6ff",
        announcement: "#56245f",
        peach: "#a04e26",
        lilac: "#8050a8",
        sky: "#385d69",
        mint: "#416657",
        yellow: "#bd873d",
      },
    },
  },
  christmas: {
    id: "christmas",
    label: "Christmas",
    description: "เขียวสน แดง และทอง ให้ความอบอุ่นแบบช่วงเทศกาล",
    season: "Christmas",
    palettes: {
      day: {
        ...commonDay,
        primary: "#14734d",
        nav: "#1e6b50",
        header: "#f8fff9",
        bgTop: "#e6f5e9",
        bgBottom: "#f5e6e6",
        accent: "#b3263d",
        announcement: "#eacfc6",
        peach: "#f1baa9",
        lilac: "#d6cae8",
        sky: "#b9dce7",
        mint: "#abd8bd",
        yellow: "#e8cb7a",
      },
      night: {
        ...commonNight,
        primary: "#4fd18f",
        nav: "#123f31",
        header: "#101b18",
        bgTop: "#153a2d",
        bgBottom: "#101714",
        accent: "#ffb1ba",
        announcement: "#4a2630",
        peach: "#9b5557",
        lilac: "#6d6388",
        sky: "#456c78",
        mint: "#42795d",
        yellow: "#b79a4c",
      },
    },
  },
  "new-year": {
    id: "new-year",
    label: "Happy New Year",
    description: "น้ำเงินกลางคืน ทอง และประกายฉลองแบบอ่านง่าย",
    season: "New Year",
    palettes: {
      day: {
        ...commonDay,
        primary: "#b8861f",
        nav: "#203c70",
        header: "#fffdf5",
        bgTop: "#edf5ff",
        bgBottom: "#e4edfb",
        accent: "#315aa6",
        announcement: "#f4dfaa",
        peach: "#efc6a4",
        lilac: "#cfc7ee",
        sky: "#b8daf2",
        mint: "#bee0d0",
        yellow: "#f3d773",
      },
      night: {
        ...commonNight,
        primary: "#f4cb67",
        nav: "#142a57",
        header: "#0c142b",
        bgTop: "#14264d",
        bgBottom: "#090f22",
        accent: "#a8c9ff",
        announcement: "#4f3b16",
        peach: "#946945",
        lilac: "#58528a",
        sky: "#467aa8",
        mint: "#3f756d",
        yellow: "#d4a849",
      },
    },
  },
  valentine: {
    id: "valentine",
    label: "Valentine",
    description: "ชมพูกุหลาบและไวน์แดง นุ่มนวล ไม่หวานจนลดความน่าเชื่อถือ",
    season: "Valentine",
    palettes: {
      day: {
        ...commonDay,
        primary: "#e65383",
        nav: "#bf4c76",
        header: "#fff8fa",
        bgTop: "#ffe9f0",
        bgBottom: "#fbd0de",
        accent: "#9a3757",
        announcement: "#ffc7da",
        peach: "#ffc0b8",
        lilac: "#e4bfe3",
        sky: "#c5dfec",
        mint: "#c8e4d8",
        yellow: "#f7dc91",
      },
      night: {
        ...commonNight,
        primary: "#ff8fb3",
        nav: "#542238",
        header: "#241018",
        bgTop: "#3a1727",
        bgBottom: "#160b11",
        accent: "#ffd6e4",
        announcement: "#682b43",
        peach: "#a75c65",
        lilac: "#7b5579",
        sky: "#466a80",
        mint: "#467460",
        yellow: "#b89551",
      },
    },
  },
  songkran: {
    id: "songkran",
    label: "สงกรานต์",
    description: "ฟ้าใส น้ำ และดอกไม้ไทยแบบสะอาดตา",
    season: "Songkran",
    palettes: {
      day: {
        ...commonDay,
        primary: "#089ecb",
        nav: "#33a5c9",
        header: "#f7fdff",
        bgTop: "#ddf6ff",
        bgBottom: "#c9ebf5",
        accent: "#2378a8",
        announcement: "#b9e8f5",
        peach: "#f7c3a1",
        lilac: "#cdbdec",
        sky: "#9cdbef",
        mint: "#aee2cf",
        yellow: "#f7da7d",
      },
      night: {
        ...commonNight,
        primary: "#63d6f5",
        nav: "#164a62",
        header: "#0d1a21",
        bgTop: "#143846",
        bgBottom: "#091217",
        accent: "#b9edff",
        announcement: "#1e6176",
        peach: "#966650",
        lilac: "#5d5b8e",
        sky: "#397c95",
        mint: "#3f7e70",
        yellow: "#b99d52",
      },
    },
  },
};

export function isThemePackId(value: string | null | undefined): value is ThemePackId {
  return typeof value === "string" && (THEME_PACK_IDS as readonly string[]).includes(value);
}

export function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return typeof value === "string" && (THEME_MODE_IDS as readonly string[]).includes(value);
}

export function isThemeSettingKey(value: string): value is ThemeSettingKey {
  return (THEME_SETTING_KEYS as readonly string[]).includes(value);
}

export function normalizeThemePack(value: string | null | undefined): ThemePackId {
  return isThemePackId(value) ? value : "default";
}

export function normalizeThemeMode(value: string | null | undefined): ThemeMode {
  return isThemeMode(value) ? value : "day";
}

export function resolveThemeMode(
  mode: ThemeMode,
  prefersNight = false,
): ResolvedThemeMode {
  if (mode === "auto") return prefersNight ? "night" : "day";
  return mode;
}

export function canUseThemeSettingValue(
  key: ThemeSettingKey,
  value: string | null,
): boolean {
  if (value === null) return true;

  if (key === "site_theme_pack") return isThemePackId(value);
  if (key === "site_theme_mode") return isThemeMode(value);
  return value === "true" || value === "false";
}

function withLegacyDefaultDayColors(
  palette: ThemePalette,
  colors: LegacyThemeColors,
): ThemePalette {
  return {
    ...palette,
    primary: colors.theme_color?.trim() || palette.primary,
    nav: colors.theme_color_nav?.trim() || palette.nav,
    header: colors.theme_color_header_bg?.trim() || palette.header,
    bgTop: colors.theme_color_bg_top?.trim() || palette.bgTop,
    bgBottom: colors.theme_color_bg_bottom?.trim() || palette.bgBottom,
    accent: colors.theme_color_text_accent?.trim() || palette.accent,
    announcement: colors.theme_color_announcement?.trim() || palette.announcement,
  };
}

export function getThemePalette(
  pack: ThemePackId,
  mode: ResolvedThemeMode,
  legacyColors: LegacyThemeColors = {},
): ThemePalette {
  const palette = THEME_PACKS[pack].palettes[mode];
  return pack === "default" && mode === "day"
    ? withLegacyDefaultDayColors(palette, legacyColors)
    : palette;
}

export function getThemeCssVariables(
  pack: ThemePackId,
  mode: ResolvedThemeMode,
  legacyColors: LegacyThemeColors = {},
): Record<`--${string}`, string> {
  const palette = getThemePalette(pack, mode, legacyColors);
  const isNight = mode === "night";
  const isLegacyDefaultDay = pack === "default" && mode === "day";

  return {
    "--theme-color": palette.primary,
    "--theme-color-nav": palette.nav,
    "--theme-color-header-bg": palette.header,
    "--theme-color-bg-top": palette.bgTop,
    "--theme-color-bg-bottom": palette.bgBottom,
    "--theme-color-text-accent": palette.accent,
    "--theme-color-announcement": palette.announcement,
    "--background": palette.header,
    "--foreground": isLegacyDefaultDay ? "#9a5832" : palette.text,
    "--card": palette.surface,
    "--card-foreground": isLegacyDefaultDay ? "#9a5832" : palette.text,
    "--popover": palette.surfaceStrong,
    "--popover-foreground": isLegacyDefaultDay ? "#9a5832" : palette.text,
    "--primary": palette.primary,
    "--primary-foreground": "#ffffff",
    "--secondary": isNight ? "#34273a" : isLegacyDefaultDay ? "#f5f5f5" : "#f8f4f6",
    "--secondary-foreground": isLegacyDefaultDay ? "#9a5832" : palette.text,
    "--muted": isNight ? "#302431" : isLegacyDefaultDay ? "#fdf5f0" : "#faf4f6",
    "--muted-foreground": isLegacyDefaultDay ? "#9a5832" : palette.textMuted,
    "--accent": palette.primary,
    "--accent-foreground": "#ffffff",
    "--border": palette.border,
    "--input": palette.border,
    "--ring": palette.primary,
    "--chart-1": palette.primary,
    "--chart-2": isLegacyDefaultDay ? "#fed7aa" : palette.sky,
    "--chart-3": isLegacyDefaultDay ? "#9a5832" : palette.accent,
    "--chart-4": isLegacyDefaultDay ? "#ffffff" : palette.mint,
    "--chart-5": isLegacyDefaultDay ? "#fff4ed" : palette.yellow,
    "--dreamy-primary": isLegacyDefaultDay ? "#f57aa2" : palette.primary,
    "--dreamy-primary-deep": isLegacyDefaultDay ? "#e95d8c" : palette.accent,
    "--dreamy-surface": isLegacyDefaultDay ? "rgb(255 255 255 / 0.84)" : palette.surface,
    "--dreamy-surface-strong": isLegacyDefaultDay ? "rgb(255 255 255 / 0.95)" : palette.surfaceStrong,
    "--dreamy-text": isLegacyDefaultDay ? "#6f4a55" : palette.text,
    "--dreamy-text-muted": isLegacyDefaultDay ? "#8a6c75" : palette.textMuted,
    "--dreamy-border": isLegacyDefaultDay ? "rgb(249 185 199 / 0.72)" : palette.border,
    "--dreamy-shadow": isLegacyDefaultDay ? "0 12px 30px rgb(211 78 126 / 0.1)" : palette.shadow,
    "--dreamy-shadow-hover": isLegacyDefaultDay ? "0 17px 38px rgb(211 78 126 / 0.16)" : palette.shadowHover,
    "--dreamy-peach": palette.peach,
    "--dreamy-lilac": palette.lilac,
    "--dreamy-sky": palette.sky,
    "--dreamy-mint": palette.mint,
    "--dreamy-yellow": palette.yellow,
  };
}
