"use client";

import { useState } from "react";
import { KeyRound, LockKeyhole, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type PasswordChangeFormState = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const initialForm: PasswordChangeFormState = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

export default function PasswordChangeForm() {
  const [form, setForm] = useState(initialForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateField = (field: keyof PasswordChangeFormState, value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    setError(null);
  };

  const changePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.currentPassword) {
      setError("กรุณากรอกรหัสผ่านเดิมก่อน");
      return;
    }
    if (form.newPassword.length < 8) {
      setError("รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError("รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setError(payload?.message ?? "ไม่สามารถเปลี่ยนรหัสผ่านได้");
        return;
      }

      setForm(initialForm);
      toast.success("เปลี่ยนรหัสผ่านเรียบร้อยแล้ว");
    } catch {
      setError("ไม่สามารถเชื่อมต่อเพื่อเปลี่ยนรหัสผ่านได้");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form
      onSubmit={changePassword}
      className="rounded-2xl border border-[#e9d8df] bg-[#fffdfd] p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-[#fff0f5] p-2.5 text-[#e36a91]">
          <KeyRound className="size-5" />
        </div>
        <div>
          <h3 className="text-base font-bold text-[#542b3a]">เปลี่ยนรหัสผ่าน</h3>
          <p className="mt-1 text-xs text-[#9d7080]">ต้องยืนยันรหัสผ่านเดิมก่อนตั้งรหัสผ่านใหม่</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="space-y-1.5 text-xs font-semibold text-[#7c5362]">
          รหัสผ่านเดิม
          <span className="relative block">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#c591a3]" />
            <input
              type="password"
              autoComplete="current-password"
              value={form.currentPassword}
              onChange={(event) => updateField("currentPassword", event.target.value)}
              className="w-full rounded-xl border border-[#ead4dc] bg-white py-2.5 pl-9 pr-3 text-sm text-[#542b3a] outline-none focus:border-[#ed78a0] focus:ring-2 focus:ring-[#ed78a0]/20"
            />
          </span>
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-[#7c5362]">
          รหัสผ่านใหม่
          <input
            type="password"
            autoComplete="new-password"
            value={form.newPassword}
            onChange={(event) => updateField("newPassword", event.target.value)}
            className="w-full rounded-xl border border-[#ead4dc] bg-white px-3 py-2.5 text-sm text-[#542b3a] outline-none focus:border-[#ed78a0] focus:ring-2 focus:ring-[#ed78a0]/20"
          />
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-[#7c5362]">
          ยืนยันรหัสผ่านใหม่
          <input
            type="password"
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={(event) => updateField("confirmPassword", event.target.value)}
            className="w-full rounded-xl border border-[#ead4dc] bg-white px-3 py-2.5 text-sm text-[#542b3a] outline-none focus:border-[#ed78a0] focus:ring-2 focus:ring-[#ed78a0]/20"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-h-5 text-xs font-medium text-[#d34969]">{error}</p>
        <Button
          type="submit"
          disabled={isSaving}
          className="rounded-full bg-[#ed78a0] px-4 text-xs text-white hover:bg-[#dc5b89]"
        >
          <Save className="mr-1.5 size-3.5" />
          {isSaving ? "กำลังบันทึก" : "บันทึกรหัสผ่าน"}
        </Button>
      </div>
    </form>
  );
}
