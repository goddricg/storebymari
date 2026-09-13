"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FileText, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type TopupReceiptRow = {
  id: string;
  receipt_no: string;
  issued_at: string;
  buyer_name: string;
  buyer_email: string | null;
  amount_paid: number;
  bonus_points: number;
  credited_points: number;
  source: string;
};

type TopupReceiptResponse = {
  rows: TopupReceiptRow[];
  meta: { total: number; page: number; limit: number; totalPages: number };
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : new Intl.DateTimeFormat("th-TH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Bangkok",
      }).format(date);
}

function formatNumber(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function TopupReceiptsTable() {
  const [rows, setRows] = useState<TopupReceiptRow[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<TopupReceiptResponse["meta"]>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  });
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async (targetPage: number) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: "20",
      });
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(`/api/admin/topup-receipts/list?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const body = await response.json().catch(() => null) as TopupReceiptResponse & { message?: string } | null;
      if (!response.ok) throw new Error(body?.message || "ไม่สามารถโหลดรายการบิลเติมเงินได้");
      setRows(body?.rows ?? []);
      setMeta(body?.meta ?? { total: 0, page: targetPage, limit: 20, totalPages: 1 });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ไม่สามารถโหลดรายการบิลเติมเงินได้");
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(page), search.trim() ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, page, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9CA3AF]" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="ค้นหาเลขที่บิล / อีเมล / ชื่อลูกค้า"
            className="pl-9"
          />
        </div>
        <Button type="button" variant="outline" onClick={() => void load(page)} disabled={isLoading}>
          <RefreshCw className={isLoading ? "size-4 animate-spin" : "size-4"} /> รีเฟรช
        </Button>
      </div>

      <p className="text-xs text-[#77665d]">
        พบ {meta.total.toLocaleString("th-TH")} ใบเสร็จเติมเงิน · แสดงเลขที่ใบเสร็จที่ออกแล้วเท่านั้น
      </p>

      {isLoading && rows.length === 0 ? (
        <div className="flex justify-center p-10"><Loader2 className="size-6 animate-spin text-[var(--theme-color)]" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#e6dad2] bg-[#fffdfb] p-10 text-center text-sm text-[#77665d]">
          ยังไม่พบใบเสร็จเติมเงิน
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#e6dad2]">
          <table className="min-w-[1000px] divide-y divide-[#e6dad2] text-sm">
            <thead className="bg-[#fbf8f5] text-left text-xs font-semibold text-[#77665d]">
              <tr>
                <th className="px-4 py-3">เลขที่ใบเสร็จ</th>
                <th className="px-4 py-3">วันที่/เวลา</th>
                <th className="px-4 py-3">ผู้เติมเงิน</th>
                <th className="px-4 py-3 text-right">เงินที่ชำระ</th>
                <th className="px-4 py-3 text-right">โบนัส</th>
                <th className="px-4 py-3 text-right">เครดิตรวม</th>
                <th className="px-4 py-3">แหล่งที่มา</th>
                <th className="px-4 py-3 text-center">เอกสาร</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee5df] bg-white">
              {rows.map((row) => (
                <tr key={row.id} className="align-top hover:bg-[#fffaf7]">
                  <td className="px-4 py-4 font-semibold text-[#2c231f]">{row.receipt_no}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-xs text-[#77665d]">{formatDate(row.issued_at)}</td>
                  <td className="px-4 py-4">
                    <p className="font-medium text-[#2c231f]">{row.buyer_name || "-"}</p>
                    <p className="text-xs text-[#77665d]">{row.buyer_email || "-"}</p>
                  </td>
                  <td className="px-4 py-4 text-right font-semibold text-[#a65a3f]">{formatNumber(row.amount_paid)} บาท</td>
                  <td className="px-4 py-4 text-right font-semibold text-[#B45309]">{row.bonus_points > 0 ? `+${formatNumber(row.bonus_points)}` : "-"}</td>
                  <td className="px-4 py-4 text-right text-[#374151]">{formatNumber(row.credited_points)} พ้อยท์</td>
                  <td className="max-w-[220px] px-4 py-4 text-xs text-[#77665d]">{row.source || "-"}</td>
                  <td className="px-4 py-4 text-center">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/topup-receipts/${encodeURIComponent(row.id)}`} target="_blank" rel="noreferrer">
                        <FileText className="size-3.5" /> เปิด/พิมพ์
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 text-xs text-[#6B7280]">
        <span>หน้า {meta.page} / {meta.totalPages}</span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="ดูรายการบิลเติมเงินหน้าก่อนหน้า"
            disabled={isLoading || page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          ><ChevronLeft className="size-4" /></Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="ดูรายการบิลเติมเงินหน้าถัดไป"
            disabled={isLoading || page >= meta.totalPages}
            onClick={() => setPage((current) => Math.min(meta.totalPages, current + 1))}
          ><ChevronRight className="size-4" /></Button>
        </div>
      </div>
    </div>
  );
}
