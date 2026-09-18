"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  getProfileAvatarUrl,
  getRankingAvatarUrl,
  isValidRankingAvatarKey,
  RANKING_AVATAR_KEYS,
} from "@/lib/ranking/avatars";

type AvatarPickerProps = {
  userId: string;
  initialAvatarKey: string | null;
};

export default function AvatarPicker({ userId, initialAvatarKey }: AvatarPickerProps) {
  const storageKey = useMemo(() => `appbymari:profile-avatar:${userId}`, [userId]);
  const [selected, setSelected] = useState<string | null>(initialAvatarKey);
  const [saved, setSaved] = useState<string | null>(initialAvatarKey);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const localValue = window.localStorage.getItem(storageKey);
    if (localValue && isValidRankingAvatarKey(localValue)) {
      setSelected(localValue);
      setSaved(localValue);
    }
  }, [storageKey]);

  const handleSave = async () => {
    if (!selected || selected === saved) return;
    setIsSaving(true);
    window.localStorage.setItem(storageKey, selected);

    try {
      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ avatarKey: selected }),
      });

      if (response.ok) {
        setSaved(selected);
        window.dispatchEvent(
          new CustomEvent("appbymari:profile-avatar-updated", {
            detail: { userId, avatarKey: selected },
          })
        );
        toast.success("บันทึก Avatar แล้ว");
      } else if (response.status === 503) {
        setSaved(selected);
        window.dispatchEvent(
          new CustomEvent("appbymari:profile-avatar-updated", {
            detail: { userId, avatarKey: selected },
          })
        );
        toast.info("เลือก Avatar ในเครื่องแล้ว รอเปิดใช้ profile storage หลังติดตั้ง migration");
      } else {
        toast.error("ไม่สามารถบันทึก Avatar บนเซิร์ฟเวอร์ได้");
      }
    } catch {
      toast.info("บันทึก Avatar ไว้ในเครื่องแล้ว และจะลองส่งไปเซิร์ฟเวอร์อีกครั้งภายหลัง");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--theme-color)]/20 bg-[#fffafd] p-4">
      <div className="flex items-center gap-4 rounded-xl border border-[var(--theme-color)]/15 bg-white p-3 sm:p-4">
        <img
          src={getProfileAvatarUrl(saved)}
          alt="Current profile avatar"
          className="size-24 rounded-full border-4 border-[#ffd4e1] bg-white p-1 object-cover shadow-[0_4px_16px_rgba(224,83,132,0.18)] sm:size-28"
        />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#6B7280]">Current profile avatar</p>
          <p className="truncate text-sm font-bold text-[#0B0B0B]">
            {saved ?? "Default profile"}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-[var(--theme-color)]">
            <Sparkles className="size-4" /> เลือก Avatar โปรไฟล์
          </div>
          <p className="mt-1 text-xs text-[#6B7280]">เลือกจากคอลเลกชัน Store By Mari ได้ทั้งหมด {RANKING_AVATAR_KEYS.length} แบบ</p>
        </div>
        <Button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !selected || selected === saved}
          className="h-9 rounded-xl bg-[var(--theme-color)] px-4 text-xs font-semibold text-white hover:bg-[var(--theme-color)]"
        >
          <Save className="mr-1.5 size-3.5" />
          {isSaving ? "กำลังบันทึก" : "บันทึก Avatar"}
        </Button>
      </div>

      <div className="grid max-h-[360px] grid-cols-5 gap-2 overflow-y-auto p-1 sm:grid-cols-8 lg:grid-cols-10">
        {RANKING_AVATAR_KEYS.map((avatarKey) => {
          const isSelected = selected === avatarKey;
          return (
            <button
              key={avatarKey}
              type="button"
              onClick={() => setSelected(avatarKey)}
              aria-label={`เลือก ${avatarKey}`}
              aria-pressed={isSelected}
              className={`relative aspect-square overflow-hidden rounded-full border-2 bg-white p-0.5 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-color)] ${
                isSelected ? "border-[var(--theme-color)] shadow-[0_0_0_3px_rgba(245,122,162,0.2)]" : "border-transparent"
              }`}
            >
              <img
                src={getRankingAvatarUrl(avatarKey)}
                alt=""
                className="size-full rounded-full object-cover"
                loading="lazy"
                decoding="async"
              />
              {isSelected ? (
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-[#e95d8c]/35 text-white">
                  <Check className="size-5 drop-shadow" strokeWidth={3} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
