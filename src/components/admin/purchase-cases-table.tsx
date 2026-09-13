"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FileText, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { PurchaseCaseSummary } from "@/lib/purchase-cases/types";

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatPoints(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusLabel(status: PurchaseCaseSummary["status"]) {
  return status === "COMPLETED" ? "สำเร็จ" : status === "PROCESSING" ? "กำลังดำเนินการ" : status;
}

export default function PurchaseCasesTable() {
  const [cases, setCases] = useState<PurchaseCaseSummary[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50", offset: "0" });
      if (search.trim()) params.set("search", search.trim());
      if (status) params.set("status", status);
      const response = await fetch(`/api/admin/purchase-cases?${params.toString()}`, { credentials: "include", cache: "no-store" });
      const body = await response.json().catch(() => null) as { cases?: PurchaseCaseSummary[]; total?: number; message?: string } | null;
      if (!response.ok) throw new Error(body?.message || "ไม่สามารถโหลด Case Order ได้");
      setCases(body?.cases ?? []);
      setTotal(body?.total ?? 0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ไม่สามารถโหลด Case Order ได้");
    } finally {
      setIsLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9CA3AF]" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหา Case Order, Receipt No. หรือผู้ซื้อ" className="pl-9" />
        </div>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-md border border-[#e6dad2] bg-white px-3 text-sm text-[#4b3b33]">
          <option value="">ทุกสถานะ</option>
          <option value="COMPLETED">สำเร็จ</option>
          <option value="PROCESSING">กำลังดำเนินการ</option>
          <option value="FAILED">ล้มเหลว</option>
        </select>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={isLoading}>
          <RefreshCw className={isLoading ? "size-4 animate-spin" : "size-4"} /> รีเฟรช
        </Button>
      </div>

      <p className="text-xs text-[#77665d]">พบ {total.toLocaleString("th-TH")} Case Order</p>

      {isLoading && cases.length === 0 ? (
        <div className="flex justify-center p-10"><Loader2 className="size-6 animate-spin text-[var(--theme-color)]" /></div>
      ) : cases.length === 0 ? (
        <Card className="border-dashed border-[#e6dad2] bg-[#fffdfb]"><CardContent className="p-10 text-center text-sm text-[#77665d]">ยังไม่พบ Case Order</CardContent></Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#e6dad2]">
          <table className="min-w-full divide-y divide-[#e6dad2] text-sm">
            <thead className="bg-[#fbf8f5] text-left text-xs font-semibold text-[#77665d]">
              <tr>
                <th className="px-4 py-3">Case Order / Receipt</th>
                <th className="px-4 py-3">ผู้ซื้อ</th>
                <th className="px-4 py-3">รายการ</th>
                <th className="px-4 py-3 text-right">ยอดรวม</th>
                <th className="px-4 py-3">วันที่/สถานะ</th>
                <th className="px-4 py-3 text-center">เอกสาร</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee5df] bg-white">
              {cases.map((item) => (
                <tr key={item.id} className="align-top hover:bg-[#fffaf7]">
                  <td className="px-4 py-4">
                    <p className="font-semibold text-[#2c231f]">{item.caseOrderNo}</p>
                    <p className="mt-1 text-xs text-[#77665d]">{item.receipt?.receiptNo ? `Receipt ${item.receipt.receiptNo}` : "ยังไม่มี Receipt"}</p>
                    {item.siteName ? <Badge variant="outline" className="mt-2 text-[10px]">{item.siteName}</Badge> : null}
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-medium text-[#2c231f]">{item.buyerDisplayName || "-"}</p>
                    <p className="text-xs text-[#77665d]">{item.buyerEmail || item.buyerUserId}</p>
                  </td>
                  <td className="max-w-[280px] px-4 py-4">
                    {item.items.map((line) => <p key={line.id} className="truncate text-xs text-[#4b3b33]">{line.productName} × {line.quantity}</p>)}
                  </td>
                  <td className="px-4 py-4 text-right font-semibold text-[#a65a3f]">{formatPoints(item.totalPoints)} พ้อยท์</td>
                  <td className="px-4 py-4 text-xs text-[#77665d]"><p>{formatDate(item.completedAt || item.createdAt)}</p><Badge className="mt-2 bg-[#eaf7ed] text-[#26733c]">{statusLabel(item.status)}</Badge></td>
                  <td className="px-4 py-4 text-center">
                    {item.receipt ? <Button asChild size="sm" variant="outline"><Link href={`/admin/receipts/${item.id}`} target="_blank"><FileText className="size-3.5" /> เปิด/พิมพ์</Link></Button> : <span className="text-xs text-[#9CA3AF]">-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
