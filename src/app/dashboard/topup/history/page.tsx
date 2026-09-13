import type { Metadata } from "next";
import Link from "next/link";
import { FileText, History, Wallet } from "lucide-react";

import { requireUser } from "@/lib/auth/server";
import { listTopupCashReceiptsForUser } from "@/lib/receipts/topup-repository";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "ประวัติใบเสร็จเติมพ้อยท์", robots: { index: false, follow: false } };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function TopupReceiptHistoryPage() {
  const user = await requireUser();
  const receipts = await listTopupCashReceiptsForUser(user.id);

  return (
    <section className="min-h-screen bg-[var(--theme-color-bg-bottom)] py-6 sm:py-8">
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[var(--theme-color)]">
              <History className="size-5" />
              <span className="text-sm font-medium">ประวัติการเติมพ้อยท์</span>
            </div>
            <h1 className="text-xl font-semibold text-[#0B0B0B] sm:text-2xl">ใบเสร็จเติมพ้อยท์</h1>
            <p className="mt-1 text-sm text-[#6B7280]">เปิดดูหรือพิมพ์ใบเสร็จของรายการเติมเงินที่ตรวจสอบสำเร็จ</p>
          </div>
          <Button asChild variant="outline" className="border-[#E5E7EB] bg-white text-[#374151]">
            <Link href="/dashboard/topup">
              <Wallet className="mr-2 size-4" />
              กลับไปเติมพ้อยท์
            </Link>
          </Button>
        </div>

        {receipts.length === 0 ? (
          <Card className="border border-[#E5E7EB] bg-white">
            <CardContent className="flex min-h-[220px] flex-col items-center justify-center p-6 text-center">
              <FileText className="mb-3 size-10 text-[#D1D5DB]" />
              <p className="text-base font-semibold text-[#374151]">ยังไม่มีใบเสร็จเติมพ้อยท์</p>
              <p className="mt-1 text-sm text-[#6B7280]">ใบเสร็จจะถูกสร้างอัตโนมัติหลังระบบตรวจสอบสลิปสำเร็จ</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border border-[#E5E7EB] bg-white">
            <CardHeader>
              <CardTitle className="text-base">รายการใบเสร็จล่าสุด</CardTitle>
              <CardDescription className="text-xs">แสดงรายการที่ออกใบเสร็จแล้วสูงสุด 100 รายการ</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {receipts.map((receipt) => (
                <div key={receipt.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E5E7EB] bg-[#FAFAFA] p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#0B0B0B]">{receipt.receiptNo}</p>
                    <p className="mt-1 text-xs text-[#6B7280]">{formatDate(receipt.issuedAt)}</p>
                    <p className="mt-2 text-xs text-[#374151]">
                      ชำระ {formatNumber(receipt.amountPaid)} บาท · เครดิตรวม {formatNumber(receipt.creditedPoints)} พ้อยท์
                      {receipt.bonusPoints > 0 ? ` · โบนัส +${formatNumber(receipt.bonusPoints)} พ้อยท์` : ""}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline" className="border-[var(--theme-color)]/40 bg-white text-[var(--theme-color)]">
                    <Link href={`/dashboard/topup/receipts/${receipt.id}`} target="_blank" rel="noreferrer">
                      <FileText className="mr-2 size-4" />
                      ดู / พิมพ์ใบเสร็จ
                    </Link>
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}
