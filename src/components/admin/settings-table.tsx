"use client";
/* Existing Thai copy in this legacy settings screen contains literal quote marks. */
/* eslint-disable react/no-unescaped-entities */

import { useEffect, useState, useTransition, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { SITE_BRAND_LOGO_PATH } from "@/lib/site-branding";

type Setting = {
  key: string;
  value: string | null;
  description: string | null;
  updatedAt: string;
};

type SettingsTableProps = {
  isMainSite: boolean;
};

const LOGIN_BACKGROUND_KEY = "login_bg_image";
const LOGIN_BACKGROUND_ASPECT_RATIO = 16 / 9;
const LOGIN_BACKGROUND_ASPECT_TOLERANCE = 0.02;

function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    image.src = objectUrl;
  });
}

export default function SettingsTable({ isMainSite }: SettingsTableProps) {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [isPending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const fetchSettings = () => {
    startTransition(async () => {
      const res = await fetch("/api/admin/settings", { credentials: "include" });
      if (!res.ok) {
        toast.error("โหลดการตั้งค่าไม่สำเร็จ");
        return;
      }
      const data = (await res.json()) as { settings: Setting[] };
      setSettings(data.settings);
      const initialDrafts: Record<string, string> = {};
      data.settings.forEach((setting) => {
        initialDrafts[setting.key] = setting.value ?? "";
      });
      setDrafts(initialDrafts);
    });
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleDraftChange = (key: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      const changedSettings: Record<string, string | null> = {};
      let hasChanges = false;
      
      Object.entries(drafts).forEach(([key, value]) => {
        const originalValue = settings.find(s => s.key === key)?.value ?? "";
        if (value !== originalValue) {
          changedSettings[key] = value.trim() || null;
          hasChanges = true;
        }
      });

      if (!hasChanges) {
        toast.info("ไม่มีการตั้งค่าใดเปลี่ยนแปลง");
        setIsSaving(false);
        return;
      }

      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ settings: changedSettings }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        toast.error(payload?.message ?? "ไม่สามารถบันทึกการตั้งค่าได้");
        return;
      }

      const payload = (await res.json()) as { message: string };
      toast.success(payload.message ?? "บันทึกการตั้งค่าเรียบร้อย");
      fetchSettings();
    } catch (error) {
      console.error("Save settings error:", error);
      toast.error("ไม่สามารถบันทึกการตั้งค่าได้");
    } finally {
      setIsSaving(false);
    }
  };

  const groupedSettings = {
    site: settings.filter((s) => s.key.startsWith("site_")),
    announcement: settings.filter((s) => s.key.startsWith("announcement_")),
    poster: settings.filter((s) => s.key.startsWith("home_poster_")),
    pricing: settings.filter((s) => s.key === "discount_percentage"),
    slip2go: settings.filter((s) => s.key.startsWith("slip2go_")),
    bankAccount: settings.filter((s) => s.key.startsWith("bank_")),
    payment: settings.filter((s) => s.key.includes("minimum_topup") || s.key.includes("expected_receiver")),
    contact: settings.filter((s) => s.key === "admin_contact_url"),
    theme: settings.filter((s) => s.key.startsWith("theme_color")),
    registration: settings.filter((s) => s.key === "registration_enabled"),
    ranking: settings.filter((s) => s.key.startsWith("ranking_")),
  };

  const announcementText = drafts["announcement_text"] ?? "";
  const announcementEnabled = drafts["announcement_enabled"] === "true";
  const posterEnabled = drafts["home_poster_enabled"] === "true";
  const registrationEnabled = drafts["registration_enabled"] === "true";
  const youtubeEnabled = drafts["home_youtube_enabled"] === "true";
  const moviesEnabled = drafts["home_movies_enabled"] === "true";
  const featuredEnabled = drafts["home_featured_enabled"] !== "false";
  const shortcutsEnabled = drafts["home_shortcuts_enabled"] === "true";
  const rankingEnabled = drafts["ranking_enabled"] !== "false";
  const rankingRealtime = drafts["ranking_realtime"] === "true";
  const rankingShowAvatar = drafts["ranking_show_avatar"] !== "false";
  const rankingShowUsername = drafts["ranking_show_username"] !== "false";
  const rankingShowAmount = drafts["ranking_show_amount"] !== "false";
  const rankingAutoReset = drafts["ranking_auto_reset_monthly"] !== "false";
  const rankingCount = drafts["ranking_count"] || "10";
  const rankingTimezone = drafts["ranking_timezone"] || "Asia/Bangkok";
  const loginBackgroundUrl = drafts[LOGIN_BACKGROUND_KEY] ?? "";
  const popupAnnouncementEnabled = drafts["popup_announcement_enabled"] !== "false";
  const popupAnnouncementFrequency = drafts["popup_announcement_frequency"] || "once_a_day";
  const popupAnnouncementHideInApp = drafts["popup_announcement_hide_in_app"] !== "false";
  const popupAnnouncementSlideInterval = drafts["popup_announcement_slide_interval"] || "2";
  const [selectedBannerId, setSelectedBannerId] = useState(1);

  type PopupBannerItem = {
    id: number;
    enabled: boolean;
    imageUrl: string;
    action: "none" | "install_app" | "open_link";
    linkUrl: string;
  };

  const popupAnnouncementItems: PopupBannerItem[] = useMemo(() => {
    try {
      if (drafts["popup_announcement_items"]) {
        const parsed = JSON.parse(drafts["popup_announcement_items"]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return Array.from({ length: 5 }, (_, i) => {
            const existing = parsed.find((p: any) => p.id === i + 1) || parsed[i];
            return {
              id: i + 1,
              enabled: existing ? Boolean(existing.enabled) : false,
              imageUrl: existing?.imageUrl ?? "",
              action: (existing?.action as any) || "none",
              linkUrl: existing?.linkUrl ?? "",
            };
          });
        }
      }
    } catch (e) {
      console.error("Error parsing popup_announcement_items:", e);
    }

    return [
      {
        id: 1,
        enabled: drafts["popup_announcement_enabled"] !== "false",
        imageUrl: drafts["popup_announcement_image_url"] || "/images/popup-pwa-announcement.jpg",
        action: (drafts["popup_announcement_action"] as any) || "install_app",
        linkUrl: drafts["popup_announcement_link_url"] ?? "",
      },
      { id: 2, enabled: false, imageUrl: "", action: "none", linkUrl: "" },
      { id: 3, enabled: false, imageUrl: "", action: "none", linkUrl: "" },
      { id: 4, enabled: false, imageUrl: "", action: "none", linkUrl: "" },
      { id: 5, enabled: false, imageUrl: "", action: "none", linkUrl: "" },
    ];
  }, [
    drafts["popup_announcement_items"],
    drafts["popup_announcement_enabled"],
    drafts["popup_announcement_image_url"],
    drafts["popup_announcement_action"],
    drafts["popup_announcement_link_url"],
  ]);

  const handleUpdatePopupBanner = (id: number, updates: Partial<PopupBannerItem>) => {
    const newItems = popupAnnouncementItems.map((item) =>
      item.id === id ? { ...item, ...updates } : item
    );
    handleDraftChange("popup_announcement_items", JSON.stringify(newItems));

    // Sync banner 1 to legacy keys for backward compatibility
    if (id === 1) {
      if (updates.imageUrl !== undefined) {
        handleDraftChange("popup_announcement_image_url", updates.imageUrl);
      }
      if (updates.action !== undefined) {
        handleDraftChange("popup_announcement_action", updates.action);
      }
      if (updates.linkUrl !== undefined) {
        handleDraftChange("popup_announcement_link_url", updates.linkUrl);
      }
    }
  };

  const handleBannerFileUpload = async (bannerId: number, file: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("กรุณาอัปโหลดไฟล์รูปภาพเท่านั้น");
      return;
    }
    if (file.size > 16 * 1024 * 1024) {
      toast.error("ขนาดไฟล์รูปภาพเกิน 16MB");
      return;
    }

    const toastId = toast.loading(`กำลังอัปโหลดรูปภาพป้ายที่ ${bannerId}...`);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "posters");

      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => null);
      if (res.ok && data?.url) {
        toast.success(`อัปโหลดรูปภาพป้ายที่ ${bannerId} สำเร็จ!`, { id: toastId });
        handleUpdatePopupBanner(bannerId, { imageUrl: data.url });
        return;
      }
      toast.error(data?.message ?? "ไม่สามารถอัปโหลดรูปภาพได้", { id: toastId });
    } catch (err) {
      console.error("Banner upload error:", err);
      toast.error("ไม่สามารถอัปโหลดรูปภาพได้", { id: toastId });
    }
  };

  const handleFileChange = async (key: string, file: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("กรุณาอัปโหลดไฟล์รูปภาพเท่านั้น");
      return;
    }

    const isLoginBackground = key === LOGIN_BACKGROUND_KEY;
    if (isLoginBackground) {
      const dimensions = await readImageDimensions(file);
      const ratio = dimensions && dimensions.height > 0
        ? dimensions.width / dimensions.height
        : null;

      if (!ratio || Math.abs(ratio - LOGIN_BACKGROUND_ASPECT_RATIO) > LOGIN_BACKGROUND_ASPECT_TOLERANCE) {
        toast.error("รูปพื้นหลังหน้า Login ต้องเป็นสัดส่วน 16:9 เช่น 1600x900px");
        return;
      }
    }

    if (file.size > 16 * 1024 * 1024) {
      toast.error("ขนาดไฟล์รูปภาพเกิน 16MB กรุณาลดขนาดภาพหรือใช้วิธีวางลิงก์ URL แทน");
      return;
    }

    const folder =
      key === "home_poster_image_url" || key === "popup_announcement_image_url" || key.includes("movie")
        ? "posters"
        : key.includes("shortcut")
          ? "shortcuts"
          : "settings";
    const toastId = toast.loading("กำลังอัปโหลดรูปภาพความละเอียดต้นฉบับไปยัง Hostatom...");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", folder);
      if (isLoginBackground) {
        formData.append("purpose", "login-background");
      }

      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => null);
      if (res.ok && data?.url) {
        toast.success("อัปโหลดและรักษาความละเอียดต้นฉบับสำเร็จ!", { id: toastId });
        handleDraftChange(key, data.url);
        return;
      }

      if (isLoginBackground) {
        toast.error(data?.message ?? "ไม่สามารถอัปโหลดภาพพื้นหลังหน้า Login ได้", { id: toastId });
        return;
      }
    } catch (err) {
      console.warn("Direct upload failed, falling back to local processing:", err);
      if (isLoginBackground) {
        toast.error("ไม่สามารถอัปโหลดภาพพื้นหลังหน้า Login ได้ กรุณาลองใหม่", { id: toastId });
        return;
      }
    }

    // Fallback: Local Canvas Processing for smaller images
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let MAX_WIDTH = 960;
        const quality = 0.90;

        if (key.includes("site_logo")) {
          MAX_WIDTH = 512;
        }

        const scaleFactor = MAX_WIDTH / img.width;
        if (img.width > MAX_WIDTH) {
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * scaleFactor;
        } else {
          canvas.width = img.width;
          canvas.height = img.height;
        }

        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);

        const compressedBase64 = canvas.toDataURL("image/webp", quality);
        toast.success("เตรียมรูปภาพสำรองสำเร็จ", { id: toastId });
        handleDraftChange(key, compressedBase64);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-[#0B0B0B]">ตั้งค่าเว็บไซต์</h3>
          <p className="text-sm text-[#6B7280]">ตั้งค่า logo และข้อมูลพื้นฐานของเว็บไซต์</p>
        </div>
        <div className="space-y-4 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-6">
          <div className="space-y-3">
            <Label className="text-sm font-semibold text-[#0B0B0B]">
              Logo เว็บไซต์
            </Label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex h-16 w-32 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 border border-[var(--theme-color)]/20">
                <img
                  src={drafts["site_logo_url"] || SITE_BRAND_LOGO_PATH}
                  alt="Site Logo"
                  className="h-full w-full object-contain p-2"
                />
              </div>
              <div className="flex gap-2">
                <Label
                  htmlFor="upload-site-logo"
                  className="cursor-pointer rounded-lg bg-[var(--theme-color)]/10 px-4 py-2 text-sm font-semibold text-[var(--theme-color)] hover:bg-[var(--theme-color)]/20"
                >
                  อัปโหลด Logo
                </Label>
                <input
                  id="upload-site-logo"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileChange("site_logo_url", file);
                  }}
                  className="hidden"
                  disabled={isPending || isSaving}
                />
                {drafts["site_logo_url"] && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleDraftChange("site_logo_url", "")}
                    className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                    disabled={isPending || isSaving}
                  >
                    ลบรูป
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="setting-site_title" className="text-sm text-[#0B0B0B]">
              Title Bar (ชื่อแท็บเบราว์เซอร์)
            </Label>
            <Input
              id="setting-site_title"
              type="text"
              value={drafts["site_title"] ?? ""}
              onChange={(e) => handleDraftChange("site_title", e.target.value)}
              placeholder="App By Mari | ขายแอพพรีเมียมราคาถูก Netflix, Spotify, YouTube แท้"
              className="rounded-lg border-[var(--theme-color)]/30 bg-white focus-visible:ring-[var(--theme-color)]"
              disabled={isPending || isSaving}
            />
            <p className="text-xs text-[#6B7280]">
              แสดงผลที่ด้านบนสุดของเว็บเบราว์เซอร์
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="setting-site_name" className="text-sm text-[#0B0B0B]">
              ชื่อร้าน (Shop Name)
            </Label>
            <Input
              id="setting-site_name"
              type="text"
              value={drafts["site_name"] ?? ""}
              onChange={(e) => handleDraftChange("site_name", e.target.value)}
              placeholder="PremiumBySom"
              className="rounded-lg border-[var(--theme-color)]/30 bg-white focus-visible:ring-[var(--theme-color)]"
              disabled={isPending || isSaving}
            />
            <p className="text-xs text-[#6B7280]">
              แสดงผลข้างๆ โลโก้ในแถบเมนู (Navbar)
            </p>
          </div>

          <Separator className="bg-[#E5E7EB]/60 my-4" />

          <div className="space-y-4 pt-2">
            <div className="flex flex-col gap-3 rounded-lg border border-dashed border-[var(--theme-color)]/40 bg-white/70 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <Label htmlFor="home_shortcuts_enabled" className="text-sm font-semibold text-[#0B0B0B]">
                  แสดงปุ่มลัด (Shortcut Buttons) หน้าแรก
                </Label>
                <p className="text-xs text-[#6B7280]">
                  เปิด/ปิด การแสดงปุ่มลัด 4 ปุ่มใต้แถบประกาศหน้าแรก
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="home_shortcuts_enabled"
                  checked={shortcutsEnabled}
                  onCheckedChange={(checked) =>
                    handleDraftChange("home_shortcuts_enabled", checked ? "true" : "false")
                  }
                  disabled={isPending || isSaving}
                />
                <span className="text-sm text-[#6B7280]">{shortcutsEnabled ? "เปิด" : "ปิด"}</span>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-semibold text-[#0B0B0B]">ตั้งค่าปุ่มลัดทั้ง 4 ปุ่ม (ขนาดแนะนำ 480x200px)</Label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[1, 2, 3, 4].map((num) => {
                  const imgKey = `home_shortcut_image_${num}`;
                  const linkKey = `home_shortcut_link_${num}`;
                  const imgBase64 = drafts[imgKey] ?? "";
                  const linkValue = drafts[linkKey] ?? "";

                  return (
                    <div key={num} className="space-y-3 rounded-xl border border-[var(--theme-color)]/20 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[var(--theme-color)]">ปุ่มลัดที่ {num}</span>
                        {imgBase64 && (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => handleDraftChange(imgKey, "")}
                            className="h-6 px-2 text-red-500 hover:text-red-700 hover:bg-red-50 text-xs"
                            disabled={isPending || isSaving}
                          >
                            ลบรูป
                          </Button>
                        )}
                      </div>

                      {/* Preview Box */}
                      <div className="relative aspect-[480/200] w-full overflow-hidden rounded-lg bg-zinc-50 border border-[var(--theme-color)]/10 flex items-center justify-center">
                        {imgBase64 ? (
                          <img
                            src={imgBase64}
                            alt={`Shortcut Preview ${num}`}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-center text-xs text-zinc-400">ยังไม่มีรูปภาพ (แนะนำ 480x200px)</span>
                        )}
                      </div>

                      {/* File Input & Link Input */}
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Label
                            htmlFor={`shortcut-file-${num}`}
                            className="flex h-9 cursor-pointer items-center justify-center rounded-lg bg-[var(--theme-color)]/10 px-3 text-center text-xs font-semibold text-[var(--theme-color)] transition hover:bg-[var(--theme-color)]/20 shrink-0"
                          >
                            อัปโหลดรูป
                          </Label>
                          <input
                            id={`shortcut-file-${num}`}
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileChange(imgKey, file);
                            }}
                            className="hidden"
                            disabled={isPending || isSaving}
                          />
                          <Input
                            type="text"
                            value={imgBase64?.startsWith('http') ? imgBase64 : (imgBase64 ? '(ไฟล์อัปโหลด)' : '')}
                            onChange={(e) => handleDraftChange(imgKey, e.target.value)}
                            placeholder="หรือใส่ลิงก์รูป (URL)"
                            className="h-9 text-xs rounded-lg border-[var(--theme-color)]/30 bg-white focus-visible:ring-[var(--theme-color)]"
                            disabled={isPending || isSaving}
                          />
                        </div>
                        <Input
                          type="text"
                          value={linkValue}
                          onChange={(e) => handleDraftChange(linkKey, e.target.value)}
                          placeholder="ใส่ลิงก์ปลายทางเมื่อคลิกรูป (เช่น /products)"
                          className="h-9 text-xs rounded-lg border-[var(--theme-color)]/30 bg-white focus-visible:ring-[var(--theme-color)]"
                          disabled={isPending || isSaving}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Separator className="bg-[#E5E7EB]" />

      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-[#0B0B0B]">พื้นหลังหน้า Login</h3>
          <p className="text-sm text-[#6B7280]">
            เปลี่ยนภาพพื้นหลังหน้าเข้าสู่ระบบ ใช้ร่วมกับทุก Theme และรองรับสัดส่วนมาตรฐาน 16:9
          </p>
        </div>
        <div className="space-y-5 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-6">
          <div className="grid gap-5 md:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.9fr)] md:items-start">
            <div className="overflow-hidden rounded-xl border border-[var(--theme-color)]/20 bg-white shadow-sm">
              <div className="relative aspect-[16/9] w-full bg-zinc-100">
                {loginBackgroundUrl ? (
                  <img
                    src={loginBackgroundUrl}
                    alt="ตัวอย่างพื้นหลังหน้า Login"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-4 text-center text-sm text-zinc-400">
                    ยังไม่ได้กำหนดภาพ ระบบจะใช้พื้นหลังตาม Theme ปัจจุบัน
                  </div>
                )}
              </div>
              <div className="border-t border-zinc-100 px-4 py-3 text-xs text-[#6B7280]">
                Preview 16:9 · แนะนำอย่างน้อย 1600×900px
              </div>
            </div>

            <div className="space-y-3">
              <Label
                htmlFor="upload-login-background"
                className="flex cursor-pointer items-center justify-center rounded-lg bg-[var(--theme-color)]/10 px-4 py-2 text-sm font-semibold text-[var(--theme-color)] hover:bg-[var(--theme-color)]/20"
              >
                อัปโหลดภาพพื้นหลัง
              </Label>
              <input
                id="upload-login-background"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFileChange(LOGIN_BACKGROUND_KEY, file);
                  e.currentTarget.value = "";
                }}
                className="hidden"
                disabled={isPending || isSaving}
              />

              <div className="space-y-1">
                <Label htmlFor="login-background-url" className="text-xs text-[#0B0B0B]">
                  หรือวางลิงก์ภาพ (URL)
                </Label>
                <Input
                  id="login-background-url"
                  type="url"
                  value={loginBackgroundUrl.startsWith("data:image") ? "" : loginBackgroundUrl}
                  onChange={(e) => handleDraftChange(LOGIN_BACKGROUND_KEY, e.target.value)}
                  placeholder="https://.../login-background.jpg"
                  className="h-9 text-xs rounded-lg border-[var(--theme-color)]/30 bg-white focus-visible:ring-[var(--theme-color)]"
                  disabled={isPending || isSaving}
                />
              </div>

              {loginBackgroundUrl ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleDraftChange(LOGIN_BACKGROUND_KEY, "")}
                  className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  disabled={isPending || isSaving}
                >
                  ใช้พื้นหลังตาม Theme แทน
                </Button>
              ) : null}

              <p className="text-xs leading-relaxed text-[#6B7280]">
                รองรับ PNG, JPG/JPEG และ WEBP เท่านั้นสำหรับการอัปโหลด ระบบจะตรวจสอบสัดส่วน 16:9 ก่อนรับไฟล์
              </p>
            </div>
          </div>
        </div>
      </div>

      {isMainSite ? (
        <>
          <Separator className="bg-[#E5E7EB]" />

          <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-[#0B0B0B]">ระบบ Ranking ยอดขาย</h3>
          <p className="text-sm text-[#6B7280]">ตั้งค่าการ์ด TOP สมาชิกจากรายการเติมเงินที่สำเร็จของเดือนปัจจุบัน</p>
        </div>
        <div className="space-y-4 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-6">
          {[
            ["ranking_enabled", "เปิดใช้งาน Ranking", rankingEnabled],
            ["ranking_realtime", "อัปเดตแบบ Realtime (Polling 30 วินาที)", rankingRealtime],
            ["ranking_show_avatar", "แสดง Avatar", rankingShowAvatar],
            ["ranking_show_username", "แสดงชื่อผู้ใช้", rankingShowUsername],
            ["ranking_show_amount", "แสดงยอดเติมเงิน", rankingShowAmount],
            ["ranking_auto_reset_monthly", "เริ่มรอบใหม่อัตโนมัติทุกต้นเดือน", rankingAutoReset],
          ].map(([key, label, enabled]) => (
            <div key={key as string} className="flex flex-col gap-3 rounded-lg border border-dashed border-[var(--theme-color)]/40 bg-white/70 p-4 sm:flex-row sm:items-center sm:justify-between">
              <Label htmlFor={key as string} className="text-sm font-semibold text-[#0B0B0B]">{label as string}</Label>
              <div className="flex items-center gap-3">
                <Switch
                  id={key as string}
                  checked={enabled as boolean}
                  onCheckedChange={(checked) => handleDraftChange(key as string, checked ? "true" : "false")}
                  disabled={isPending || isSaving}
                />
                <span className="text-sm text-[#6B7280]">{enabled ? "เปิด" : "ปิด"}</span>
              </div>
            </div>
          ))}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ranking_count" className="text-sm font-semibold text-[#0B0B0B]">จำนวนอันดับที่แสดง (1–10)</Label>
              <Input
                id="ranking_count"
                type="number"
                min="1"
                max="10"
                value={rankingCount}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "" || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 10)) {
                    handleDraftChange("ranking_count", value);
                  }
                }}
                className="rounded-lg border-[var(--theme-color)]/30 bg-white focus-visible:ring-[var(--theme-color)]"
                disabled={isPending || isSaving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ranking_timezone" className="text-sm font-semibold text-[#0B0B0B]">Timezone</Label>
              <Input
                id="ranking_timezone"
                value={rankingTimezone}
                onChange={(event) => handleDraftChange("ranking_timezone", event.target.value)}
                placeholder="Asia/Bangkok"
                className="rounded-lg border-[var(--theme-color)]/30 bg-white focus-visible:ring-[var(--theme-color)]"
                disabled={isPending || isSaving}
              />
            </div>
          </div>
          <p className="text-xs leading-relaxed text-[#6B7280]">Ranking ใช้ `slip_history` ที่สถานะ success และกรอง `site_id` ของ Main Site โดยไม่ลบข้อมูลเดือนเก่า</p>
        </div>
          </div>

          <Separator className="bg-[#E5E7EB]" />
        </>
      ) : null}

      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-[#0B0B0B]">สีธีมหลัก (Theme Color)</h3>
          <p className="text-sm text-[#6B7280]">ปรับแต่งสีหลักของเว็บไซต์</p>
        </div>
        <div className="space-y-4 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-6">
          <div className="grid gap-4 sm:grid-cols-1">
            <div className="space-y-2">
              <Label htmlFor="theme_color" className="text-sm text-[#0B0B0B]">
                สีหลักของปุ่ม/ข้อความ (Hex Code)
              </Label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={drafts["theme_color"] || "#ff985c"}
                  onChange={(e) => handleDraftChange("theme_color", e.target.value)}
                  className="w-10 h-10 rounded border-0 cursor-pointer"
                  disabled={isPending || isSaving}
                />
                <Input
                  id="theme_color"
                  value={drafts["theme_color"] || "#ff985c"}
                  onChange={(e) => handleDraftChange("theme_color", e.target.value)}
                  placeholder="#ff985c"
                  className="rounded-lg border-[#E5E7EB] bg-white focus-visible:ring-[var(--theme-color)]"
                  disabled={isPending || isSaving}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="theme_color_nav" className="text-sm text-[#0B0B0B]">
                สีพื้นหลัง Navbar (ลูกศรสีแดง)
              </Label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={drafts["theme_color_nav"] || "#e79940"}
                  onChange={(e) => handleDraftChange("theme_color_nav", e.target.value)}
                  className="w-10 h-10 rounded border-0 cursor-pointer"
                  disabled={isPending || isSaving}
                />
                <Input
                  id="theme_color_nav"
                  value={drafts["theme_color_nav"] || "#e79940"}
                  onChange={(e) => handleDraftChange("theme_color_nav", e.target.value)}
                  placeholder="#e79940"
                  className="rounded-lg border-[#E5E7EB] bg-white focus-visible:ring-[var(--theme-color)]"
                  disabled={isPending || isSaving}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="theme_color_bg_top" className="text-sm text-[#0B0B0B]">
                สีพื้นหลังส่วนบน (ลูกศรสีเขียว)
              </Label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={drafts["theme_color_bg_top"] || "#F5DDC2"}
                  onChange={(e) => handleDraftChange("theme_color_bg_top", e.target.value)}
                  className="w-10 h-10 rounded border-0 cursor-pointer"
                  disabled={isPending || isSaving}
                />
                <Input
                  id="theme_color_bg_top"
                  value={drafts["theme_color_bg_top"] || "#F5DDC2"}
                  onChange={(e) => handleDraftChange("theme_color_bg_top", e.target.value)}
                  placeholder="#F5DDC2"
                  className="rounded-lg border-[#E5E7EB] bg-white focus-visible:ring-[var(--theme-color)]"
                  disabled={isPending || isSaving}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="theme_color_bg_bottom" className="text-sm text-[#0B0B0B]">
                สีพื้นหลังส่วนล่าง/สินค้า (ลูกศรสีน้ำเงิน)
              </Label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={drafts["theme_color_bg_bottom"] || "#F7C58D"}
                  onChange={(e) => handleDraftChange("theme_color_bg_bottom", e.target.value)}
                  className="w-10 h-10 rounded border-0 cursor-pointer"
                  disabled={isPending || isSaving}
                />
                <Input
                  id="theme_color_bg_bottom"
                  value={drafts["theme_color_bg_bottom"] || "#F7C58D"}
                  onChange={(e) => handleDraftChange("theme_color_bg_bottom", e.target.value)}
                  placeholder="#F7C58D"
                  className="rounded-lg border-[#E5E7EB] bg-white focus-visible:ring-[var(--theme-color)]"
                  disabled={isPending || isSaving}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="theme_color_header_bg" className="text-sm text-[#0B0B0B]">
                สีพื้นหลังด้านบนสุด (แถบด้านหลังสุด)
              </Label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={drafts["theme_color_header_bg"] || "#ffffff"}
                  onChange={(e) => handleDraftChange("theme_color_header_bg", e.target.value)}
                  className="w-10 h-10 rounded border-0 cursor-pointer"
                  disabled={isPending || isSaving}
                />
                <Input
                  id="theme_color_header_bg"
                  value={drafts["theme_color_header_bg"] || "#ffffff"}
                  onChange={(e) => handleDraftChange("theme_color_header_bg", e.target.value)}
                  placeholder="#ffffff"
                  className="rounded-lg border-[#E5E7EB] bg-white focus-visible:ring-[var(--theme-color)]"
                  disabled={isPending || isSaving}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="theme_color_announcement" className="text-sm text-[#0B0B0B]">
                สีพื้นหลังแถบประกาศ (Announcement Bar)
              </Label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={drafts["theme_color_announcement"] || "#ff985c"}
                  onChange={(e) => handleDraftChange("theme_color_announcement", e.target.value)}
                  className="w-10 h-10 rounded border-0 cursor-pointer"
                  disabled={isPending || isSaving}
                />
                <Input
                  id="theme_color_announcement"
                  value={drafts["theme_color_announcement"] || "#ff985c"}
                  onChange={(e) => handleDraftChange("theme_color_announcement", e.target.value)}
                  placeholder="#ff985c"
                  className="rounded-lg border-[#E5E7EB] bg-white focus-visible:ring-[var(--theme-color)]"
                  disabled={isPending || isSaving}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="theme_color_text_accent" className="text-sm text-[#0B0B0B]">
                สีตัวอักษรเน้นย้ำ (เช่น หัวข้อสถิติ, จำนวนสินค้า)
              </Label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={drafts["theme_color_text_accent"] || "#D94654"}
                  onChange={(e) => handleDraftChange("theme_color_text_accent", e.target.value)}
                  className="w-10 h-10 rounded border-0 cursor-pointer"
                  disabled={isPending || isSaving}
                />
                <Input
                  id="theme_color_text_accent"
                  value={drafts["theme_color_text_accent"] || "#D94654"}
                  onChange={(e) => handleDraftChange("theme_color_text_accent", e.target.value)}
                  placeholder="#D94654"
                  className="rounded-lg border-[#E5E7EB] bg-white focus-visible:ring-[var(--theme-color)]"
                  disabled={isPending || isSaving}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <Separator className="bg-[#E5E7EB]" />

      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-[#0B0B0B] flex items-center gap-2">
            <span>📢 ป้ายประกาศป๊อปอัปหน้าแรก (Popup Announcement Modal)</span>
          </h3>
          <p className="text-sm text-[#6B7280]">
            ป๊อปอัปเด้งกลางจอเมื่อลูกค้าเข้าเว็บหรือหน้าแอป (ขนาด 80% ปรับได้สูงสุด 5 ป้าย พร้อมระบบสไลด์เปลี่ยนวนอัตโนมัติ)
          </p>
        </div>
        <div className="space-y-5 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-6">
          {/* Master Toggle */}
          <div className="flex flex-col gap-3 rounded-lg border border-dashed border-[var(--theme-color)]/40 bg-white/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <Label htmlFor="popup_announcement_enabled" className="text-sm font-semibold text-[#0B0B0B]">
                เปิดใช้งานป้ายประกาศป๊อปอัป (ระบบหลัก)
              </Label>
              <p className="text-xs text-[#6B7280]">
                เปิด/ปิดการเด้งป้ายประกาศเมื่อเปิดเข้าเว็บหรือหน้าแอป
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="popup_announcement_enabled"
                checked={popupAnnouncementEnabled}
                onCheckedChange={(checked) =>
                  handleDraftChange("popup_announcement_enabled", checked ? "true" : "false")
                }
                disabled={isPending || isSaving}
              />
              <span className="text-sm font-medium text-[#6B7280]">
                {popupAnnouncementEnabled ? "เปิด 🟢" : "ปิด ⚪"}
              </span>
            </div>
          </div>

          {/* Global Behavior: Frequency & Slide Interval */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-[#0B0B0B]">
                ความถี่ในการเด้งแจ้งเตือน
              </Label>
              <select
                value={popupAnnouncementFrequency}
                onChange={(e) => handleDraftChange("popup_announcement_frequency", e.target.value)}
                className="w-full h-10 px-3 py-2 text-sm rounded-lg border border-[#E5E7EB] bg-white text-[#0B0B0B] focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                disabled={isPending || isSaving}
              >
                <option value="once_a_day">🗓️ เด้งวันละ 1 ครั้งต่อผู้ใช้ (รีเซ็ตทุกเที่ยงคืน)</option>
                <option value="every_session">🔄 เด้งทุกครั้งที่เปิดเข้าเว็บ</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-[#0B0B0B]">
                ความเร็วในการสไลด์เปลี่ยนป้าย (เมื่อเปิดมากกว่า 1 ป้าย)
              </Label>
              <select
                value={popupAnnouncementSlideInterval}
                onChange={(e) => handleDraftChange("popup_announcement_slide_interval", e.target.value)}
                className="w-full h-10 px-3 py-2 text-sm rounded-lg border border-[#E5E7EB] bg-white text-[#0B0B0B] focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                disabled={isPending || isSaving}
              >
                <option value="2">⚡ ทุก 2 วินาที (รวดเร็ว ทันใจ)</option>
                <option value="3">⏱️ ทุก 3 วินาที (สมดุล สบายตา แนะนำ)</option>
                <option value="4">⏳ ทุก 4 วินาที (อ่านรายละเอียดชัดเจน)</option>
                <option value="5">🐌 ทุก 5 วินาที (สไลด์ช้าๆ)</option>
              </select>
            </div>
          </div>

          {/* Banner Slot Selector (1 to 5) */}
          <div className="space-y-3 pt-3 border-t border-zinc-200/70">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Label className="text-sm font-semibold text-[#0B0B0B]">
                  รายการป้ายประกาศ (เลือกเพื่อแก้ไข แต่ละป้ายได้สูงสุด 5 อัน)
                </Label>
                <p className="text-xs text-[#6B7280]">
                  สามารถเปิด-ปิดแต่ละป้ายแยกอิสระ หากเปิดเกิน 1 ป้ายจะสไลด์วนอัตโนมัติ
                </p>
              </div>
              <span className="text-xs font-semibold text-[var(--theme-color)] bg-[var(--theme-color)]/10 px-3 py-1 rounded-full border border-[var(--theme-color)]/20">
                เปิดใช้งาน {popupAnnouncementItems.filter((b) => b.enabled && b.imageUrl).length} / 5 ป้าย
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {popupAnnouncementItems.map((banner) => {
                const isSelected = selectedBannerId === banner.id;
                const isBannerActive = banner.enabled && Boolean(banner.imageUrl);
                return (
                  <button
                    key={banner.id}
                    type="button"
                    onClick={() => setSelectedBannerId(banner.id)}
                    className={`relative flex flex-col items-center p-2.5 rounded-xl border text-xs font-medium transition-all text-left ${
                      isSelected
                        ? "border-[var(--theme-color)] bg-white ring-2 ring-[var(--theme-color)]/30 shadow-md scale-[1.02]"
                        : "border-zinc-200 bg-white/70 hover:bg-white text-zinc-600 hover:border-zinc-300 shadow-sm"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1.5">
                      <span className="font-bold text-zinc-800">ป้ายที่ {banner.id}</span>
                      <span
                        className={`size-2 rounded-full ${
                          isBannerActive
                            ? "bg-emerald-500 shadow-[0_0_6px_#10b981]"
                            : "bg-zinc-300"
                        }`}
                        title={isBannerActive ? "เปิดใช้งานอยู่" : "ปิดอยู่"}
                      />
                    </div>
                    <div className="relative size-12 rounded-lg bg-zinc-900/10 overflow-hidden border border-zinc-200 flex items-center justify-center">
                      {banner.imageUrl ? (
                        <img src={banner.imageUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <span className="text-[10px] text-zinc-400">ยังไม่มีรูป</span>
                      )}
                    </div>
                    <span className="mt-1.5 text-[11px] truncate max-w-full font-medium">
                      {!banner.enabled
                        ? "⚪ ปิดอยู่"
                        : banner.action === "none"
                        ? "🛑 แสดงเฉยๆ"
                        : banner.action === "install_app"
                        ? "📲 โหลดแอป"
                        : "🔗 ลิงก์เว็บ"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Selected Banner Editor Form */}
          {(() => {
            const currentBanner =
              popupAnnouncementItems.find((b) => b.id === selectedBannerId) ||
              popupAnnouncementItems[0];
            return (
              <div className="rounded-xl border border-zinc-200/80 bg-white p-5 space-y-4 shadow-sm">
                {/* Banner Header & Individual Toggle */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex items-center justify-center size-7 rounded-lg bg-[var(--theme-color)] text-white text-xs font-bold shadow-sm">
                      {currentBanner.id}
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-zinc-900">
                        ตั้งค่าป้ายประกาศที่ {currentBanner.id}
                      </h4>
                      <p className="text-xs text-zinc-500">
                        กำหนดรูปภาพ และพฤติกรรมเมื่อผู้ใช้คลิกสำหรับป้ายนี้โดยเฉพาะ
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-zinc-50 px-3 py-1.5 rounded-lg border border-zinc-200">
                    <Label
                      htmlFor={`banner-toggle-${currentBanner.id}`}
                      className="text-xs font-medium text-zinc-700 cursor-pointer"
                    >
                      {currentBanner.enabled ? "เปิดใช้งานป้ายนี้ 🟢" : "ปิดป้ายนี้ ⚪"}
                    </Label>
                    <Switch
                      id={`banner-toggle-${currentBanner.id}`}
                      checked={currentBanner.enabled}
                      onCheckedChange={(checked) =>
                        handleUpdatePopupBanner(currentBanner.id, { enabled: checked })
                      }
                      disabled={isPending || isSaving}
                    />
                  </div>
                </div>

                {/* Banner Image Preview & Upload */}
                <div className="space-y-3">
                  <Label className="text-xs font-semibold text-[#0B0B0B]">
                    รูปภาพป้ายประกาศที่ {currentBanner.id}
                  </Label>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="relative flex aspect-square w-36 items-center justify-center overflow-hidden rounded-2xl bg-zinc-900 border border-[var(--theme-color)]/30 shadow-md shrink-0">
                      {currentBanner.imageUrl ? (
                        <img
                          src={currentBanner.imageUrl}
                          alt={`Banner ${currentBanner.id}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-center text-xs text-zinc-400">ยังไม่มีรูปภาพ</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 w-full max-w-sm">
                      <Label
                        htmlFor={`upload-popup-banner-${currentBanner.id}`}
                        className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-[var(--theme-color)]/10 px-4 py-2 text-xs font-semibold text-[var(--theme-color)] hover:bg-[var(--theme-color)]/20 transition-colors"
                      >
                        อัปโหลดรูปภาพป้ายที่ {currentBanner.id}
                      </Label>
                      <input
                        id={`upload-popup-banner-${currentBanner.id}`}
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            await handleBannerFileUpload(currentBanner.id, file);
                          }
                          e.currentTarget.value = "";
                        }}
                        className="hidden"
                        disabled={isPending || isSaving}
                      />
                      <div className="flex items-center gap-2 my-0.5">
                        <div className="flex-1 border-t border-zinc-200"></div>
                        <span className="text-[11px] text-zinc-400">หรือระบุ URL รูปภาพ</span>
                        <div className="flex-1 border-t border-zinc-200"></div>
                      </div>
                      <Input
                        value={currentBanner.imageUrl}
                        onChange={(e) =>
                          handleUpdatePopupBanner(currentBanner.id, { imageUrl: e.target.value })
                        }
                        placeholder={
                          currentBanner.id === 1
                            ? "/images/popup-pwa-announcement.jpg"
                            : "https://... หรือ /images/..."
                        }
                        className="rounded-lg border-[#E5E7EB] bg-white text-xs h-9"
                        disabled={isPending || isSaving}
                      />
                      {currentBanner.imageUrl && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleUpdatePopupBanner(currentBanner.id, { imageUrl: "" })}
                          className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 w-full text-xs h-8"
                          disabled={isPending || isSaving}
                        >
                          ลบรูปภาพของป้ายนี้
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-[#6B7280]">
                    แนะนำรูปทรงสี่เหลี่ยมจัตุรัส 1:1 (เช่น 1080x1080px) หรือแนวตั้ง เพื่อความคมชัดสวยงามบนมือถือ
                  </p>
                </div>

                {/* Banner Action Type */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-zinc-100">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-[#0B0B0B]">
                      พฤติกรรมเมื่อคลิกที่ป้ายนี้ (Action Type)
                    </Label>
                    <select
                      value={currentBanner.action}
                      onChange={(e) =>
                        handleUpdatePopupBanner(currentBanner.id, { action: e.target.value as any })
                      }
                      className="w-full h-9 px-3 py-1.5 text-xs rounded-lg border border-[#E5E7EB] bg-white text-[#0B0B0B] focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                      disabled={isPending || isSaving}
                    >
                      <option value="none">🛑 ปิดการคลิก (แสดงภาพโฆษณาเฉยๆ ไม่ฝังลิงก์)</option>
                      <option value="install_app">📲 ติดตั้งแอปมือถือทันที (PWA Install)</option>
                      <option value="open_link">🔗 เปิดลิงก์หน้าเว็บหรือแคมเปญ (URL Link)</option>
                    </select>
                    <p className="text-[11px] text-zinc-500">
                      {currentBanner.action === "none" &&
                        "ลูกค้าดูภาพได้อย่างเดียว เคอร์เซอร์เมาส์จะไม่เป็นรูปมือคลิก เหมาะสำหรับประกาศข่าวสารหรือภาพกราฟิก"}
                      {currentBanner.action === "install_app" &&
                        "เมื่อลูกค้าคลิกที่ป้าย จะเปิดหน้าต่างแนะนำ/ติดตั้งแอป PWA ลงเครื่องทันที"}
                      {currentBanner.action === "open_link" &&
                        "เมื่อลูกค้าคลิกที่ป้าย จะเปิดหน้าเว็บหรือลิงก์ปลายทางที่กำหนด"}
                    </p>
                  </div>

                  {currentBanner.action === "open_link" ? (
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-[#0B0B0B]">
                        ลิงก์ปลายทางเมื่อคลิก (Target URL)
                      </Label>
                      <Input
                        type="text"
                        value={currentBanner.linkUrl || ""}
                        onChange={(e) =>
                          handleUpdatePopupBanner(currentBanner.id, { linkUrl: e.target.value })
                        }
                        placeholder="/products หรือ https://..."
                        className="rounded-lg border-[#E5E7EB] bg-white text-xs h-9"
                        disabled={isPending || isSaving}
                      />
                      <p className="text-[11px] text-zinc-500">
                        ระบุ URL ภายในเช่น /products หรือลิงก์ภายนอก https://...
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center rounded-lg bg-zinc-50 border border-dashed border-zinc-200 p-3 text-xs text-zinc-400">
                      ไม่ต้องระบุลิงก์สำหรับ Action Type นี้
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Hide In App Option */}
          <div className="flex flex-col gap-3 rounded-lg border border-dashed border-zinc-300 bg-white/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <Label htmlFor="popup_announcement_hide_in_app" className="text-sm text-[#0B0B0B]">
                ซ่อนป้ายประกาศอัตโนมัติหากผู้ใช้เปิดอยู่ในแอปมือถือแล้ว
              </Label>
              <p className="text-xs text-[#6B7280]">
                หากลูกค้าติดตั้งแอป PWA แล้วเปิดใช้งานในแอป ระบบจะไม่แสดงป้ายชวนดาวน์โหลดซ้ำ
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="popup_announcement_hide_in_app"
                checked={popupAnnouncementHideInApp}
                onCheckedChange={(checked) =>
                  handleDraftChange("popup_announcement_hide_in_app", checked ? "true" : "false")
                }
                disabled={isPending || isSaving}
              />
              <span className="text-sm text-[#6B7280]">
                {popupAnnouncementHideInApp ? "เปิด" : "ปิด"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <Separator className="bg-[#E5E7EB]" />

      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-[#0B0B0B]">โปสเตอร์หน้าแรก</h3>
          <p className="text-sm text-[#6B7280]">ตั้งค่าแบนเนอร์รูปภาพที่จะขึ้นใต้ Navbar ในหน้าแรก</p>
        </div>
        <div className="space-y-5 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-6">
          <div className="flex flex-col gap-3 rounded-lg border border-dashed border-[var(--theme-color)]/40 bg-white/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <Label htmlFor="home_poster_enabled" className="text-sm text-[#0B0B0B]">
                แสดงโปสเตอร์หน้าแรก
              </Label>
              <p className="text-xs text-[#6B7280]">
                เปิด/ปิดการแสดงโปสเตอร์รูปภาพใต้ Navbar (แนะนำใส่รูปขนาด 1600x900px)
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="home_poster_enabled"
                checked={posterEnabled}
                onCheckedChange={(checked) =>
                  handleDraftChange("home_poster_enabled", checked ? "true" : "false")
                }
                disabled={isPending || isSaving}
              />
              <span className="text-sm text-[#6B7280]">{posterEnabled ? "เปิด" : "ปิด"}</span>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-semibold text-[#0B0B0B]">
              รูปโปสเตอร์
            </Label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex aspect-[16/9] w-48 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 border border-[var(--theme-color)]/20">
                {drafts["home_poster_image_url"] ? (
                  <img
                    src={drafts["home_poster_image_url"]}
                    alt="Home Poster"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-center text-xs text-zinc-400">ยังไม่มีรูปภาพ</span>
                )}
              </div>
              <div className="flex flex-col gap-2 w-full max-w-sm">
                <Label
                  htmlFor="upload-home-poster"
                  className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-[var(--theme-color)]/10 px-4 py-2 text-sm font-semibold text-[var(--theme-color)] hover:bg-[var(--theme-color)]/20"
                >
                  อัปโหลดโปสเตอร์
                </Label>
                <input
                  id="upload-home-poster"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileChange("home_poster_image_url", file);
                    e.currentTarget.value = "";
                  }}
                  className="hidden"
                  disabled={isPending || isSaving}
                />
                <div className="flex items-center gap-2 my-1">
                   <div className="flex-1 border-t border-zinc-200"></div>
                   <span className="text-xs text-zinc-400">หรือ (แนะนำ)</span>
                   <div className="flex-1 border-t border-zinc-200"></div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-[#0B0B0B]">วางลิงก์รูปภาพจากเว็บฝากรูป</Label>
                  <Input 
                    type="url"
                    placeholder="https://..."
                    value={drafts["home_poster_image_url"]?.startsWith("data:image") ? "" : drafts["home_poster_image_url"] || ""}
                    onChange={(e) => handleDraftChange("home_poster_image_url", e.target.value)}
                    className="h-9 text-xs"
                    disabled={isPending || isSaving}
                  />
                </div>
                {drafts["home_poster_image_url"] && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleDraftChange("home_poster_image_url", "")}
                    className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 w-full mt-2"
                    disabled={isPending || isSaving}
                  >
                    ลบรูป
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-[#6B7280] mt-1">
              อัปโหลดรูปภาพจากอุปกรณ์ ความละเอียดแนะนำ 16:9 (เช่น 1600x900px)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="home_poster_link_url" className="text-sm text-[#0B0B0B]">
              ลิงก์เมื่อคลิกโปสเตอร์ (ไม่บังคับ)
            </Label>
            <Input
              id="home_poster_link_url"
              type="url"
              value={drafts["home_poster_link_url"] ?? ""}
              onChange={(e) => handleDraftChange("home_poster_link_url", e.target.value)}
              placeholder="https://line.me/ti/p/~username"
              className="rounded-lg border-[var(--theme-color)]/30 bg-white focus-visible:ring-[var(--theme-color)]"
              disabled={isPending || isSaving}
            />
            <p className="text-xs text-[#6B7280]">
              หากกรอกลิงก์ ลูกค้าจะถูกพาไปยัง URL นั้นเมื่อคลิกโปสเตอร์ (เปิดแท็บใหม่)
            </p>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-dashed border-[var(--theme-color)]/40 bg-white/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <Label htmlFor="home_youtube_enabled" className="text-sm text-[#0B0B0B]">
                แสดงวิดีโอแนะนำหน้าแรก
              </Label>
              <p className="text-xs text-[#6B7280]">
                เปิด/ปิดการแสดงวิดีโอ YouTube ในหน้าแรก
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="home_youtube_enabled"
                checked={youtubeEnabled}
                onCheckedChange={(checked) =>
                  handleDraftChange("home_youtube_enabled", checked ? "true" : "false")
                }
                disabled={isPending || isSaving}
              />
              <span className="text-sm text-[#6B7280]">{youtubeEnabled ? "เปิด" : "ปิด"}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="home_youtube_url" className="text-sm text-[#0B0B0B]">
              YouTube Video URL
            </Label>
            <Input
              id="home_youtube_url"
              type="url"
              value={drafts["home_youtube_url"] ?? ""}
              onChange={(e) => handleDraftChange("home_youtube_url", e.target.value)}
              placeholder="https://www.youtube.com/watch?v=xxxxxx หรือ https://youtu.be/xxxxxx"
              className="rounded-lg border-[var(--theme-color)]/30 bg-white focus-visible:ring-[var(--theme-color)]"
              disabled={isPending || isSaving}
            />
            <p className="text-xs text-[#6B7280]">
              หากใส่ลิงก์ หน้าแรกจะแทรกวิดีโอจาก YouTube อัตโนมัติ (ข้ามหรือเว้นว่างเพื่อใช้หน้าจอปกติ)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="home_youtube_title" className="text-sm text-[#0B0B0B]">
              ชื่อคลิปวิดีโอ (จะแสดงใต้คลิปในหน้าแรก)
            </Label>
            <Input
              id="home_youtube_title"
              type="text"
              value={drafts["home_youtube_title"] ?? ""}
              onChange={(e) => handleDraftChange("home_youtube_title", e.target.value)}
              placeholder="เช่น ตัวอย่างหนังเรื่องธี่หยด 2"
              className="rounded-lg border-[var(--theme-color)]/30 bg-white focus-visible:ring-[var(--theme-color)]"
              disabled={isPending || isSaving}
            />
          </div>
        </div>
      </div>

      <Separator className="bg-[#E5E7EB]" />

      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-[#0B0B0B]">แนะนำหนังใหม่</h3>
          <p className="text-sm text-[#6B7280]">ตั้งค่าการ์ดโชว์โปสเตอร์หนังใหม่ 6 การ์ดในหน้าแรก (ไม่จำกัดสัดส่วน สามารถใช้ลิงก์รูปได้)</p>
        </div>
        <div className="space-y-5 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-6">
          <div className="flex flex-col gap-3 rounded-lg border border-dashed border-[var(--theme-color)]/40 bg-white/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <Label htmlFor="home_movies_enabled" className="text-sm text-[#0B0B0B]">
                แสดงส่วนภาพยนตร์แนะนำหน้าแรก
              </Label>
              <p className="text-xs text-[#6B7280]">
                เปิด/ปิดการแสดงแถบโปสเตอร์หนังใหม่ 6 ช่อง
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="home_movies_enabled"
                checked={moviesEnabled}
                onCheckedChange={(checked) =>
                  handleDraftChange("home_movies_enabled", checked ? "true" : "false")
                }
                disabled={isPending || isSaving}
              />
              <span className="text-sm text-[#6B7280]">{moviesEnabled ? "เปิด" : "ปิด"}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            {[1, 2, 3, 4, 5, 6].map((num) => {
              const key = `home_movie_poster_${num}`;
              const posterBase64 = drafts[key] ?? "";
              return (
                <div key={key} className="flex flex-col items-center gap-2 rounded-xl border border-[var(--theme-color)]/20 bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-semibold text-[var(--theme-color)]">ช่องที่ {num}</span>
                    {posterBase64 && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => handleDraftChange(key, "")}
                        className="h-6 px-2 text-red-500 hover:text-red-700 hover:bg-red-50 text-xs"
                        disabled={isPending || isSaving}
                      >
                        ลบรูป
                      </Button>
                    )}
                  </div>
                  
                  <div className="relative flex w-full items-center justify-center overflow-hidden rounded-lg bg-zinc-50 border border-[var(--theme-color)]/10" style={{ minHeight: '120px' }}>
                    {posterBase64 ? (
                      <img
                        src={posterBase64}
                        alt={`Movie Poster ${num}`}
                        className="h-full w-full object-contain max-h-[200px]"
                      />
                    ) : (
                      <span className="text-center text-xs text-zinc-400 px-2">ยังไม่มีรูปภาพ</span>
                    )}
                  </div>

                  <div className="flex w-full flex-col gap-2 mt-1">
                    <Label
                      htmlFor={`file-upload-movie-${num}`}
                      className="flex cursor-pointer items-center justify-center rounded-lg bg-[var(--theme-color)]/10 px-3 py-1.5 text-center text-xs font-semibold text-[var(--theme-color)] transition hover:bg-[var(--theme-color)]/20"
                    >
                      อัปโหลดรูป
                    </Label>
                    <input
                      id={`file-upload-movie-${num}`}
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileChange(key, file);
                      }}
                      className="hidden"
                      disabled={isPending || isSaving}
                    />
                    <Input
                      type="text"
                      value={posterBase64?.startsWith('http') ? posterBase64 : (posterBase64 ? '(ไฟล์อัปโหลด)' : '')}
                      onChange={(e) => handleDraftChange(key, e.target.value)}
                      placeholder="หรือใส่ลิงก์รูป (URL)"
                      className="h-8 text-xs rounded-lg border-[var(--theme-color)]/30 bg-white focus-visible:ring-[var(--theme-color)]"
                      disabled={isPending || isSaving}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Separator className="bg-[#E5E7EB]" />

      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-[#0B0B0B]">สินค้าขายดี</h3>
          <p className="text-sm text-[#6B7280]">ตั้งค่าการแสดงส่วนแนะนำสินค้าขายดีในหน้าแรก</p>
        </div>
        <div className="space-y-4 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-6">
          <div className="flex flex-col gap-3 rounded-lg border border-dashed border-[var(--theme-color)]/40 bg-white/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <Label htmlFor="home_featured_enabled" className="text-sm text-[#0B0B0B]">
                แสดงสินค้าขายดีและน่าสนใจ
              </Label>
              <p className="text-xs text-[#6B7280]">
                เปิด/ปิดการแสดงแถบ "สินค้าแนะนำสำหรับคุณ / สินค้าขายดีและน่าสนใจ" ในหน้าแรก
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="home_featured_enabled"
                checked={featuredEnabled}
                onCheckedChange={(checked) =>
                  handleDraftChange("home_featured_enabled", checked ? "true" : "false")
                }
                disabled={isPending || isSaving}
              />
              <span className="text-sm text-[#6B7280]">{featuredEnabled ? "เปิด" : "ปิด"}</span>
            </div>
          </div>
        </div>
      </div>

      <Separator className="bg-[#E5E7EB]" />

      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-[#0B0B0B]">แถบประกาศ</h3>
          <p className="text-sm text-[#6B7280]">ตั้งค่าข้อความประกาศที่แสดงใต้ navbar</p>
        </div>
        <div className="space-y-4 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-6">

          <div className="space-y-2">
            <Label htmlFor="announcement_enabled" className="text-sm text-[#0B0B0B]">
              แสดงแถบประกาศ
            </Label>
            <div className="flex items-center gap-3">
              <Switch
                id="announcement_enabled"
                checked={announcementEnabled}
                onCheckedChange={(checked) => {
                  handleDraftChange("announcement_enabled", checked ? "true" : "false");
                }}
                disabled={isPending || isSaving}
              />
              <span className="text-sm text-[#6B7280]">
                {announcementEnabled ? "เปิดใช้งาน" : "ปิดใช้งาน"}
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="announcement_text" className="text-sm text-[#0B0B0B]">
              ข้อความประกาศ
            </Label>
            <Textarea
              id="announcement_text"
              value={announcementText}
              onChange={(e) => handleDraftChange("announcement_text", e.target.value)}
              placeholder="ใส่ประกาศที่ต้องการแสดง"
              className="min-h-[100px] rounded-lg border-[var(--theme-color)]/30 bg-white focus-visible:ring-[var(--theme-color)]"
              disabled={isPending || isSaving}
            />
            <p className="text-xs text-[#6B7280]">
              รองรับ emoji และข้อความยาว สามารถเว้นบรรทัดได้
            </p>
          </div>
        </div>
      </div>

      <Separator className="bg-[#E5E7EB]" />

      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-[#0B0B0B]">ตั้งค่าราคา</h3>
          <p className="text-sm text-[#6B7280]">ตั้งค่าเปอร์เซ็นต์ส่วนลดที่แสดงในราคาเดิม</p>
        </div>
        <div className="space-y-4 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-6">
          {groupedSettings.pricing.map((setting) => {
            const displayName =
              setting.key === "discount_percentage"
                ? "เปอร์เซ็นต์ส่วนลด (%)"
                : setting.description ?? setting.key;

            return (
              <div key={setting.key} className="space-y-2">
                <Label htmlFor={`setting-${setting.key}`} className="text-sm text-[#0B0B0B]">
                  {displayName}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`setting-${setting.key}`}
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={drafts[setting.key] ?? ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "" || (/^\d+(\.\d+)?$/.test(value) && parseFloat(value) >= 0 && parseFloat(value) <= 100)) {
                        handleDraftChange(setting.key, value);
                      }
                    }}
                    placeholder="10"
                    className="rounded-lg border-[var(--theme-color)]/30 bg-white focus-visible:ring-[var(--theme-color)]"
                    disabled={isPending || isSaving}
                  />
                  <span className="text-sm text-[#6B7280]">%</span>
                </div>
                <p className="text-xs text-[#6B7280]">
                  {setting.key === "discount_percentage"
                    ? "เปอร์เซ็นต์ส่วนลดที่ใช้คำนวณราคาเดิม (เช่น 10 = 10% ของราคาขาย) ตัวอย่าง: ถ้าราคาขาย 100 บาท และตั้งไว้ 10% ราคาเดิมจะแสดงเป็น 110 บาท"
                    : "ตั้งค่าส่วนลด"}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <Separator className="bg-[#E5E7EB]" />

      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-[#0B0B0B]">การตั้งค่าระบบสมัครสมาชิก</h3>
          <p className="text-sm text-[#6B7280]">เปิด/ปิดระบบสมัครสมาชิกใหม่</p>
        </div>
        <div className="space-y-4 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-6">
          <div className="flex flex-col gap-3 rounded-lg border border-dashed border-[var(--theme-color)]/40 bg-white/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <Label htmlFor="registration_enabled" className="text-sm text-[#0B0B0B]">
                เปิดใช้งานระบบสมัครสมาชิก
              </Label>
              <p className="text-xs text-[#6B7280]">
                เมื่อปิดการใช้งาน ผู้ใช้จะไม่สามารถสมัครสมาชิกใหม่ได้
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="registration_enabled"
                checked={registrationEnabled}
                onCheckedChange={(checked) =>
                  handleDraftChange("registration_enabled", checked ? "true" : "false")
                }
                disabled={isPending || isSaving}
              />
              <span className="text-sm text-[#6B7280]">{registrationEnabled ? "เปิด" : "ปิด"}</span>
            </div>
          </div>
        </div>
      </div>

      <Separator className="bg-[#E5E7EB]" />

      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-[#0B0B0B]">การตั้งค่าติดต่อแอดมิน</h3>
          <p className="text-sm text-[#6B7280]">ตั้งค่าลิงก์สำหรับปุ่มติดต่อแอดมิน (Sticky Icon)</p>
        </div>
        <div className="space-y-4 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-6">
          {groupedSettings.contact.map((setting) => (
            <div key={setting.key} className="space-y-2">
              <Label htmlFor={`setting-${setting.key}`} className="text-sm text-[#0B0B0B]">
                {setting.description ?? "ลิงก์ติดต่อแอดมิน"}
              </Label>
              <Input
                id={`setting-${setting.key}`}
                type="url"
                value={drafts[setting.key] ?? ""}
                onChange={(e) => handleDraftChange(setting.key, e.target.value)}
                placeholder="https://line.me/ti/p/~username หรือ https://m.me/username"
                className="rounded-lg border-[var(--theme-color)]/30 bg-white focus-visible:ring-[var(--theme-color)]"
                disabled={isPending || isSaving}
              />
              <p className="text-xs text-[#6B7280]">
                ใส่ URL สำหรับติดต่อแอดมิน (เช่น LINE, Facebook Messenger, Discord) หรือเว้นว่างเพื่อซ่อนปุ่ม
              </p>
            </div>
          ))}
        </div>
      </div>

      <Separator className="bg-[#E5E7EB]" />

      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-[#0B0B0B]">การตั้งค่า Slip2Go API</h3>
          <p className="text-sm text-[#6B7280]">ตั้งค่า API สำหรับตรวจสอบสลิปโอนเงินแบบอัปโหลดรูปภาพ</p>
        </div>
        <div className="space-y-4 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-6">
          {groupedSettings.slip2go.map((setting) => (
            <div key={setting.key} className="space-y-2">
              <Label htmlFor={`setting-${setting.key}`} className="text-sm text-[#0B0B0B]">
                {setting.description ?? setting.key}
                {setting.key.includes("secret") ? (
                  <span className="ml-2 text-xs text-[#6B7280]">(จะไม่แสดงค่าปัจจุบัน)</span>
                ) : null}
              </Label>
              <Input
                id={`setting-${setting.key}`}
                type={setting.key.includes("secret") ? "password" : "text"}
                value={drafts[setting.key] ?? ""}
                onChange={(e) => handleDraftChange(setting.key, e.target.value)}
                placeholder={setting.description ?? setting.key}
                className="rounded-xl border-[var(--theme-color)]/30 bg-white focus-visible:ring-[var(--theme-color)]"
                disabled={isPending || isSaving}
              />
            </div>
          ))}
        </div>
      </div>

      <Separator className="bg-[#E5E7EB]" />

      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-[#0B0B0B]">ข้อมูลบัญชีธนาคาร</h3>
          <p className="text-sm text-[#6B7280]">ตั้งค่าข้อมูลบัญชีธนาคารสำหรับรับเงินโอน</p>
        </div>
        <div className="space-y-4 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-6">
          {groupedSettings.bankAccount.map((setting) => (
            <div key={setting.key} className="space-y-2">
              <Label htmlFor={`setting-${setting.key}`} className="text-sm text-[#0B0B0B]">
                {setting.description ?? setting.key}
              </Label>
              <Input
                id={`setting-${setting.key}`}
                type="text"
                value={drafts[setting.key] ?? ""}
                onChange={(e) => handleDraftChange(setting.key, e.target.value)}
                placeholder={setting.description ?? setting.key}
                className="rounded-xl border-[var(--theme-color)]/30 bg-white focus-visible:ring-[var(--theme-color)]"
                disabled={isPending || isSaving}
              />
            </div>
          ))}
        </div>
      </div>

      <Separator className="bg-[#E5E7EB]" />

      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-[#0B0B0B]">การตั้งค่าการเติมเงิน</h3>
          <p className="text-sm text-[#6B7280]">ตั้งค่าบัญชีผู้รับเงินและจำนวนเงินขั้นต่ำ</p>
        </div>
        <div className="space-y-4 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-6">
          {groupedSettings.payment.map((setting) => (
            <div key={setting.key} className="space-y-2">
              <Label htmlFor={`setting-${setting.key}`} className="text-sm text-[#0B0B0B]">
                {setting.description ?? setting.key}
              </Label>
              <Input
                id={`setting-${setting.key}`}
                type={setting.key.includes("amount") ? "number" : "text"}
                value={drafts[setting.key] ?? ""}
                onChange={(e) => handleDraftChange(setting.key, e.target.value)}
                placeholder={setting.description ?? setting.key}
                className="rounded-xl border-[var(--theme-color)]/30 bg-white focus-visible:ring-[var(--theme-color)]"
                disabled={isPending || isSaving}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={handleSaveAll}
          disabled={isPending || isSaving}
          className="rounded-lg bg-[var(--theme-color)] text-white hover:bg-[var(--theme-color)] hover:text-white"
        >
          {isSaving ? "กำลังบันทึก..." : "บันทึกการตั้งค่าทั้งหมด"}
        </Button>
      </div>
    </div>
  );
}

