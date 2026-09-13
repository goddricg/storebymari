"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getProfileAvatarUrl } from "@/lib/ranking/avatars";
import {
  countDisplayNameCharacters,
  getDisplayNameError,
  normalizeDisplayName,
} from "@/lib/profile/validation";

type ProfileIdentityCardProps = {
  userId: string;
  initialDisplayName: string | null;
  initialAvatarKey: string | null;
};

export default function ProfileIdentityCard({
  userId,
  initialDisplayName,
  initialAvatarKey,
}: ProfileIdentityCardProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName ?? "");
  const [avatarKey, setAvatarKey] = useState(initialAvatarKey);
  const [draft, setDraft] = useState(initialDisplayName ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleAvatarUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; avatarKey?: string }>).detail;
      if (detail?.userId === userId && detail.avatarKey) setAvatarKey(detail.avatarKey);
    };

    window.addEventListener("appbymari:profile-avatar-updated", handleAvatarUpdate);
    return () => window.removeEventListener("appbymari:profile-avatar-updated", handleAvatarUpdate);
  }, [userId]);

  const beginEditing = () => {
    setDraft(displayName);
    setError(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setDraft(displayName);
    setError(null);
    setIsEditing(false);
  };

  const saveDisplayName = async () => {
    const normalized = normalizeDisplayName(draft);
    const validationError = getDisplayNameError(normalized);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/profile/display-name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ displayName: normalized }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { displayName?: string; message?: string }
        | null;

      if (!response.ok || !payload?.displayName) {
        setError(payload?.message ?? "ไม่สามารถบันทึกชื่อแสดงได้");
        return;
      }

      setDisplayName(payload.displayName);
      setDraft(payload.displayName);
      setIsEditing(false);
      toast.success("บันทึกชื่อแสดงแล้ว");
    } catch {
      setError("ไม่สามารถเชื่อมต่อเพื่อบันทึกชื่อแสดงได้");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[#f5b3c8] bg-gradient-to-br from-[#fff8fb] via-white to-[#fff0f6] p-4 shadow-[0_8px_24px_rgba(226,93,139,0.12)] sm:p-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative mx-auto size-36 shrink-0 rounded-[2rem] border-4 border-[#f5abc2] bg-white p-2 shadow-[0_8px_24px_rgba(224,83,132,0.2)] sm:mx-0 sm:size-40">
          <div className="size-full overflow-hidden rounded-full border-2 border-white bg-[#fff4f8] shadow-inner">
            <img
              src={getProfileAvatarUrl(avatarKey)}
              alt="รูปโปรไฟล์"
              className="size-full object-cover"
              decoding="async"
            />
          </div>
          <span className="pointer-events-none absolute -right-1 -top-1 size-5 rounded-full border-2 border-white bg-[#ffb3c9] shadow-sm" />
          <span className="pointer-events-none absolute -bottom-1 -left-1 size-4 rounded-full border-2 border-white bg-[#ffd36f] shadow-sm" />
        </div>

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <p className="text-xs font-semibold text-[#a45d72]">ชื่อแสดงของคุณ</p>
            {!isEditing ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={beginEditing}
                className="h-8 rounded-full px-3 text-xs text-[#dd5e86] hover:bg-[#fff0f5] hover:text-[#c7436d]"
              >
                <Pencil className="mr-1.5 size-3.5" />
                แก้ไขชื่อ
              </Button>
            ) : null}
          </div>

          {isEditing ? (
            <div className="mt-2 space-y-2">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void saveDisplayName();
                  if (event.key === "Escape") cancelEditing();
                }}
                autoFocus
                aria-label="ชื่อแสดง"
                className="w-full rounded-xl border border-[#f2abc1] bg-white px-3 py-2 text-base font-semibold text-[#542b3a] outline-none ring-[#f27ea4] placeholder:text-[#cba3b1] focus:ring-2"
              />
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <span className="text-xs text-[#9d7080]">
                  {countDisplayNameCharacters(draft)} / 60 ตัวอักษร
                </span>
                <Button
                  type="button"
                  onClick={() => void saveDisplayName()}
                  disabled={isSaving}
                  size="sm"
                  className="h-8 rounded-full bg-[#ed78a0] px-3 text-xs text-white hover:bg-[#dc5b89]"
                >
                  <Check className="mr-1.5 size-3.5" />
                  {isSaving ? "กำลังบันทึก" : "บันทึก"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={cancelEditing}
                  disabled={isSaving}
                  className="h-8 rounded-full px-3 text-xs text-[#9d7080] hover:bg-[#fff0f5]"
                >
                  <X className="mr-1.5 size-3.5" />
                  ยกเลิก
                </Button>
              </div>
              {error ? <p className="text-xs font-medium text-[#d34969]">{error}</p> : null}
            </div>
          ) : (
            <p className="mt-1 break-words text-2xl font-extrabold leading-tight text-[#542b3a] sm:text-3xl">
              {displayName || "ยังไม่ได้ตั้งชื่อ"}
            </p>
          )}

          {!isEditing && error ? <p className="mt-2 text-xs font-medium text-[#d34969]">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
