"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Ghost,
  Heart,
  Moon,
  PartyPopper,
  RefreshCcw,
  Save,
  Sparkles,
  Sun,
  TreePine,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  getThemeCssVariables,
  normalizeThemeMode,
  normalizeThemePack,
  THEME_PACKS,
  type ThemeMode,
  type ThemePackId,
} from "@/lib/theme/catalog";
import { cn } from "@/lib/utils";

type Setting = {
  key: string;
  value: string | null;
};

type ThemeManagerState = {
  pack: ThemePackId;
  mode: ThemeMode;
  allowUserMode: boolean;
};

const DEFAULT_STATE: ThemeManagerState = {
  pack: "default",
  mode: "day",
  allowUserMode: true,
};

const THEME_ICONS: Record<ThemePackId, LucideIcon> = {
  default: Sparkles,
  halloween: Ghost,
  christmas: TreePine,
  "new-year": PartyPopper,
  valentine: Heart,
  songkran: Waves,
};

function readThemeState(settings: Setting[]): ThemeManagerState {
  const values = new Map(settings.map((setting) => [setting.key, setting.value]));
  return {
    pack: normalizeThemePack(values.get("site_theme_pack")),
    mode: normalizeThemeMode(values.get("site_theme_mode")),
    allowUserMode: values.get("site_theme_allow_user_mode") !== "false",
  };
}

export default function ThemeManager() {
  const router = useRouter();
  const [saved, setSaved] = useState<ThemeManagerState>(DEFAULT_STATE);
  const [draft, setDraft] = useState<ThemeManagerState>(DEFAULT_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function load() {
      try {
        const response = await fetch("/api/admin/settings", { credentials: "include" });
        if (!response.ok) throw new Error("ไม่สามารถโหลดการตั้งค่า Theme ได้");
        const payload = (await response.json()) as { settings: Setting[] };
        if (!isActive) return;
        const current = readThemeState(payload.settings);
        setSaved(current);
        setDraft(current);
      } catch (error) {
        if (isActive) {
          toast.error(error instanceof Error ? error.message : "ไม่สามารถโหลดการตั้งค่า Theme ได้");
        }
      } finally {
        if (isActive) setIsLoading(false);
      }
    }

    void load();
    return () => {
      isActive = false;
    };
  }, []);

  const isDirty =
    draft.pack !== saved.pack ||
    draft.mode !== saved.mode ||
    draft.allowUserMode !== saved.allowUserMode;

  const previewVariables = useMemo(
    () => getThemeCssVariables(draft.pack, draft.mode === "night" ? "night" : "day"),
    [draft.mode, draft.pack],
  );

  const publish = async () => {
    if (!isDirty || isSaving) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          settings: {
            site_theme_pack: draft.pack,
            site_theme_mode: draft.mode,
            site_theme_allow_user_mode: draft.allowUserMode ? "true" : "false",
          },
        }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.message ?? "ไม่สามารถเผยแพร่ Theme ได้");
      }

      setSaved(draft);
      toast.success("เผยแพร่ Theme สำหรับ storebymari.com เรียบร้อย");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ไม่สามารถเผยแพร่ Theme ได้");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--theme-color)]/20 bg-[var(--card)] shadow-sm">
      <div className="border-b border-[var(--border)] bg-[var(--theme-color)]/6 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[var(--theme-color)]">
              <Sparkles className="size-5" aria-hidden="true" />
              <p className="text-sm font-bold tracking-wide">THEME MANAGER</p>
            </div>
            <h2 className="mt-1 text-xl font-bold text-[var(--foreground)]">ธีมและการแสดงผล</h2>
            <p className="mt-1 max-w-2xl text-sm text-[var(--muted-foreground)]">
              เลือก Theme Pack สำหรับ storebymari.com โดยไม่เปลี่ยนราคา สต็อก การซื้อ หรือการเติมเงิน
            </p>
          </div>
          <div className="inline-flex items-center gap-2 self-start rounded-full border border-[var(--theme-color)]/25 bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-[var(--theme-color)]">
            <span className="size-2 rounded-full bg-current" aria-hidden="true" />
            {isLoading ? "กำลังโหลด" : `ใช้งานอยู่: ${THEME_PACKS[saved.pack].label}`}
          </div>
        </div>
      </div>

      <div className="space-y-6 p-5 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Object.values(THEME_PACKS).map((theme) => {
            const Icon = THEME_ICONS[theme.id];
            const selected = draft.pack === theme.id;
            const palette = theme.palettes.day;
            return (
              <button
                key={theme.id}
                type="button"
                aria-pressed={selected}
                disabled={isLoading || isSaving}
                onClick={() => setDraft((previous) => ({ ...previous, pack: theme.id }))}
                className={cn(
                  "group relative overflow-hidden rounded-xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                  selected
                    ? "border-[var(--theme-color)] bg-[var(--theme-color)]/9 shadow-[0_12px_30px_rgba(0,0,0,0.12)]"
                    : "border-[var(--border)] bg-[var(--background)] hover:-translate-y-0.5 hover:border-[var(--theme-color)]/45",
                )}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-1"
                  style={{ background: `linear-gradient(90deg, ${palette.primary}, ${palette.accent})` }}
                />
                <div className="flex items-start justify-between gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-10 items-center justify-center rounded-xl text-white shadow-sm"
                    style={{ backgroundColor: palette.primary }}
                  >
                    <Icon className="size-5" />
                  </span>
                  {selected ? (
                    <span className="flex size-6 items-center justify-center rounded-full bg-[var(--theme-color)] text-white">
                      <Check className="size-4" aria-hidden="true" />
                    </span>
                  ) : null}
                </div>
                <p className="mt-4 font-semibold text-[var(--foreground)]">{theme.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">{theme.description}</p>
              </button>
            );
          })}
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 sm:p-5">
            <div>
              <Label className="text-sm font-semibold text-[var(--foreground)]">โหมดเริ่มต้นของเว็บไซต์</Label>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">ผู้ใช้สามารถสลับ Day/Night เองได้ หากเปิดสิทธิ์ด้านล่าง</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {([
                ["day", "Day Mode", Sun, "โหมดกลางวัน"],
                ["night", "Night Mode", Moon, "โหมดกลางคืน"],
                ["auto", "Auto", Sparkles, "ตามอุปกรณ์"],
              ] as const).map(([mode, label, Icon, description]) => {
                const selected = draft.mode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={selected}
                    disabled={isLoading || isSaving}
                    onClick={() => setDraft((previous) => ({ ...previous, mode }))}
                    className={cn(
                      "flex min-h-20 items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                      selected
                        ? "border-[var(--theme-color)] bg-[var(--theme-color)]/10 text-[var(--theme-color)]"
                        : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:border-[var(--theme-color)]/45",
                    )}
                  >
                    <Icon className="size-5 shrink-0" aria-hidden="true" />
                    <span>
                      <span className="block text-sm font-semibold">{label}</span>
                      <span className="block text-xs opacity-75">{description}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-dashed border-[var(--theme-color)]/35 bg-[var(--card)]/70 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Label htmlFor="site-theme-allow-user-mode" className="text-sm font-semibold text-[var(--foreground)]">
                  ให้ผู้เข้าชมสลับ Day / Night ได้
                </Label>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">ปุ่มจะอยู่ที่ Navbar และจำค่าบนเครื่องของผู้ใช้ โดยไม่แตะข้อมูลบัญชี</p>
              </div>
              <Switch
                id="site-theme-allow-user-mode"
                checked={draft.allowUserMode}
                disabled={isLoading || isSaving}
                onCheckedChange={(checked) => setDraft((previous) => ({ ...previous, allowUserMode: checked }))}
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-[var(--border)]" style={previewVariables}>
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--theme-color-nav)]/45 px-4 py-3">
              <span className="text-xs font-bold text-[var(--theme-color-text-accent)]">LIVE PREVIEW</span>
              <span className="rounded-full bg-[var(--theme-color)] px-2 py-0.5 text-[10px] font-bold text-white">
                {draft.mode === "auto" ? "AUTO" : draft.mode.toUpperCase()}
              </span>
            </div>
            <div className="space-y-3 bg-[var(--theme-color-bg-bottom)] p-4">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="size-8 rounded-lg bg-[var(--theme-color)]" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[var(--foreground)]">{THEME_PACKS[draft.pack].label}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">ตัวอย่าง Card และปุ่ม</p>
                  </div>
                </div>
                <button type="button" className="mt-3 w-full rounded-md bg-[var(--theme-color)] px-3 py-2 text-xs font-semibold text-white">
                  ตัวอย่างปุ่มซื้อ
                </button>
              </div>
              <p className="text-xs text-[var(--theme-color-text-accent)]">พื้นหลังและสี Accent จะเปลี่ยนตาม Theme ที่เลือก</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-[var(--border)] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={isLoading || isSaving || !isDirty}
            onClick={() => setDraft(saved)}
            className="border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--theme-color)]/10"
          >
            <RefreshCcw className="mr-2 size-4" aria-hidden="true" />
            ยกเลิกการเปลี่ยนแปลง
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              disabled={isLoading || isSaving}
              onClick={() => setDraft(DEFAULT_STATE)}
              className="border-[var(--theme-color)]/35 text-[var(--theme-color)] hover:bg-[var(--theme-color)]/10"
            >
              คืนค่า Default
            </Button>
            <Button
              type="button"
              disabled={isLoading || isSaving || !isDirty}
              onClick={publish}
              className="bg-[var(--theme-color)] text-white hover:bg-[var(--theme-color)]/90"
            >
              <Save className="mr-2 size-4" aria-hidden="true" />
              {isSaving ? "กำลังเผยแพร่..." : "บันทึกและเผยแพร่ Theme"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
