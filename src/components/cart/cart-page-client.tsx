"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCart } from "@/components/cart/cart-provider";
import { useSession } from "@/lib/auth/use-session";
import { MAX_CART_LINE_ITEMS } from "@/lib/cart/limits";

type CheckoutResponse = {
  ok?: boolean;
  message?: string;
  caseOrder?: { caseOrderNo?: string; receipt?: { receiptNo?: string } | null };
};

function formatPoints(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CartPageClient() {
  const { items, totalQuantity, estimatedTotal, updateQuantity, removeItem, clear, isHydrated } = useCart();
  const { user } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState<CheckoutResponse["caseOrder"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canCheckout = useMemo(() => isHydrated && items.length > 0 && !isSubmitting, [isHydrated, items.length, isSubmitting]);

  const checkout = async () => {
    if (!user) {
      window.location.href = `/login?redirect=${encodeURIComponent("/cart")}`;
      return;
    }
    if (!canCheckout) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          lines: items.map((item) => ({ typeId: item.typeId, quantity: item.quantity })),
        }),
      });
      const body = await response.json().catch(() => ({})) as CheckoutResponse;
      if (!response.ok || !body.ok) {
        setError(body.message ?? "ไม่สามารถสั่งซื้อจากตะกร้าได้");
        return;
      }
      clear();
      setSuccess(body.caseOrder ?? null);
      toast.success("สั่งซื้อสินค้าสำเร็จ");
    } catch {
      setError("ไม่สามารถเชื่อมต่อระบบสั่งซื้อได้ กรุณาลองใหม่");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="min-h-screen bg-[var(--theme-color-bg-bottom)] py-8 sm:py-12">
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-10">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <Badge className="bg-[var(--theme-color)]/10 text-[var(--theme-color)]">ตะกร้าสินค้า</Badge>
            <h1 className="mt-3 text-2xl font-bold text-[#0B0B0B] sm:text-3xl">ตรวจสอบรายการสั่งซื้อ</h1>
            <p className="mt-2 text-sm text-[#6B7280]">ซื้อสินค้าหลายรายการใน Case Order เดียวได้ง่ายขึ้น</p>
            <p className="mt-1 text-xs text-[#9CA3AF]">ตะกร้ารองรับไม่เกิน {MAX_CART_LINE_ITEMS} รายการต่อครั้ง และไม่จำกัดจำนวนชิ้นต่อรายการ (ตามสต็อก) ส่วนสินค้าที่จัดส่งผ่าน External Provider ให้ใช้ปุ่มซื้อทันที</p>
          </div>
          {items.length > 0 ? (
            <Button type="button" variant="ghost" className="text-xs text-[#9CA3AF]" onClick={() => clear()}>
              ล้างตะกร้า
            </Button>
          ) : null}
        </div>

        {success ? (
          <Card className="mb-6 border-[#f0a1bd] bg-white shadow-sm">
            <CardContent className="space-y-3 p-6">
              <p className="text-lg font-bold text-[var(--theme-color)]">สั่งซื้อสำเร็จ</p>
              <p className="text-sm text-[#4B5563]">
                Case Order: <span className="font-semibold text-[#111827]">{success.caseOrderNo ?? "-"}</span>
              </p>
              {success.receipt?.receiptNo ? (
                <p className="text-sm text-[#4B5563]">Receipt No.: {success.receipt.receiptNo}</p>
              ) : null}
              <Button asChild className="bg-[var(--theme-color)] text-white hover:bg-[var(--theme-color)]">
                <Link href="/dashboard/orders">ดูรายการสั่งซื้อและใบเสร็จ</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {!isHydrated ? (
          <Card className="border-[#E5E7EB] bg-white"><CardContent className="p-8 text-center text-sm text-[#6B7280]">กำลังโหลดตะกร้า...</CardContent></Card>
        ) : items.length === 0 ? (
          <Card className="border-dashed border-[var(--theme-color)]/30 bg-white">
            <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
              <ShoppingBag className="size-12 text-[var(--theme-color)]/50" />
              <div>
                <p className="font-semibold text-[#374151]">ยังไม่มีสินค้าในตะกร้า</p>
                <p className="mt-1 text-sm text-[#6B7280]">เลือกสินค้าเพื่อเพิ่มลงตะกร้าได้จากหน้าสินค้า</p>
              </div>
              <Button asChild className="bg-[var(--theme-color)] text-white hover:bg-[var(--theme-color)]">
                <Link href="/products">เลือกซื้อสินค้า</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <Card className="border-[#E5E7EB] bg-white shadow-sm">
              <CardHeader><CardTitle className="text-lg text-[#111827]">รายการสินค้า ({items.length}/{MAX_CART_LINE_ITEMS} รายการ · {totalQuantity} ชิ้น)</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {items.map((item) => (
                  <div key={item.typeId} className="flex gap-3 rounded-2xl border border-[#E5E7EB] p-3 sm:gap-4 sm:p-4">
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-[#F9FAFB] sm:size-20">
                      {item.imageUrl ? <Image src={item.imageUrl} alt={item.productName} fill className="object-contain p-1" unoptimized /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 font-semibold text-[#111827]">{item.productName}</p>
                      <p className="mt-1 text-xs text-[#9CA3AF]">รหัส: {item.typeId}</p>
                      <p className="mt-2 text-sm font-semibold text-[var(--theme-color)]">
                        {item.price == null ? "ตรวจสอบราคาก่อนชำระ" : `${formatPoints(item.price)} พ้อยท์/ชิ้น`}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <div className="flex items-center rounded-lg border border-[#E5E7EB]">
                          <Button type="button" size="icon-sm" variant="ghost" aria-label="ลดจำนวน" className="text-[#111827] hover:bg-[#F9FAFB]" onClick={() => updateQuantity(item.typeId, item.quantity - 1)}><Minus className="size-3" /></Button>
                          <Input aria-label={`จำนวน ${item.productName}`} value={item.quantity} onChange={(event) => updateQuantity(item.typeId, Number(event.target.value))} className="h-8 w-14 border-0 px-1 text-center font-semibold text-[#111827] focus-visible:ring-0" inputMode="numeric" />
                          <Button type="button" size="icon-sm" variant="ghost" aria-label="เพิ่มจำนวน" className="text-[#111827] hover:bg-[#F9FAFB]" onClick={() => updateQuantity(item.typeId, item.quantity + 1)}><Plus className="size-3" /></Button>
                        </div>
                        <Button type="button" size="sm" variant="ghost" className="text-xs text-[#B91C1C] hover:text-[#991B1B]" onClick={() => removeItem(item.typeId)}><Trash2 className="size-3.5" />ลบ</Button>
                      </div>
                    </div>
                    <div className="hidden text-right sm:block">
                      <p className="text-xs text-[#9CA3AF]">ยอดโดยประมาณ</p>
                      <p className="mt-1 font-bold text-[#111827]">{item.price == null ? "-" : `${formatPoints(item.price * item.quantity)} พ้อยท์`}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="h-fit border-[#E5E7EB] bg-white shadow-sm lg:sticky lg:top-24">
              <CardHeader><CardTitle className="text-lg">สรุปคำสั่งซื้อ</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between text-sm text-[#6B7280]"><span>จำนวนรายการ</span><span className="font-semibold text-[#111827]">{items.length}/{MAX_CART_LINE_ITEMS}</span></div>
                <div className="flex justify-between text-sm text-[#6B7280]"><span>จำนวนชิ้นรวม</span><span className="font-semibold text-[#111827]">{totalQuantity} ชิ้น</span></div>
                <div className="flex justify-between border-t border-[#E5E7EB] pt-4 text-base font-bold text-[#111827]"><span>ยอดรวมโดยประมาณ</span><span className="text-[var(--theme-color)]">{formatPoints(estimatedTotal)} พ้อยท์</span></div>
                <p className="text-xs leading-5 text-[#9CA3AF]">ระบบจะตรวจสอบราคาและสต็อกล่าสุดอีกครั้งก่อนตัดพ้อยท์ ยอดจริงอาจเปลี่ยนตาม Tier ของบัญชี</p>
                {error ? <p className="rounded-lg bg-red-50 p-3 text-xs font-medium text-red-700">{error}</p> : null}
                <Button type="button" className="h-11 w-full bg-[var(--theme-color)] text-white hover:bg-[var(--theme-color)]" disabled={!canCheckout} onClick={() => void checkout()}>
                  {isSubmitting ? "กำลังสั่งซื้อ..." : user ? "ยืนยันสั่งซื้อ" : "เข้าสู่ระบบเพื่อสั่งซื้อ"}
                </Button>
                <Button asChild type="button" variant="outline" className="w-full"><Link href="/products">เลือกสินค้าเพิ่ม</Link></Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </section>
  );
}
