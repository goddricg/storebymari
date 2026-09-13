"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Printer,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDateOnlyInTopupTimeZone } from "@/lib/topup/report-time";

type StatementSource = "ALL" | "SYSTEM" | "ADMIN";

type StatementRow = {
  id: string;
  receipt_id: string | null;
  receipt_no: string | null;
  receipt_status: "ISSUED" | "VOIDED" | null;
  recorded_at: string;
  issued_at: string | null;
  amount: number;
  base_points: number;
  bonus_points: number;
  credited_points: number;
  user_id: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  source_type: "SYSTEM" | "ADMIN";
  source_label: string | null;
  source_email: string | null;
  transaction_id: string | null;
  note: string | null;
};

type StatementSummary = {
  totalRows: number;
  totalAmount: number;
  systemRows: number;
  systemAmount: number;
  adminRows: number;
  adminAmount: number;
  rowsWithoutReceipt: number;
  uniqueUsers: number;
  firstRecordedAt: string | null;
  lastRecordedAt: string | null;
};

type StatementResponse = {
  rows: StatementRow[];
  summary: StatementSummary;
  meta: {
    page: number;
    limit: number;
    totalPages: number;
    cutoffAt: string;
    timeZone: string;
  };
};

type StatementFilters = {
  startDate: string;
  endDate: string;
  source: StatementSource;
  search: string;
};

function formatMoney(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : new Intl.DateTimeFormat("th-TH", {
        dateStyle: "medium",
        timeStyle: "medium",
        timeZone: "Asia/Bangkok",
      }).format(date);
}

function sourceLabel(row: StatementRow) {
  if (row.source_type === "ADMIN") {
    const actor = row.source_label || row.source_email;
    return actor ? `Manual By Admin: ${actor}` : "Manual By Admin";
  }
  return "SYSTEM / ตรวจสลิปอัตโนมัติ";
}

function buildQuery(filters: StatementFilters, includePaging = true) {
  const params = new URLSearchParams();
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  if (filters.source !== "ALL") params.set("source", filters.source);
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (includePaging) {
    params.set("page", "1");
    params.set("limit", "50");
  }
  return params;
}

function initialFilters(): StatementFilters {
  return {
    startDate: "2026-08-26",
    endDate: getDateOnlyInTopupTimeZone(),
    source: "ALL",
    search: "",
  };
}

export default function TopupStatementTable() {
  const [filters, setFilters] = useState<StatementFilters>(initialFilters);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [rows, setRows] = useState<StatementRow[]>([]);
  const [summary, setSummary] = useState<StatementSummary | null>(null);
  const [meta, setMeta] = useState<StatementResponse["meta"]>({
    page: 1,
    limit: 50,
    totalPages: 1,
    cutoffAt: "2026-08-26 20:42:14",
    timeZone: "Asia/Bangkok",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    const params = buildQuery(filters);
    params.set("page", String(page));

    try {
      const response = await fetch(`/api/admin/statement?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
        signal,
      });
      const body = await response.json().catch(() => null) as StatementResponse & { message?: string } | null;
      if (!response.ok) throw new Error(body?.message || "ไม่สามารถโหลด Statement เติมเงินได้");
      setRows(body?.rows ?? []);
      setSummary(body?.summary ?? null);
      setMeta(body?.meta ?? { ...meta, page });
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      const message = loadError instanceof Error ? loadError.message : "ไม่สามารถโหลด Statement เติมเงินได้";
      setError(message);
      toast.error(message);
    } finally {
      if (!signal.aborted) setIsLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), filters.search.trim() ? 250 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [filters.search, filters.startDate, filters.endDate, filters.source, load]);

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  const printUrl = useMemo(() => {
    const params = buildQuery(filters, false);
    return `/admin/statement/print?${params.toString()}`;
  }, [filters]);

  const updateFilter = <K extends keyof StatementFilters>(key: K, value: StatementFilters[K]) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const handlePageJump = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const requestedPage = Number(pageInput);
    if (!Number.isInteger(requestedPage) || requestedPage < 1) {
      toast.error("กรุณากรอกเลขหน้าตั้งแต่ 1 ขึ้นไป");
      setPageInput(String(page));
      return;
    }

    const nextPage = Math.min(requestedPage, Math.max(1, meta.totalPages));
    setPageInput(String(nextPage));
    setPage(nextPage);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border border-[#e6dad2] bg-[#fffdfb] p-4 lg:flex-row lg:items-end">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1 text-sm font-medium text-[#4b3b33]">
            <span>ตั้งแต่วันที่</span>
            <Input
              type="date"
              value={filters.startDate}
              onChange={(event) => updateFilter("startDate", event.target.value)}
              aria-label="วันที่เริ่มต้น Statement"
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-[#4b3b33]">
            <span>ถึงวันที่</span>
            <Input
              type="date"
              value={filters.endDate}
              onChange={(event) => updateFilter("endDate", event.target.value)}
              aria-label="วันที่สิ้นสุด Statement"
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-[#4b3b33]">
            <span>แหล่งที่มา</span>
            <select
              value={filters.source}
              onChange={(event) => updateFilter("source", event.target.value as StatementSource)}
              className="h-9 w-full rounded-md border border-[#e6dad2] bg-white px-3 text-sm text-[#2c231f] outline-none focus-visible:ring-2 focus-visible:ring-[#c77c5e]"
              aria-label="แหล่งที่มา Statement"
            >
              <option value="ALL">ทั้งหมด</option>
              <option value="SYSTEM">SYSTEM / ตรวจสลิป</option>
              <option value="ADMIN">Manual By Admin</option>
            </select>
          </label>
          <label className="relative space-y-1 text-sm font-medium text-[#4b3b33] sm:col-span-2 lg:col-span-3">
            <span>ค้นหา</span>
            <Search className="pointer-events-none absolute left-3 top-[2.25rem] size-4 -translate-y-1/2 text-[#9CA3AF]" />
            <Input
              value={filters.search}
              onChange={(event) => updateFilter("search", event.target.value)}
              placeholder="เลข TU / Transaction ID / ชื่อ / อีเมล / หมายเหตุ"
              className="pl-9"
              aria-label="ค้นหา Statement"
            />
          </label>
        </div>

        <div className="flex gap-2 lg:shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const controller = new AbortController();
              void load(controller.signal);
            }}
            disabled={isLoading}
          >
            <RefreshCw className={isLoading ? "size-4 animate-spin" : "size-4"} />
            รีเฟรช
          </Button>
          <Button
            type="button"
            onClick={() => window.open(printUrl, "_blank", "noopener,noreferrer")}
          >
            <Printer className="size-4" />
            Print
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-[#ead9c8] bg-[#fff8ed] px-4 py-3 text-sm text-[#7c4a25]">
        Statement นี้เริ่มนับตั้งแต่ 26 สิงหาคม 2026 เวลา 20:42:14 และใช้เวลาประเทศไทย ({meta.timeZone})
        <span className="ml-1">รายการ SYSTEM และ Manual By Admin จะแสดงแยกแหล่งที่มา</span>
      </div>

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="ยอดเติมเงินทั้งหมด" value={`${formatMoney(summary.totalAmount)} บาท`} detail={`${summary.totalRows.toLocaleString("th-TH")} รายการ`} />
          <SummaryCard label="SYSTEM" value={`${formatMoney(summary.systemAmount)} บาท`} detail={`${summary.systemRows.toLocaleString("th-TH")} รายการ`} />
          <SummaryCard label="Manual By Admin" value={`${formatMoney(summary.adminAmount)} บาท`} detail={`${summary.adminRows.toLocaleString("th-TH")} รายการ`} />
          <SummaryCard label="ผู้รับแต้ม" value={summary.uniqueUsers.toLocaleString("th-TH")} detail={summary.lastRecordedAt ? `ล่าสุด ${formatDateTime(summary.lastRecordedAt)}` : "ยังไม่มีรายการ"} />
        </div>
      ) : null}

      {summary && summary.rowsWithoutReceipt > 0 ? (
        <div role="alert" className="rounded-lg border border-[#f1b9b0] bg-[#fff1ef] px-4 py-3 text-sm text-[#9f2d20]">
          พบ {summary.rowsWithoutReceipt.toLocaleString("th-TH")} รายการที่ยังไม่มีเลขที่ใบเสร็จ ระบบจะไม่ถือว่า Statement สมบูรณ์จนกว่าจะ Backfill เสร็จ
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-xl border border-[#f1b9b0] bg-[#fff1ef] p-5 text-sm text-[#9f2d20]">
          <p>{error}</p>
          <Button type="button" variant="outline" className="mt-3" onClick={() => window.location.reload()}>
            ลองใหม่
          </Button>
        </div>
      ) : isLoading && rows.length === 0 ? (
        <div className="flex justify-center rounded-xl border border-[#e6dad2] bg-white p-12" aria-live="polite">
          <Loader2 className="size-7 animate-spin text-[var(--theme-color)]" aria-label="กำลังโหลด Statement" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#e6dad2] bg-[#fffdfb] p-12 text-center text-sm text-[#77665d]">
          ไม่พบรายการเติมเงินตามเงื่อนไขที่เลือก
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#e6dad2] bg-white">
          <table className="min-w-[1250px] divide-y divide-[#e6dad2] text-sm">
            <caption className="sr-only">Statement รายการเติมเงิน</caption>
            <thead className="bg-[#fbf8f5] text-left text-xs font-semibold text-[#77665d]">
              <tr>
                <th scope="col" className="px-4 py-3">เลขที่ใบเสร็จ</th>
                <th scope="col" className="px-4 py-3">วันเวลาบันทึก</th>
                <th scope="col" className="px-4 py-3">ผู้รับแต้ม</th>
                <th scope="col" className="px-4 py-3 text-right">จำนวนเงิน</th>
                <th scope="col" className="px-4 py-3">แหล่งที่มา</th>
                <th scope="col" className="px-4 py-3">Transaction ID</th>
                <th scope="col" className="px-4 py-3 text-right">แต้มรวม</th>
                <th scope="col" className="px-4 py-3">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee5df]">
              {rows.map((row) => (
                <tr key={row.id} className="align-top hover:bg-[#fffaf7]">
                  <td className="px-4 py-4">
                    {row.receipt_id && row.receipt_status === "ISSUED" ? (
                      <Link
                        href={`/admin/topup-receipts/${encodeURIComponent(row.receipt_id)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-[#a65a3f] underline-offset-4 hover:underline"
                      >
                        <FileText className="size-3.5" />
                        {row.receipt_no || "เปิดใบเสร็จ"}
                      </Link>
                    ) : (
                      <span className="font-medium text-[#9f2d20]">ยังไม่มีเลขใบเสร็จ</span>
                    )}
                    {row.receipt_no && !row.receipt_no.startsWith("TU-") ? (
                      <span className="mt-1 block text-[11px] text-[#9a5832]">Legacy reference</span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-xs text-[#77665d]">{formatDateTime(row.recorded_at)}</td>
                  <td className="px-4 py-4">
                    <p className="font-medium text-[#2c231f]">{row.buyer_name || "-"}</p>
                    <p className="text-xs text-[#77665d]">{row.buyer_email || "-"}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#a65a3f]">{formatMoney(row.amount)} บาท</td>
                  <td className="max-w-[230px] px-4 py-4 text-xs text-[#77665d]">{sourceLabel(row)}</td>
                  <td className="max-w-[220px] px-4 py-4 font-mono text-xs text-[#6b5a50]" title={row.transaction_id || undefined}>
                    {row.transaction_id ? `${row.transaction_id.slice(0, 24)}${row.transaction_id.length > 24 ? "..." : ""}` : "-"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-right text-[#374151]">{formatMoney(row.credited_points)} พ้อยท์</td>
                  <td className="max-w-[260px] px-4 py-4 text-xs text-[#77665d]">{row.note || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-col gap-3 text-xs text-[#6B7280] sm:flex-row sm:items-center sm:justify-between">
        <span aria-live="polite">
          หน้า {meta.page} / {meta.totalPages} · ทั้งหมด {summary?.totalRows.toLocaleString("th-TH") ?? "0"} รายการ
        </span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <form onSubmit={handlePageJump} className="flex items-center gap-2" aria-label="ไปยังหน้า Statement">
            <label htmlFor="statement-page-input" className="whitespace-nowrap">ไปหน้า</label>
            <Input
              id="statement-page-input"
              type="number"
              inputMode="numeric"
              min={1}
              max={Math.max(1, meta.totalPages)}
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value)}
              className="h-9 w-20 text-center"
              aria-label="กรอกเลขหน้า Statement"
            />
            <Button type="submit" variant="outline" size="sm" disabled={isLoading}>
              ไป
            </Button>
          </form>
          <Button
            variant="outline"
            size="icon"
            aria-label="ดู Statement หน้าก่อนหน้า"
            disabled={isLoading || page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="ดู Statement หน้าถัดไป"
            disabled={isLoading || page >= meta.totalPages}
            onClick={() => setPage((current) => Math.min(meta.totalPages, current + 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-[#e6dad2] bg-[#fffdfb] p-4">
      <p className="text-xs font-medium text-[#77665d]">{label}</p>
      <p className="mt-1 text-xl font-bold text-[#2c231f]">{value}</p>
      <p className="mt-1 text-xs text-[#9a5832]">{detail}</p>
    </div>
  );
}
