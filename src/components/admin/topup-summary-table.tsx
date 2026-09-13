"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, RefreshCw, Search, Wallet, Gift, LineChart as LineChartIcon, CalendarDays, ChevronLeft, ChevronRight, History, FileText } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getDateOnlyInTopupTimeZone,
  getStartOfCurrentMonthDateOnly,
  TOPUP_REPORT_TIME_ZONE,
} from "@/lib/topup/report-time";

type TopupSummaryRow = {
  user_id: string;
  email: string;
  display_name: string | null;
  topup_count: number;
  total_amount: number;
  total_bonus: number;
  total_credited: number;
  last_topup_at: string | null;
};

type TopupSummaryResponse = {
  rows: TopupSummaryRow[];
  meta: {
    total_users: number;
    grand_total_amount: number;
    grand_total_bonus: number;
    grand_total_credited: number;
    grand_total_count: number;
    limit: number;
    offset: number;
  };
};

type RecentTopupRow = {
  id: string;
  user_id: string | null;
  email: string | null;
  display_name: string | null;
  amount: number | null;
  bonus_points: number;
  credited_points: number | null;
  status: "success" | "failed" | "pending";
  status_label: string;
  note: string;
  source: string;
  transaction_id: string | null;
  created_at: string | null;
  topup_receipt_id: string | null;
  topup_receipt_no: string | null;
  can_issue_receipt: boolean;
};

type RecentTopupResponse = {
  rows: RecentTopupRow[];
  meta: { total: number; page: number; limit: number; totalPages: number };
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TOPUP_REPORT_TIME_ZONE,
  });
}

function formatAmount(value: number | null) {
  if (!Number.isFinite(Number(value))) return "-";
  const n = Number(value ?? 0);
  return `${n.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} บาท`;
}

export default function TopupSummaryTable() {
  const [isPending, startTransition] = useTransition();

  const [rows, setRows] = useState<TopupSummaryRow[]>([]);
  const [meta, setMeta] = useState<TopupSummaryResponse["meta"]>({
    total_users: 0,
    grand_total_amount: 0,
    grand_total_bonus: 0,
    grand_total_credited: 0,
    grand_total_count: 0,
    limit: 20,
    offset: 0,
  });

  const [q, setQ] = useState("");
  const [summaryPageInput, setSummaryPageInput] = useState("1");
  const [startDate, setStartDate] = useState(() => getStartOfCurrentMonthDateOnly());
  const [endDate, setEndDate] = useState(() => getDateOnlyInTopupTimeZone());
  const [timeframe, setTimeframe] = useState("daily");
  
  const [chartData, setChartData] = useState<{ date: string; amount: number; count: number; users: number }[]>([]);
  const [isChartPending, startChartTransition] = useTransition();
  const [recentDate, setRecentDate] = useState(() => getDateOnlyInTopupTimeZone());
  const [recentPage, setRecentPage] = useState(1);
  const [recentRows, setRecentRows] = useState<RecentTopupRow[]>([]);
  const [recentMeta, setRecentMeta] = useState<RecentTopupResponse["meta"]>({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  });
  const [isRecentPending, setIsRecentPending] = useState(false);
  const [receiptActionId, setReceiptActionId] = useState<string | null>(null);
  const recentFetchInFlight = useRef(false);
  const recentRefreshQueued = useRef<{ date: string; page: number; silent: boolean } | null>(null);

  const currentPage = useMemo(() => Math.floor(meta.offset / meta.limit) + 1, [meta]);
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(meta.total_users / meta.limit)),
    [meta]
  );

  const fetchData = (offset = 0) => {
    startTransition(async () => {
      const params = new URLSearchParams();
      params.set("limit", String(meta.limit));
      params.set("offset", String(offset));
      if (q.trim()) params.set("q", q.trim());
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await fetch(`/api/admin/topups/summary?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        toast.error("โหลดรายงานเติมเงินไม่สำเร็จ");
        return;
      }

      const data = (await res.json()) as TopupSummaryResponse;
      setRows(data.rows ?? []);
      setMeta(data.meta);
      setSummaryPageInput(String(Math.floor(data.meta.offset / data.meta.limit) + 1));
    });
  };

  const fetchChartData = () => {
    startChartTransition(async () => {
      const params = new URLSearchParams();
      params.set("timeframe", timeframe);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await fetch(`/api/admin/topups/chart?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) return;

      const data = await res.json();
      setChartData(data.data ?? []);
    });
  };

  const fetchRecentTopups = async (
    date = recentDate,
    page = recentPage,
    options: { silent?: boolean } = {},
  ) => {
    if (recentFetchInFlight.current) {
      recentRefreshQueued.current = { date, page, silent: Boolean(options.silent) };
      return;
    }
    recentFetchInFlight.current = true;
    setIsRecentPending(true);
    try {
      const params = new URLSearchParams({ date, page: String(page) });
      const res = await fetch(`/api/admin/topups/recent?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        if (!options.silent) toast.error("โหลดประวัติการเติมเงินล่าสุดไม่สำเร็จ");
        return;
      }
      const data = (await res.json()) as RecentTopupResponse;
      setRecentRows(data.rows ?? []);
      setRecentMeta(data.meta);
    } catch {
      if (!options.silent) toast.error("โหลดประวัติการเติมเงินล่าสุดไม่สำเร็จ");
    } finally {
      recentFetchInFlight.current = false;
      setIsRecentPending(false);
      const queued = recentRefreshQueued.current;
      recentRefreshQueued.current = null;
      if (queued && (queued.date !== date || queued.page !== page)) {
        void fetchRecentTopups(queued.date, queued.page, { silent: queued.silent });
      }
    }
  };

  const handleTopupReceiptAction = async (row: RecentTopupRow) => {
    if (receiptActionId) return;

    const receiptWindow = typeof window !== "undefined" ? window.open("about:blank", "_blank") : null;
    setReceiptActionId(row.id);
    try {
      const response = await fetch("/api/admin/topup-receipts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: row.id }),
      });
      const data = await response.json().catch(() => null) as {
        receiptId?: unknown;
        receiptNo?: unknown;
        message?: unknown;
      } | null;
      const receiptId = typeof data?.receiptId === "string" ? data.receiptId : null;
      if (!response.ok || !receiptId) {
        throw new Error(typeof data?.message === "string" ? data.message : "ไม่สามารถเตรียมใบเสร็จเติมพ้อยท์ได้");
      }

      const receiptUrl = `/admin/topup-receipts/${encodeURIComponent(receiptId)}`;
      if (receiptWindow && !receiptWindow.closed) {
        receiptWindow.location.href = receiptUrl;
      } else {
        window.location.assign(receiptUrl);
      }

      setRecentRows((currentRows) => currentRows.map((currentRow) =>
        currentRow.id === row.id
          ? {
              ...currentRow,
              topup_receipt_id: receiptId,
              topup_receipt_no: typeof data?.receiptNo === "string" ? data.receiptNo : currentRow.topup_receipt_no,
              can_issue_receipt: false,
            }
          : currentRow,
      ));
    } catch (error) {
      receiptWindow?.close();
      toast.error(error instanceof Error ? error.message : "ไม่สามารถเตรียมใบเสร็จเติมพ้อยท์ได้");
    } finally {
      setReceiptActionId(null);
    }
  };

  useEffect(() => {
    fetchData(0);
    fetchChartData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void fetchRecentTopups(recentDate, recentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentDate, recentPage]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") {
        void fetchRecentTopups(recentDate, recentPage, { silent: true });
      }
    };
    const interval = window.setInterval(refresh, 10_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
    // The endpoint is intentionally polled only for the selected date/page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentDate, recentPage]);

  useEffect(() => {
    fetchChartData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe]);

  const applyFilters = () => {
    fetchData(0);
    fetchChartData();
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="border border-[#E5E7EB] bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-[#6B7280]">
              ยอดเติมรวม (ตามเงื่อนไข)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-xl font-semibold text-[#0B0B0B]">
              {formatAmount(Number(meta.grand_total_amount ?? 0))}
            </div>
            <div className="rounded-lg bg-[var(--theme-color)]/10 p-3">
              <Wallet className="size-5 text-[var(--theme-color)]" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-[#F1D5C2] bg-[#FFFDFB]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-[#6B7280]">
              โบนัสที่แจกแล้ว
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-xl font-semibold text-[#B45309]">
              {Number(meta.grand_total_bonus ?? 0).toLocaleString("th-TH")} พ้อยท์
            </div>
            <div className="rounded-lg bg-[#FFF3E8] p-3">
              <Gift className="size-5 text-[#B45309]" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-[#E5E7EB] bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-[#6B7280]">
              พ้อยท์ที่เครดิตรวม
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold text-[#0B0B0B]">
            {Number(meta.grand_total_credited ?? 0).toLocaleString("th-TH")} พ้อยท์
          </CardContent>
        </Card>

        <Card className="border border-[#E5E7EB] bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-[#6B7280]">
              จำนวนรายการเติม (success)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold text-[#0B0B0B]">
            {Number(meta.grand_total_count ?? 0).toLocaleString("th-TH")}
          </CardContent>
        </Card>

        <Card className="border border-[#E5E7EB] bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-[#6B7280]">
              จำนวนผู้เติม (ตามเงื่อนไข)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold text-[#0B0B0B]">
            {Number(meta.total_users ?? 0).toLocaleString("th-TH")}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border border-[#E5E7EB] bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">ตัวกรอง</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="topup-q">ค้นหา (อีเมล/ชื่อแสดง)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9CA3AF]" />
                <Input
                  id="topup-q"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="เช่น agent@gmail.com หรือ Agent A"
                  className="pl-9 border-[#E5E7EB] bg-white focus-visible:ring-[var(--theme-color)]"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="topup-start">วันที่เริ่มต้น</Label>
              <Input
                id="topup-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border-[#E5E7EB]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="topup-end">วันที่สิ้นสุด</Label>
              <Input
                id="topup-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border-[#E5E7EB]"
              />
            </div>

            <div className="flex items-end gap-2">
              <Button
                onClick={applyFilters}
                disabled={isPending || isChartPending}
                className="w-full bg-[var(--theme-color)] hover:bg-[var(--theme-color)]"
              >
                {isPending || isChartPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Search className="mr-2 size-4" />
                )}
                ค้นหา
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chart Dashboard */}
      <Card className="border border-[#E5E7EB] bg-white">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <LineChartIcon className="size-5 text-[var(--theme-color)]" />
              กราฟวิเคราะห์ยอดเติมเงิน (Analyst Dashboard)
            </CardTitle>
            <p className="text-xs text-[#6B7280]">
              แสดงยอดรวมที่เติมสำเร็จตามช่วงวันที่ (ไม่รวมการค้นหาชื่อ)
            </p>
          </div>
          <div className="w-[150px]">
            <Select value={timeframe} onValueChange={(v) => { setTimeframe(v); }}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="เลือกรูปแบบ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">รายวัน</SelectItem>
                <SelectItem value="monthly">รายเดือน</SelectItem>
                <SelectItem value="yearly">รายปี</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isChartPending ? (
            <div className="flex h-[300px] items-center justify-center">
              <Loader2 className="size-8 animate-spin text-[var(--theme-color)]" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex h-[300px] items-center justify-center text-sm text-[#6B7280]">
              ไม่พบข้อมูลกราฟในช่วงเวลาที่เลือก
            </div>
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 12, fill: '#6B7280' }} 
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 12, fill: '#6B7280' }}
                    tickFormatter={(value) => `${value.toLocaleString()}`}
                  />
                  <Tooltip 
                    cursor={{ stroke: '#E5E7EB', strokeWidth: 2, strokeDasharray: '5 5' }}
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="rounded-lg border border-[#E5E7EB] bg-white p-3 shadow-sm">
                            <p className="mb-1 text-sm font-medium text-[#0B0B0B]">{label}</p>
                            <p className="text-sm font-semibold text-[var(--theme-color)]">
                              {formatAmount(payload[0].value as number)}
                            </p>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Line 
                    type="monotone"
                    dataKey="amount" 
                    stroke="var(--theme-color)" 
                    strokeWidth={3}
                    dot={{ fill: 'var(--theme-color)', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Time Table */}
      <Card className="border border-[#E5E7EB] bg-white mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="size-5 text-[var(--theme-color)]" />
            สรุปยอดเติมเงินแยกตามช่วงเวลา
          </CardTitle>
          <p className="text-xs text-[#6B7280]">
            ตารางแสดงรายละเอียดรายได้และจำนวนรายการตามช่วงเวลาที่เลือก
          </p>
        </CardHeader>
        <CardContent>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto rounded-lg border border-[#E5E7EB]">
            <Table className="min-w-[940px]">
              <TableHeader className="bg-[#F9FAFB]">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-semibold text-[#374151]">วันที่</TableHead>
                  <TableHead className="font-semibold text-[#374151] text-right">จำนวนคนเติม</TableHead>
                  <TableHead className="font-semibold text-[#374151] text-right">จำนวนรายการ</TableHead>
                  <TableHead className="font-semibold text-[#374151] text-right">ยอดรวม (บาท)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isChartPending ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      <Loader2 className="mx-auto size-5 animate-spin text-[var(--theme-color)]" />
                    </TableCell>
                  </TableRow>
                ) : chartData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-[#6B7280]">
                      ไม่พบข้อมูลในช่วงเวลาที่เลือก
                    </TableCell>
                  </TableRow>
                ) : (
                  [...chartData].reverse().map((row, index) => (
                    <TableRow key={index} className="hover:bg-[#F9FAFB]/50 transition-colors">
                      <TableCell className="font-medium text-[#111827]">
                        {row.date}
                      </TableCell>
                      <TableCell className="text-right text-[#6B7280]">
                        {row.users.toLocaleString()} คน
                      </TableCell>
                      <TableCell className="text-right text-[#6B7280]">
                        {row.count.toLocaleString()} บิล
                      </TableCell>
                      <TableCell className="text-right font-semibold text-[#059669]">
                        {formatAmount(row.amount)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card View */}
          <div className="block md:hidden divide-y divide-[#E5E7EB]">
            {isChartPending ? (
              <div className="py-6 text-center">
                <Loader2 className="mx-auto size-5 animate-spin text-[var(--theme-color)]" />
              </div>
            ) : chartData.length === 0 ? (
              <p className="py-6 text-center text-sm text-[#6B7280]">ไม่พบข้อมูลในช่วงเวลาที่เลือก</p>
            ) : (
              [...chartData].reverse().map((row, index) => (
                <div key={index} className="py-3 space-y-1.5 hover:bg-[#F9FAFB]/50 transition-colors">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-[#111827]">{row.date}</span>
                    <span className="text-sm font-bold text-[#059669]">{formatAmount(row.amount)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-[#6B7280]">
                    <span>คนเติม: {row.users.toLocaleString()} คน</span>
                    <span>รายการ: {row.count.toLocaleString()} บิล</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border border-[#E5E7EB] bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">สรุปยอดเติมเงินแยกตามตัวแทน</CardTitle>
          <p className="text-xs text-[#6B7280]">
            เรียงตามยอดเติมรวมมาก → น้อย (เฉพาะรายการที่สถานะ success)
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Desktop Table View */}
          <div className="hidden md:block w-full overflow-x-auto rounded-lg border border-[#E5E7EB]">
            <Table className="min-w-[800px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[220px]">ตัวแทน</TableHead>
                  <TableHead className="min-w-[220px]">อีเมล</TableHead>
                  <TableHead className="text-right min-w-[120px]">จำนวนครั้ง</TableHead>
                  <TableHead className="text-right min-w-[140px]">ยอดเติมรวม</TableHead>
                  <TableHead className="text-right min-w-[140px]">โบนัสรวม</TableHead>
                  <TableHead className="min-w-[180px]">เติมล่าสุด</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-[#6B7280]">
                      {isPending ? "กำลังโหลด..." : "ไม่พบข้อมูลตามเงื่อนไข"}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.user_id}>
                      <TableCell className="font-medium text-[#0B0B0B]">
                        {r.display_name || "-"}
                      </TableCell>
                      <TableCell className="text-[#374151]">{r.email}</TableCell>
                      <TableCell className="text-right">
                        {Number(r.topup_count ?? 0).toLocaleString("th-TH")}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-[#0B0B0B]">
                        {formatAmount(Number(r.total_amount ?? 0))}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-[#B45309]">
                        +{Number(r.total_bonus ?? 0).toLocaleString("th-TH")} พ้อยท์
                      </TableCell>
                      <TableCell className="text-[#374151]">
                        {formatDateTime(r.last_topup_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card View */}
          <div className="block md:hidden divide-y divide-[#E5E7EB]">
            {rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-[#6B7280]">
                {isPending ? "กำลังโหลด..." : "ไม่พบข้อมูลตามเงื่อนไข"}
              </p>
            ) : (
              rows.map((r) => (
                <div key={r.user_id} className="py-3 space-y-2 hover:bg-[#F9FAFB]/50 transition-colors">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-semibold text-[#0B0B0B]">{r.display_name || "-"}</p>
                      <p className="text-xs text-[#6B7280]">{r.email}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-[#6B7280]">ยอดเติมรวม</span>
                      <p className="text-sm font-bold text-[#059669]">{formatAmount(Number(r.total_amount ?? 0))}</p>
                      <span className="text-[10px] text-[#B45309]">โบนัส +{Number(r.total_bonus ?? 0).toLocaleString("th-TH")} พ้อยท์</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs text-[#6B7280] pt-1">
                    <p>จำนวนครั้ง: <span className="font-medium text-[#0B0B0B]">{Number(r.topup_count ?? 0).toLocaleString("th-TH")} ครั้ง</span></p>
                    <p>ล่าสุด: <span className="text-[#374151]">{formatDateTime(r.last_topup_at)}</span></p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-[#6B7280]">
              แสดงตัวแทนสูงสุด 20 รายการต่อหน้า · หน้า {currentPage.toLocaleString("th-TH")} / {totalPages.toLocaleString("th-TH")}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                variant="outline"
                size="icon"
                aria-label="ไปหน้าก่อนหน้า"
                className="border-[#E5E7EB] bg-white"
                disabled={isPending || meta.offset <= 0}
                onClick={() => fetchData(Math.max(0, meta.offset - meta.limit))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Input
                aria-label="เลขหน้าสรุปตัวแทน"
                type="number"
                min={1}
                max={totalPages}
                value={summaryPageInput}
                onChange={(event) => setSummaryPageInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  const requestedPage = Math.min(totalPages, Math.max(1, Number(summaryPageInput) || 1));
                  setSummaryPageInput(String(requestedPage));
                  fetchData((requestedPage - 1) * meta.limit);
                }}
                className="h-9 w-16 border-[#E5E7EB] bg-white text-center"
              />
              <Button
                variant="outline"
                size="icon"
                aria-label="ไปหน้าถัดไป"
                className="border-[#E5E7EB] bg-white"
                disabled={isPending || meta.offset + meta.limit >= meta.total_users}
                onClick={() => fetchData(meta.offset + meta.limit)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-[#E5E7EB] bg-white">
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-5 text-[var(--theme-color)]" />
              ประวัติการเติมเงินล่าสุด
            </CardTitle>
            <p className="mt-1 text-xs text-[#6B7280]">แสดงทุกธุรกรรมในวันที่เลือก ทั้งสำเร็จ ไม่สำเร็จ และกำลังตรวจสอบ เรียงตาม Timeline</p>
          </div>
          <Input
            aria-label="เลือกวันที่ดูประวัติเติมเงิน"
            type="date"
            value={recentDate}
            onChange={(event) => {
              setRecentDate(event.target.value);
              setRecentPage(1);
            }}
            className="h-9 w-[150px] border-[#E5E7EB] bg-white"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="รีเฟรชประวัติการเติมเงินล่าสุด"
            title="รีเฟรชข้อมูลล่าสุด"
            onClick={() => void fetchRecentTopups(recentDate, recentPage)}
            disabled={isRecentPending}
            className="border-[#E5E7EB] bg-white"
          >
            <RefreshCw className={isRecentPending ? "size-4 animate-spin" : "size-4"} />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-[#E5E7EB]">
            <Table className="min-w-[1450px]">
              <TableHeader>
                <TableRow>
                  <TableHead>เวลา</TableHead>
                  <TableHead>ผู้เติมเงิน</TableHead>
                  <TableHead>อีเมล</TableHead>
                  <TableHead className="text-right">จำนวนเงิน</TableHead>
                  <TableHead className="text-right">โบนัส</TableHead>
                  <TableHead className="text-right">เครดิตรวม</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead className="min-w-[260px]">หมายเหตุ</TableHead>
                  <TableHead className="min-w-[250px]">ทำธุรกรรมจาก</TableHead>
                  <TableHead className="min-w-[180px]">ใบเสร็จ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isRecentPending ? (
                  <TableRow><TableCell colSpan={10} className="py-8 text-center"><Loader2 className="mx-auto size-5 animate-spin text-[var(--theme-color)]" /></TableCell></TableRow>
                ) : recentRows.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="py-8 text-center text-sm text-[#6B7280]">ไม่พบรายการเติมเงินในวันที่เลือก</TableCell></TableRow>
                ) : recentRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-[#374151]">{formatDateTime(row.created_at)}</TableCell>
                    <TableCell className="font-medium text-[#0B0B0B]">{row.display_name || "-"}</TableCell>
                    <TableCell className="text-[#374151]">{row.email || "-"}</TableCell>
                    <TableCell className="text-right font-semibold text-[#374151]">{formatAmount(row.amount)}</TableCell>
                    <TableCell className="text-right font-semibold text-[#B45309]">{row.bonus_points > 0 ? `+${row.bonus_points.toLocaleString("th-TH")}` : "-"}</TableCell>
                    <TableCell className="text-right text-[#374151]">{row.credited_points === null ? "-" : `${row.credited_points.toLocaleString("th-TH")} พ้อยท์`}</TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        row.status === "success"
                          ? "bg-emerald-50 text-emerald-700"
                          : row.status === "failed"
                            ? "bg-rose-50 text-rose-700"
                            : "bg-amber-50 text-amber-700"
                      }`}>
                        {row.status_label}
                      </span>
                    </TableCell>
                    <TableCell className={`max-w-[320px] text-sm ${row.status === "failed" ? "font-medium text-rose-700" : "text-[#374151]"}`}>
                      {row.note || "-"}
                    </TableCell>
                    <TableCell className="text-sm text-[#374151]">{row.source || "-"}</TableCell>
                    <TableCell>
                      {row.topup_receipt_id && row.status === "success" ? (
                        <Link
                          href={`/admin/topup-receipts/${row.topup_receipt_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--theme-color)]/40 bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--theme-color)] hover:bg-[var(--theme-color)]/10"
                        >
                          <FileText className="size-3.5" />
                          เปิด/พิมพ์
                        </Link>
                      ) : row.can_issue_receipt && row.status === "success" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={receiptActionId !== null}
                          onClick={() => void handleTopupReceiptAction(row)}
                          className="inline-flex items-center gap-1.5 whitespace-nowrap border-[var(--theme-color)]/40 bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--theme-color)] hover:bg-[var(--theme-color)]/10"
                        >
                          {receiptActionId === row.id ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
                          {receiptActionId === row.id ? "กำลังเตรียม..." : "สร้าง/พิมพ์"}
                        </Button>
                      ) : (
                        <span className="text-xs text-[#9CA3AF]">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-[#6B7280]">
            <span>ทั้งหมด {recentMeta.total.toLocaleString("th-TH")} รายการ · หน้า {recentMeta.page} / {recentMeta.totalPages}</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                aria-label="ดูประวัติเติมเงินหน้าก่อนหน้า"
                disabled={isRecentPending || recentPage <= 1}
                onClick={() => setRecentPage((page) => Math.max(1, page - 1))}
              ><ChevronLeft className="size-4" /></Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="ดูประวัติเติมเงินหน้าถัดไป"
                disabled={isRecentPending || recentPage >= recentMeta.totalPages}
                onClick={() => setRecentPage((page) => Math.min(recentMeta.totalPages, page + 1))}
              ><ChevronRight className="size-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


