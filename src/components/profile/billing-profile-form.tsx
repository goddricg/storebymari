"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Check, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type BillingForm = {
  fullName: string;
  taxId: string;
  addressLine1: string;
  addressLine2: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
  phone: string;
};

const EMPTY_FORM: BillingForm = {
  fullName: "",
  taxId: "",
  addressLine1: "",
  addressLine2: "",
  subdistrict: "",
  district: "",
  province: "",
  postalCode: "",
  phone: "",
};

function toForm(value: Record<string, unknown> | null | undefined): BillingForm {
  return {
    fullName: String(value?.fullName ?? ""),
    taxId: String(value?.taxId ?? ""),
    addressLine1: String(value?.addressLine1 ?? ""),
    addressLine2: String(value?.addressLine2 ?? ""),
    subdistrict: String(value?.subdistrict ?? ""),
    district: String(value?.district ?? ""),
    province: String(value?.province ?? ""),
    postalCode: String(value?.postalCode ?? ""),
    phone: String(value?.phone ?? ""),
  };
}

export default function BillingProfileForm() {
  const [form, setForm] = useState<BillingForm>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/profile/billing", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as { billingProfile?: Record<string, unknown> | null } | null;
        if (active && response.ok) setForm(toForm(body?.billingProfile));
      })
      .catch(() => undefined)
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  const update = (key: keyof BillingForm, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const response = await fetch("/api/profile/billing", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim() || null]))),
      });
      const body = await response.json().catch(() => null) as { message?: string; billingProfile?: Record<string, unknown> } | null;
      if (!response.ok) throw new Error(body?.message || "ไม่สามารถบันทึกข้อมูลออกบิลได้");
      setForm(toForm(body?.billingProfile));
      toast.success("บันทึกข้อมูลสำหรับออกบิลแล้ว");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ไม่สามารถบันทึกข้อมูลออกบิลได้");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[#f5b3c8] bg-gradient-to-br from-[#fff8fb] via-white to-[#fff0f6] p-4 shadow-[0_8px_24px_rgba(226,93,139,0.08)] sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-full bg-[#ffe5ef] p-2 text-[#d94d82]"><FileText className="size-4" /></div>
        <div>
          <p className="font-bold text-[#542b3a]">ข้อมูลสำหรับออกบิล</p>
          <p className="mt-1 text-xs leading-5 text-[#9d7080]">กรอกไว้ครั้งเดียว ระบบจะนำข้อมูลไปใช้กับ Receipt ในอนาคต ที่อยู่ไม่จำเป็นต้องกรอก</p>
        </div>
      </div>
      {isLoading ? <div className="flex items-center gap-2 text-sm text-[#9d7080]"><Loader2 className="size-4 animate-spin" />กำลังโหลดข้อมูล...</div> : (
        <form className="space-y-4" onSubmit={save}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="billing-full-name">ชื่อสำหรับออกบิล</Label><Input id="billing-full-name" value={form.fullName} onChange={(event) => update("fullName", event.target.value)} placeholder="ชื่อ-นามสกุล หรือชื่อบริษัท" maxLength={255} /></div>
            <div className="space-y-1.5"><Label htmlFor="billing-tax-id">เลขประจำตัวผู้เสียภาษี</Label><Input id="billing-tax-id" value={form.taxId} onChange={(event) => update("taxId", event.target.value.replace(/\D/g, "").slice(0, 13))} placeholder="13 หลัก (ถ้ามี)" inputMode="numeric" maxLength={13} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="billing-address-1">ที่อยู่</Label><Textarea id="billing-address-1" value={form.addressLine1} onChange={(event) => update("addressLine1", event.target.value)} placeholder="บ้านเลขที่ ถนน ซอย" maxLength={1000} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="billing-address-2">รายละเอียดที่อยู่เพิ่มเติม</Label><Textarea id="billing-address-2" value={form.addressLine2} onChange={(event) => update("addressLine2", event.target.value)} placeholder="อาคาร ชั้น หมู่บ้าน (ถ้ามี)" maxLength={1000} /></div>
            <div className="space-y-1.5"><Label htmlFor="billing-subdistrict">แขวง/ตำบล</Label><Input id="billing-subdistrict" value={form.subdistrict} onChange={(event) => update("subdistrict", event.target.value)} maxLength={255} /></div>
            <div className="space-y-1.5"><Label htmlFor="billing-district">เขต/อำเภอ</Label><Input id="billing-district" value={form.district} onChange={(event) => update("district", event.target.value)} maxLength={255} /></div>
            <div className="space-y-1.5"><Label htmlFor="billing-province">จังหวัด</Label><Input id="billing-province" value={form.province} onChange={(event) => update("province", event.target.value)} maxLength={255} /></div>
            <div className="space-y-1.5"><Label htmlFor="billing-postal-code">รหัสไปรษณีย์</Label><Input id="billing-postal-code" value={form.postalCode} onChange={(event) => update("postalCode", event.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" maxLength={5} /></div>
            <div className="space-y-1.5"><Label htmlFor="billing-phone">เบอร์โทรศัพท์</Label><Input id="billing-phone" value={form.phone} onChange={(event) => update("phone", event.target.value)} inputMode="tel" maxLength={25} /></div>
          </div>
          <Button type="submit" disabled={isSaving} className="bg-[#ed78a0] text-white hover:bg-[#dc5b89]"><Check className="size-4" />{isSaving ? "กำลังบันทึก..." : "บันทึกข้อมูลออกบิล"}</Button>
        </form>
      )}
    </div>
  );
}
