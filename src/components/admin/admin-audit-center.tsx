"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  FileText,
  Filter,
  Info,
  Loader2,
  Printer,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  addTopupReportDays,
  getDateOnlyInTopupTimeZone,
} from "@/lib/topup/report-time";
import {
  AdminAuditActor,
  AdminAuditActorSummary,
} from "@/lib/audit/admin-audit-repository";
import { AdminDailyReportResponse } from "@/lib/audit/admin-audit-daily-report";

type Period = "today" | "7d" | "30d" | "all" | "custom";

type AuditItem = {
  id: string;
  siteId: string;
  actorId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  category: string;
  severity: string;
  result: string;
  entityType: string | null;
  entityId: string | null;
  entityLabel: string | null;
  reasonCode: string | null;
  details: string | null;
  changes: unknown;
  requestId: string | null;
  route: string | null;
  method: string | null;
  source: string;
  occurredAt: string | null;
};

type AuditDetail = AuditItem & {
  before: unknown;
  after: unknown;
  userAgent: string | null;
  createdAt: string | null;
};

type AuditSummary = {
  total: number;
  failed: number;
  denied: number;
  highRisk: number;
  actors: number;
};

type AuditResponse = {
  items?: AuditItem[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  summary?: AuditSummary;
  actors?: AdminAuditActor[];
  todayActors?: AdminAuditActor[];
  actorSummary?: AdminAuditActorSummary | null;
  message?: string;
};

const TIME_ZONE = "Asia/Bangkok";

function formatNumber(value: number | undefined) {
  return Number(value ?? 0).toLocaleString("th-TH");
}

function formatTimeOnly(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function getRange(period: Period, startDate: string, endDate: string) {
  const today = getDateOnlyInTopupTimeZone();
  if (period === "today") return { startDate: today, endDate: today };
  if (period === "7d") return { startDate: addTopupReportDays(today, -6), endDate: today };
  if (period === "30d") return { startDate: addTopupReportDays(today, -29), endDate: today };
  if (period === "custom") {
    return startDate && endDate ? { startDate, endDate } : null;
  }
  return {};
}

function statusClass(result: string) {
  if (result === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (result === "denied") return "border-amber-200 bg-amber-50 text-amber-700";
  if (result === "failed" || result === "partial") return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function severityClass(severity: string) {
  if (severity === "critical" || severity === "high") return "border-red-200 bg-red-50 text-red-700";
  if (severity === "medium") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function displayActor(item: AuditItem) {
  return item.actorName || item.actorEmail || item.actorId || "System";
}

function stringifyValue(value: unknown) {
  if (value == null) return "-";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "[อ่านข้อมูลไม่ได้]";
  }
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: typeof Info;
  label: string;
  value: number;
  className: string;
}) {
  return (
    <Card className="border-transparent bg-white/95 shadow-sm">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${className}`}>
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-[#7b6870]">{label}</p>
          <p className="text-xl font-bold text-[#1f1720]">{formatNumber(value)}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminAuditCenter() {
  const today = getDateOnlyInTopupTimeZone();
  const [period, setPeriod] = useState<Period>("30d");
  const [startDate, setStartDate] = useState(() => addTopupReportDays(today, -29));
  const [endDate, setEndDate] = useState(today);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [resultFilter, setResultFilter] = useState("");
  const [severity, setSeverity] = useState("");
  const [page, setPage] = useState(1);
  const [actorId, setActorId] = useState("");
  const [actors, setActors] = useState<AdminAuditActor[]>([]);
  const [todayActors, setTodayActors] = useState<AdminAuditActor[]>([]);
  const [actorSummary, setActorSummary] = useState<AdminAuditActorSummary | null>(null);
  const [items, setItems] = useState<AuditItem[]>([]);
  const [summary, setSummary] = useState<AuditSummary>({ total: 0, failed: 0, denied: 0, highRisk: 0, actors: 0 });
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AuditDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Daily Work Sessions Report state
  const [isDailyReportOpen, setIsDailyReportOpen] = useState(false);
  const [dailyReportDate, setDailyReportDate] = useState(() => today);
  const [dailyReportActorId, setDailyReportActorId] = useState("");
  const [dailyReport, setDailyReport] = useState<AdminDailyReportResponse | null>(null);
  const [isDailyReportLoading, setIsDailyReportLoading] = useState(false);
  const [dailyReportError, setDailyReportError] = useState<string | null>(null);

  useEffect(() => {
    if (!isDailyReportOpen) return;
    let isCancelled = false;

    async function loadDailyReport() {
      setIsDailyReportLoading(true);
      setDailyReportError(null);
      try {
        const params = new URLSearchParams({ date: dailyReportDate });
        if (dailyReportActorId) params.set("actorId", dailyReportActorId);

        const res = await fetch(`/api/admin/audit/daily-report?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as AdminDailyReportResponse;
        if (!res.ok) {
          throw new Error((data as { message?: string }).message || "โหลดรายงานประจำวันไม่สำเร็จ");
        }
        if (!isCancelled) {
          setDailyReport(data);
        }
      } catch (err) {
        if (!isCancelled) {
          setDailyReport(null);
          setDailyReportError(err instanceof Error ? err.message : "โหลดรายงานไม่สำเร็จ");
        }
      } finally {
        if (!isCancelled) {
          setIsDailyReportLoading(false);
        }
      }
    }

    void loadDailyReport();
    return () => {
      isCancelled = true;
    };
  }, [isDailyReportOpen, dailyReportDate, dailyReportActorId]);

  const activeRange = useMemo(
    () => getRange(period, startDate, endDate),
    [period, startDate, endDate],
  );

  useEffect(() => {
    if (!activeRange) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        setIsLoading(true);
        setError(null);
        try {
          const params = new URLSearchParams({ page: String(page), limit: "30" });
          if (activeRange.startDate) params.set("startDate", activeRange.startDate);
          if (activeRange.endDate) params.set("endDate", activeRange.endDate);
          if (actorId) params.set("actorId", actorId);
          if (search.trim()) params.set("search", search.trim());
          if (category) params.set("category", category);
          if (resultFilter) params.set("result", resultFilter);
          if (severity) params.set("severity", severity);

          const response = await fetch(`/api/admin/audit?${params.toString()}`, {
            credentials: "include",
            cache: "no-store",
            signal: controller.signal,
          });
          const data = (await response.json().catch(() => ({}))) as AuditResponse;
          if (!response.ok) {
            throw new Error(
              response.status === 401 || response.status === 403
                ? "คุณไม่มีสิทธิ์เข้าถึงศูนย์ตรวจสอบนี้"
                : data.message || "โหลดประวัติ Audit ไม่สำเร็จ",
            );
          }

          setItems(data.items ?? []);
          setSummary(data.summary ?? { total: 0, failed: 0, denied: 0, highRisk: 0, actors: 0 });
          setTotalPages(data.totalPages ?? 1);
          if (data.actors) setActors(data.actors);
          if (data.todayActors) setTodayActors(data.todayActors);
          setActorSummary(data.actorSummary ?? null);
        } catch (requestError) {
          if (requestError instanceof DOMException && requestError.name === "AbortError") return;
          setItems([]);
          setError(requestError instanceof Error ? requestError.message : "โหลดข้อมูลไม่สำเร็จ");
        } finally {
          setIsLoading(false);
        }
      })();
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeRange, actorId, category, page, refreshNonce, resultFilter, search, severity]);

  async function openDetail(id: string) {
    setSelectedId(id);
    setSelectedEvent(null);
    setIsDetailLoading(true);
    try {
      const response = await fetch(`/api/admin/audit?id=${encodeURIComponent(id)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as { event?: AuditDetail; message?: string };
      if (!response.ok || !data.event) throw new Error(data.message || "โหลดรายละเอียดไม่สำเร็จ");
      setSelectedEvent(data.event);
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "โหลดรายละเอียดไม่สำเร็จ");
    } finally {
      setIsDetailLoading(false);
    }
  }

  function resetFilters() {
    setPeriod("30d");
    setStartDate(addTopupReportDays(getDateOnlyInTopupTimeZone(), -29));
    setEndDate(getDateOnlyInTopupTimeZone());
    setActorId("");
    setSearch("");
    setCategory("");
    setResultFilter("");
    setSeverity("");
    setPage(1);
  }

  return (
    <div className="space-y-5">
      <Card className="border-transparent bg-white/95 shadow-lg shadow-black/5">
        <CardHeader className="gap-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl text-[#111827]">
                <ShieldAlert className="size-6 text-[var(--theme-color)]" aria-hidden="true" />
                ตรวจสอบการทำงาน Admin
              </CardTitle>
              <p className="mt-1 text-sm text-[#80606d]">
                ประวัติการเพิ่ม แก้ไข ลบ ตรวจสอบ และเหตุการณ์ผิดปกติของเว็บไซต์ storebymari.com
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => setIsDailyReportOpen(true)}
                className="w-full bg-gradient-to-r from-[var(--theme-color)] to-[#ff84b5] text-white shadow-sm hover:opacity-95 sm:w-auto"
              >
                <FileText className="size-4" aria-hidden="true" />
                รายงานเวลาทำงานประจำวัน (PDF)
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRefreshNonce((value) => value + 1)}
                disabled={isLoading}
                className="w-full sm:w-auto"
              >
                <RefreshCw className={isLoading ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />
                รีเฟรช
              </Button>
            </div>
          </div>
          <p className="flex items-center gap-1 text-xs text-[#967684]">
            <Info className="size-3.5" aria-hidden="true" /> บันทึกเวลาและแสดงผลตามเขตเวลา Asia/Bangkok
          </p>
        </CardHeader>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard icon={Clock3} label="เหตุการณ์ทั้งหมด" value={summary.total} className="bg-[#fdf1f6] text-[#d94d82]" />
        <SummaryCard icon={XCircle} label="ล้มเหลว" value={summary.failed} className="bg-red-50 text-red-600" />
        <SummaryCard icon={AlertTriangle} label="ถูกปฏิเสธ" value={summary.denied} className="bg-amber-50 text-amber-600" />
        <SummaryCard icon={ShieldAlert} label="ความเสี่ยงสูง" value={summary.highRisk} className="bg-orange-50 text-orange-600" />
        <SummaryCard icon={Users} label="ผู้กระทำ" value={summary.actors} className="bg-sky-50 text-sky-600" />
      </div>

      <Card className="border-transparent bg-white/95 shadow-sm">
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#3f2631]">
            <Filter className="size-4 text-[var(--theme-color)]" aria-hidden="true" /> ตัวกรองการตรวจสอบ
          </div>

          {/* Quick Filter: วันนี้มี Admin คนไหนทำงานบ้าง */}
          {todayActors.length > 0 ? (
            <div className="rounded-2xl border border-[#f3e5eb] bg-gradient-to-r from-[#fff9fc] to-[#fdf1f6] p-3 sm:p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#5a3848]">
                  <UserCheck className="size-4 text-[var(--theme-color)]" aria-hidden="true" />
                  <span>แอดมินที่มีความเคลื่อนไหววันนี้ ({todayActors.length} คน):</span>
                  <span className="hidden text-[11px] font-normal text-[#967684] sm:inline">
                    (คลิกที่ชื่อเพื่อดูสรุปงานวันนี้รายบุคคลทันที)
                  </span>
                </div>
                {actorId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setActorId("");
                      setPage(1);
                    }}
                    className="text-xs font-medium text-[var(--theme-color)] hover:underline"
                  >
                    ดูทุกคน (ล้างตัวเลือก)
                  </button>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {todayActors.map((actor) => {
                  const isSelected = actorId === actor.id;
                  return (
                    <button
                      key={actor.id}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setActorId("");
                        } else {
                          setActorId(actor.id);
                          setPeriod("today");
                        }
                        setPage(1);
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                        isSelected
                          ? "bg-[var(--theme-color)] text-white shadow-sm ring-2 ring-[var(--theme-color)]/30"
                          : "border border-[#ead6df] bg-white text-[#5a3848] hover:border-[var(--theme-color)] hover:bg-[#fff0f6]"
                      }`}
                    >
                      <span className="font-semibold">{actor.name}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isSelected ? "bg-white/25 text-white" : "bg-[#fde7f1] text-[#912d58]"
                        }`}
                      >
                        วันนี้ {formatNumber(actor.todayCount)} ครั้ง
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="space-y-1 text-xs text-[#80606d]">
              Admin รายบุคคล
              <select
                value={actorId}
                onChange={(event) => {
                  setActorId(event.target.value);
                  setPage(1);
                }}
                className="h-9 w-full rounded-md border border-[#ead6df] bg-white px-3 text-sm text-[#3f2631] outline-none focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/20"
              >
                <option value="">ทุกคน (Admin ทั้งหมด)</option>
                {actors.map((actor) => (
                  <option key={actor.id} value={actor.id}>
                    {actor.name} ({actor.role || "Admin"}) — วันนี้ {formatNumber(actor.todayCount)} ครั้ง
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs text-[#80606d]">
              ช่วงเวลา
              <select
                value={period}
                onChange={(event) => { setPeriod(event.target.value as Period); setPage(1); }}
                className="h-9 w-full rounded-md border border-[#ead6df] bg-white px-3 text-sm text-[#3f2631] outline-none focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/20"
              >
                <option value="today">วันนี้</option>
                <option value="7d">7 วันล่าสุด</option>
                <option value="30d">30 วันล่าสุด</option>
                <option value="all">ทั้งหมด</option>
                <option value="custom">กำหนดเอง</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-[#80606d]">
              ค้นหา Admin / เป้าหมาย / Request ID
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-[#a88a97]" aria-hidden="true" />
                <Input
                  value={search}
                  onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                  placeholder="ชื่อ, Email, สินค้า, ID..."
                  className="pl-9"
                />
              </div>
            </label>
            <label className="space-y-1 text-xs text-[#80606d]">
              หมวดหมู่
              <select
                value={category}
                onChange={(event) => { setCategory(event.target.value); setPage(1); }}
                className="h-9 w-full rounded-md border border-[#ead6df] bg-white px-3 text-sm text-[#3f2631] outline-none focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/20"
              >
                <option value="">ทุกหมวดหมู่</option>
                <option value="catalog">สินค้าและหมวดหมู่</option>
                <option value="inventory">Stock</option>
                <option value="users">ผู้ใช้และสิทธิ์</option>
                <option value="finance">การเงิน</option>
                <option value="configuration">ตั้งค่าระบบ</option>
                <option value="security">ความปลอดภัย</option>
                <option value="support">เคสแจ้งปัญหา</option>
                <option value="audit">Audit</option>
                <option value="system">ระบบ</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-[#80606d]">
              ผลลัพธ์ / ระดับความเสี่ยง
              <div className="flex gap-2">
                <select
                  value={resultFilter}
                  onChange={(event) => { setResultFilter(event.target.value); setPage(1); }}
                  className="h-9 min-w-0 flex-1 rounded-md border border-[#ead6df] bg-white px-2 text-sm text-[#3f2631] outline-none focus:border-[var(--theme-color)]"
                >
                  <option value="">ทุกผลลัพธ์</option>
                  <option value="success">สำเร็จ</option>
                  <option value="failed">ล้มเหลว</option>
                  <option value="denied">ถูกปฏิเสธ</option>
                  <option value="partial">บางส่วน</option>
                </select>
                <select
                  value={severity}
                  onChange={(event) => { setSeverity(event.target.value); setPage(1); }}
                  className="h-9 min-w-0 flex-1 rounded-md border border-[#ead6df] bg-white px-2 text-sm text-[#3f2631] outline-none focus:border-[var(--theme-color)]"
                >
                  <option value="">ทุกระดับ</option>
                  <option value="info">Info</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </label>
          </div>

          {period === "custom" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-[#80606d]">
                วันที่เริ่มต้น
                <Input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} />
              </label>
              <label className="space-y-1 text-xs text-[#80606d]">
                วันที่สิ้นสุด
                <Input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} />
              </label>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 border-t border-[#f3e5eb] pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[#967684]">รายการ Audit ไม่สามารถแก้ไขหรือลบจากหน้าเว็บได้</p>
            <Button type="button" variant="ghost" size="sm" onClick={resetFilters} className="w-full sm:w-auto">
              ล้างตัวกรอง
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* สรุปการทำงานรายบุคคล (Individual Admin Activity Summary Card) */}
      {actorSummary ? (
        <Card className="overflow-hidden border-2 border-[var(--theme-color)]/20 bg-gradient-to-br from-white via-[#fffbfe] to-[#fdf4f8] shadow-md shadow-pink-500/5">
          <CardHeader className="border-b border-[#f3e5eb] bg-white/70 p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--theme-color)] to-[#ff84b5] text-white shadow-md shadow-[var(--theme-color)]/20">
                  <UserCheck className="size-6" aria-hidden="true" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-lg font-bold text-[#1f1720]">
                      สรุปกิจกรรม: {actorSummary.actorName}
                    </CardTitle>
                    <Badge variant="outline" className="border-pink-200 bg-pink-50 text-[var(--theme-color)] font-medium">
                      {actorSummary.actorRole || "Admin"}
                    </Badge>
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600 font-normal">
                      {period === "today"
                        ? "สรุปเฉพาะวันนี้"
                        : period === "7d"
                        ? "สรุป 7 วันล่าสุด"
                        : period === "30d"
                        ? "สรุป 30 วันล่าสุด"
                        : period === "custom"
                        ? `${startDate} ถึง ${endDate}`
                        : "สรุปทั้งหมด"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-[#80606d]">
                    {actorSummary.actorEmail ? `${actorSummary.actorEmail} • ` : ""}
                    {actorSummary.firstActionAt && actorSummary.lastActionAt ? (
                      <>
                        เริ่มทำรายการแรก: <span className="font-semibold text-[#3f2631]">{formatTimeOnly(actorSummary.firstActionAt)} น.</span> — รายการล่าสุด: <span className="font-semibold text-[#3f2631]">{formatTimeOnly(actorSummary.lastActionAt)} น.</span>
                      </>
                    ) : (
                      "ไม่มีข้อมูลเวลาเริ่มงาน"
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setActorId("");
                    setPage(1);
                  }}
                  className="text-xs text-[#80606d] hover:text-[#3f2631]"
                >
                  กลับไปดูภาพรวมทุกคน
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5 p-4 sm:p-6">
            {/* 4 Stat Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-pink-100 bg-white p-3.5 shadow-sm">
                <p className="text-xs text-[#80606d]">จำนวน Action ทั้งหมด</p>
                <p className="mt-1 text-2xl font-bold text-[var(--theme-color)]">
                  {formatNumber(actorSummary.totalActions)} <span className="text-xs font-normal text-[#80606d]">ครั้ง</span>
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-white p-3.5 shadow-sm">
                <p className="text-xs text-[#80606d]">ทำรายการสำเร็จ</p>
                <p className="mt-1 text-2xl font-bold text-emerald-600">
                  {formatNumber(actorSummary.successCount)} <span className="text-xs font-normal text-[#80606d]">ครั้ง</span>
                </p>
              </div>
              <div className="rounded-2xl border border-red-100 bg-white p-3.5 shadow-sm">
                <p className="text-xs text-[#80606d]">ล้มเหลว / ปฏิเสธ</p>
                <p className="mt-1 text-2xl font-bold text-red-600">
                  {formatNumber(actorSummary.failedCount + actorSummary.deniedCount)} <span className="text-xs font-normal text-[#80606d]">ครั้ง</span>
                </p>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-white p-3.5 shadow-sm">
                <p className="text-xs text-[#80606d]">ระดับความเสี่ยงสูง</p>
                <p className="mt-1 text-2xl font-bold text-amber-600">
                  {formatNumber(actorSummary.highRiskCount)} <span className="text-xs font-normal text-[#80606d]">ครั้ง</span>
                </p>
              </div>
            </div>

            {/* Two Column Breakdown */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Category Breakdown */}
              <div className="rounded-2xl border border-[#f3e5eb] bg-white/90 p-4">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-[#3f2631]">
                  <Sparkles className="size-4 text-[var(--theme-color)]" aria-hidden="true" />
                  สัดส่วนงานที่ทำแยกตามหมวดหมู่
                </h4>
                <p className="mt-0.5 text-xs text-[#80606d]">
                  แอดมินคนนี้ทำงานด้านไหนไปบ้างในช่วงเวลานี้
                </p>
                <div className="mt-3 space-y-3">
                  {actorSummary.categoryBreakdown.length === 0 ? (
                    <p className="py-2 text-xs text-[#967684]">ไม่มีข้อมูลการแบ่งหมวดหมู่</p>
                  ) : (
                    actorSummary.categoryBreakdown.map((cat) => {
                      const percentage =
                        actorSummary.totalActions > 0
                          ? Math.round((cat.count / actorSummary.totalActions) * 100)
                          : 0;
                      return (
                        <div key={cat.category} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-[#3f2631]">{cat.labelTh}</span>
                            <span className="font-semibold text-[#8c3b5d]">
                              {formatNumber(cat.count)} ครั้ง ({percentage}%)
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-[#f6ebf0]">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[var(--theme-color)] to-[#ff84b5]"
                              style={{ width: `${Math.min(percentage, 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Top Actions Breakdown */}
              <div className="rounded-2xl border border-[#f3e5eb] bg-white/90 p-4">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-[#3f2631]">
                  <ShieldCheck className="size-4 text-[var(--theme-color)]" aria-hidden="true" />
                  กิจกรรมหลักที่ทำมากที่สุด (เข้าใจง่าย)
                </h4>
                <p className="mt-0.5 text-xs text-[#80606d]">
                  เรียงลำดับการกระทำที่มีปริมาณสูงสุด
                </p>
                <div className="mt-3 space-y-2">
                  {actorSummary.topActions.length === 0 ? (
                    <p className="py-2 text-xs text-[#967684]">ไม่มีรายการกิจกรรม</p>
                  ) : (
                    actorSummary.topActions.map((action, idx) => (
                      <div
                        key={action.action}
                        className="flex items-center justify-between rounded-xl border border-[#faeef4] bg-[#fff9fc] p-2.5 text-xs"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#fde7f1] text-[10px] font-bold text-[var(--theme-color)]">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-[#3f2631]">{action.labelTh}</p>
                            <p className="truncate font-mono text-[10px] text-[#967684]">{action.action}</p>
                          </div>
                        </div>
                        <span className="ml-2 shrink-0 rounded-md border border-[#f3e5eb] bg-white px-2 py-1 font-semibold text-[#8c3b5d] shadow-sm">
                          {formatNumber(action.count)} ครั้ง
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card className="border-red-200 bg-red-50/80">
          <CardContent className="flex flex-col gap-3 p-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2"><AlertTriangle className="size-4" aria-hidden="true" /> {error}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => setRefreshNonce((value) => value + 1)}>
              ลองใหม่
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden border-transparent bg-white/95 shadow-sm">
        <CardHeader className="border-b border-[#f3e5eb]">
          <CardTitle className="text-base text-[#3f2631]">Timeline การทำงาน</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-[#80606d]">
              <Loader2 className="size-5 animate-spin" aria-hidden="true" /> กำลังโหลด Audit...
            </div>
          ) : items.length === 0 ? (
            <div className="flex min-h-52 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-[#80606d]">
              <CheckCircle2 className="size-8 text-emerald-500" aria-hidden="true" />
              ไม่พบเหตุการณ์ตามตัวกรองที่เลือก
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="bg-[#fff8fb] text-xs text-[#80606d]">
                  <tr>
                    <th className="px-4 py-3 font-medium">วันเวลา</th>
                    <th className="px-4 py-3 font-medium">ผู้กระทำ</th>
                    <th className="px-4 py-3 font-medium">การกระทำ</th>
                    <th className="px-4 py-3 font-medium">เป้าหมาย</th>
                    <th className="px-4 py-3 font-medium">ผลลัพธ์</th>
                    <th className="px-4 py-3 font-medium">ระดับ</th>
                    <th className="px-4 py-3 text-right font-medium">ตรวจสอบ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f3e5eb]">
                  {items.map((item) => (
                    <tr key={item.id} className="align-top hover:bg-[#fffafd]">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-[#6d5360]">{formatDateTime(item.occurredAt)}</td>
                      <td className="max-w-[190px] px-4 py-3">
                        <p className="truncate font-medium text-[#3f2631]">{displayActor(item)}</p>
                        <p className="truncate text-xs text-[#967684]">{item.actorRole || "-"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-semibold text-[#8c3b5d]">{item.action}</p>
                        <p className="text-xs text-[#967684]">{item.category}</p>
                      </td>
                      <td className="max-w-[220px] px-4 py-3">
                        <p className="truncate font-medium text-[#3f2631]">{item.entityLabel || item.entityType || "-"}</p>
                        <p className="truncate font-mono text-xs text-[#967684]">{item.entityId || "-"}</p>
                      </td>
                      <td className="px-4 py-3"><Badge variant="outline" className={statusClass(item.result)}>{item.result}</Badge></td>
                      <td className="px-4 py-3"><Badge variant="outline" className={severityClass(item.severity)}>{item.severity}</Badge></td>
                      <td className="px-4 py-3 text-right">
                        <Button type="button" variant="outline" size="sm" onClick={() => void openDetail(item.id)}>
                          <Eye className="size-4" aria-hidden="true" /> ดูรายละเอียด
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
        <div className="flex flex-col gap-3 border-t border-[#f3e5eb] px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-[#967684]">หน้า {page} / {totalPages}</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={page <= 1 || isLoading} onClick={() => setPage((value) => Math.max(1, value - 1))}>
              <ChevronLeft className="size-4" aria-hidden="true" /> ก่อนหน้า
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={page >= totalPages || isLoading} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
              ถัดไป <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </Card>

      <Dialog open={Boolean(selectedId)} onOpenChange={(open) => { if (!open) { setSelectedId(null); setSelectedEvent(null); } }}>
        <DialogContent className="max-h-[90svh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>รายละเอียด Audit Event</DialogTitle>
            <DialogDescription>ข้อมูลนี้เป็นหลักฐานตรวจสอบแบบอ่านอย่างเดียว</DialogDescription>
          </DialogHeader>
          {isDetailLoading ? (
            <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-[#80606d]"><Loader2 className="size-5 animate-spin" aria-hidden="true" /> กำลังโหลดรายละเอียด...</div>
          ) : selectedEvent ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 rounded-2xl bg-[#fff8fb] p-4 sm:grid-cols-2">
                <div><p className="text-xs text-[#967684]">การกระทำ</p><p className="font-mono font-semibold text-[#8c3b5d]">{selectedEvent.action}</p></div>
                <div><p className="text-xs text-[#967684]">ผลลัพธ์</p><Badge variant="outline" className={statusClass(selectedEvent.result)}>{selectedEvent.result}</Badge></div>
                <div><p className="text-xs text-[#967684]">ผู้กระทำ</p><p className="font-medium text-[#3f2631]">{displayActor(selectedEvent)} ({selectedEvent.actorRole || "-"})</p></div>
                <div><p className="text-xs text-[#967684]">วันเวลาไทย</p><p className="text-[#3f2631]">{formatDateTime(selectedEvent.occurredAt)}</p></div>
                <div><p className="text-xs text-[#967684]">เป้าหมาย</p><p className="break-all text-[#3f2631]">{selectedEvent.entityLabel || selectedEvent.entityType || "-"} / {selectedEvent.entityId || "-"}</p></div>
                <div><p className="text-xs text-[#967684]">Request ID</p><p className="break-all font-mono text-xs text-[#3f2631]">{selectedEvent.requestId || "-"}</p></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-[#f3e5eb] p-4"><p className="mb-2 font-semibold text-[#3f2631]">Before</p><pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs text-[#6d5360]">{stringifyValue(selectedEvent.before)}</pre></div>
                <div className="rounded-2xl border border-[#f3e5eb] p-4"><p className="mb-2 font-semibold text-[#3f2631]">After</p><pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs text-[#6d5360]">{stringifyValue(selectedEvent.after)}</pre></div>
              </div>
              <div className="rounded-2xl border border-[#f3e5eb] p-4">
                <p className="mb-2 font-semibold text-[#3f2631]">รายละเอียดและการเปลี่ยนแปลง</p>
                <p className="mb-3 whitespace-pre-wrap text-sm text-[#6d5360]">{selectedEvent.details || "-"}</p>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-[#faf7f9] p-3 text-xs text-[#6d5360]">{stringifyValue(selectedEvent.changes)}</pre>
              </div>
              <div className="grid gap-3 text-xs text-[#967684] sm:grid-cols-2">
                <p>Route: <span className="font-mono text-[#6d5360]">{selectedEvent.method || ""} {selectedEvent.route || "-"}</span></p>
                <p>User-Agent: <span className="break-all text-[#6d5360]">{selectedEvent.userAgent || "-"}</span></p>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Modal / Dialog: รายงานสรุปเวลาทำงาน Admin ประจำวัน (Daily Work Sessions Report & Print to PDF) */}
      <Dialog open={isDailyReportOpen} onOpenChange={setIsDailyReportOpen}>
        <DialogContent className="max-h-[92svh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <div className="flex flex-col gap-2 pr-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2 text-lg font-bold text-[#1f1720]">
                  <FileText className="size-5 text-[var(--theme-color)]" aria-hidden="true" />
                  รายงานสรุปช่วงเวลาเข้าใช้งานและการทำงานของ Admin ประจำวัน
                </DialogTitle>
                <DialogDescription className="mt-1 text-xs text-[#80606d]">
                  สรุปเวลาเข้าทำงานกี่ช่วง ทำงานกี่ชั่วโมง ย้อนหลังได้รายวัน พร้อมพิมพ์เป็นเอกสาร PDF
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Date Selector & Action Bar */}
          <div className="flex flex-col gap-3 rounded-2xl border border-[#f3e5eb] bg-[#fff9fc] p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-[#5a3848]">เลือกวันที่:</span>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDailyReportDate((prev) => addTopupReportDays(prev, -1))}
                  className="h-8 px-2.5 text-xs text-[#5a3848]"
                >
                  <ChevronLeft className="size-3.5" aria-hidden="true" /> วันก่อนหน้า
                </Button>
                <Input
                  type="date"
                  value={dailyReportDate}
                  onChange={(e) => setDailyReportDate(e.target.value)}
                  className="h-8 w-36 bg-white text-xs font-medium text-[#3f2631]"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDailyReportDate(today)}
                  className="h-8 px-2.5 text-xs text-[#5a3848]"
                  disabled={dailyReportDate === today}
                >
                  วันนี้
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDailyReportDate((prev) => addTopupReportDays(prev, 1))}
                  className="h-8 px-2.5 text-xs text-[#5a3848]"
                  disabled={dailyReportDate >= today}
                >
                  วันถัดไป <ChevronRight className="size-3.5" aria-hidden="true" />
                </Button>
              </div>

              <select
                value={dailyReportActorId}
                onChange={(e) => setDailyReportActorId(e.target.value)}
                className="h-8 rounded-md border border-[#ead6df] bg-white px-2.5 text-xs text-[#3f2631] outline-none focus:border-[var(--theme-color)]"
              >
                <option value="">Admin ทุกคน ({dailyReport?.totalAdminsActive ?? 0} คน)</option>
                {actors.map((actor) => (
                  <option key={actor.id} value={actor.id}>
                    {actor.name} ({actor.role})
                  </option>
                ))}
              </select>
            </div>

            <Button
              type="button"
              onClick={() => {
                const url = `/admin/audit/print?date=${encodeURIComponent(dailyReportDate)}${
                  dailyReportActorId ? `&actorId=${encodeURIComponent(dailyReportActorId)}` : ""
                }`;
                window.open(url, "_blank");
              }}
              className="h-8 shrink-0 bg-gradient-to-r from-[var(--theme-color)] to-[#ff84b5] text-xs font-semibold text-white shadow-sm hover:opacity-95"
            >
              <Printer className="mr-1.5 size-3.5" aria-hidden="true" />
              พิมพ์ / บันทึก PDF (A4)
            </Button>
          </div>

          {/* Content Area */}
          {isDailyReportLoading ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-2 text-sm text-[#80606d]">
              <Loader2 className="size-6 animate-spin text-[var(--theme-color)]" aria-hidden="true" />
              กำลังรวบรวมช่วงเวลาการทำงานของ Admin...
            </div>
          ) : dailyReportError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-600">
              {dailyReportError}
            </div>
          ) : !dailyReport || dailyReport.admins.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#f3e5eb] p-8 text-center text-sm text-[#80606d]">
              <CheckCircle2 className="size-8 text-emerald-500" aria-hidden="true" />
              <p className="font-semibold text-[#3f2631]">
                ไม่พบประวัติการเข้าใช้งานหรือทำงานในวันที่ {dailyReport?.dateTh || dailyReportDate}
              </p>
              <p className="text-xs text-[#967684]">
                สามารถกดปุ่ม "วันก่อนหน้า" หรือเลือกวันที่อื่นเพื่อดูข้อมูลย้อนหลังได้ค่ะ
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Daily Summary 4 Cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl border border-pink-100 bg-white p-3.5 shadow-sm">
                  <p className="text-xs text-[#80606d]">แอดมินที่เข้างาน</p>
                  <p className="mt-1 text-2xl font-bold text-[#1f1720]">
                    {dailyReport.totalAdminsActive} <span className="text-xs font-normal text-[#80606d]">คน</span>
                  </p>
                </div>
                <div className="rounded-2xl border border-purple-100 bg-white p-3.5 shadow-sm">
                  <p className="text-xs text-[#80606d]">ช่วงเวลาทำงานรวม</p>
                  <p className="mt-1 text-2xl font-bold text-[#8c3b5d]">
                    {dailyReport.totalSessionsAll} <span className="text-xs font-normal text-[#80606d]">ช่วงเวลา</span>
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-white p-3.5 shadow-sm">
                  <p className="text-xs text-[#80606d]">เวลารวมปฏิบัติงานจริง</p>
                  <p className="mt-1 text-xl font-bold text-emerald-600">
                    {dailyReport.totalActiveFormattedAll}
                  </p>
                </div>
                <div className="rounded-2xl border border-sky-100 bg-white p-3.5 shadow-sm">
                  <p className="text-xs text-[#80606d]">Action รวมทั้งวัน</p>
                  <p className="mt-1 text-2xl font-bold text-sky-600">
                    {formatNumber(dailyReport.totalActionsAll)} <span className="text-xs font-normal text-[#80606d]">ครั้ง</span>
                  </p>
                </div>
              </div>

              {/* Admin List with Sessions */}
              <div className="space-y-4">
                {dailyReport.admins.map((admin) => (
                  <Card
                    key={admin.actorId}
                    className="overflow-hidden border border-[#f3e5eb] bg-white shadow-sm transition-all hover:shadow-md"
                  >
                    <CardHeader className="border-b border-[#f6ebf0] bg-gradient-to-r from-[#fff9fc] to-white p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--theme-color)] to-[#ff84b5] text-white shadow-sm">
                            <UserCheck className="size-5" aria-hidden="true" />
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-bold text-[#1f1720]">{admin.actorName}</h3>
                              <Badge variant="outline" className="border-pink-200 bg-pink-50 text-[11px] text-[var(--theme-color)]">
                                {admin.actorRole}
                              </Badge>
                              <Badge variant="outline" className="border-purple-200 bg-purple-50 text-[11px] font-bold text-purple-700">
                                {admin.totalSessions} ช่วงเวลา
                              </Badge>
                              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[11px] text-emerald-700">
                                เวลารวม ~{admin.totalActiveFormatted}
                              </Badge>
                            </div>
                            <p className="mt-0.5 text-xs text-[#80606d]">
                              {admin.actorEmail ? `${admin.actorEmail} • ` : ""}
                              เริ่มรายการแรก: <span className="font-semibold text-[#3f2631]">{admin.firstActionTh}</span> — รายการล่าสุด: <span className="font-semibold text-[#3f2631]">{admin.lastActionTh}</span>
                            </p>
                          </div>
                        </div>

                        <div className="text-right sm:self-center">
                          <p className="text-xs text-[#80606d]">Action ทั้งวัน</p>
                          <p className="text-base font-bold text-[#8c3b5d]">
                            {formatNumber(admin.totalActions)} ครั้ง
                          </p>
                          <p className="text-[10px] text-emerald-600">
                            สำเร็จ {admin.successCount}
                            {admin.failedCount > 0 ? ` • ล้มเหลว ${admin.failedCount}` : ""}
                            {admin.highRiskCount > 0 ? ` • เสี่ยงสูง ${admin.highRiskCount}` : ""}
                          </p>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4 p-4">
                      {/* Sessions List */}
                      <div>
                        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#5a3848]">
                          <Clock3 className="size-3.5 text-[var(--theme-color)]" aria-hidden="true" />
                          รายละเอียดช่วงเวลาที่เข้ามาใช้งานและทำงาน ({admin.sessions.length} ช่วง):
                        </p>
                        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                          {admin.sessions.map((session) => (
                            <div
                              key={session.sessionIndex}
                              className="rounded-xl border border-[#faeef4] bg-[#fffbfd] p-3 text-xs shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                            >
                              <div className="mb-1.5 flex items-center justify-between border-b border-[#f6ebf0] pb-1.5">
                                <span className="flex items-center gap-1.5 font-bold text-[#8c3b5d]">
                                  <span className="flex size-4 items-center justify-center rounded-full bg-[#fde7f1] text-[9px] text-[var(--theme-color)]">
                                    {session.sessionIndex}
                                  </span>
                                  {session.startTimeTh} - {session.endTimeTh}
                                </span>
                                <span className="rounded-full border border-[#ead6df] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#5a3848]">
                                  {session.durationFormatted}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[#705663]">
                                <span>จำนวนการกระทำ:</span>
                                <span className="font-semibold text-[#1f1720]">{formatNumber(session.actionsCount)} ครั้ง</span>
                              </div>
                              {session.topActionsTh.length > 0 ? (
                                <p className="mt-1 truncate text-[11px] text-[#80606d]">
                                  เน้น: {session.topActionsTh.join(", ")}
                                </p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Categories breakdown pills */}
                      {admin.categoryBreakdown.length > 0 ? (
                        <div className="border-t border-[#f6ebf0] pt-3">
                          <p className="mb-1.5 text-xs text-[#80606d]">สัดส่วนประเภทงานในวันนี้:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {admin.categoryBreakdown.map((cat) => (
                              <span
                                key={cat.category}
                                className="rounded-lg border border-[#ead6df] bg-[#faf6f8] px-2.5 py-1 text-[11px] text-[#5a3848]"
                              >
                                {cat.labelTh}: <strong className="text-[#8c3b5d]">{cat.count} ครั้ง</strong> ({cat.percentage}%)
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
