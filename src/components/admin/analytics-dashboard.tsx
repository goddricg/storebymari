"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Apple,
  BarChart3,
  CalendarDays,
  Download,
  Eye,
  Laptop,
  RefreshCw,
  ShoppingCart,
  Smartphone,
  UserCheck,
  UserX,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ANALYTICS_TIME_ZONE,
  type AnalyticsTimeframe,
} from "@/lib/analytics/time";
import {
  getDateOnlyInTopupTimeZone,
  getStartOfCurrentMonthDateOnly,
} from "@/lib/topup/report-time";
import { calculatePurchaseEstimate } from "@/lib/analytics/purchase-estimate";

export type PwaDailyPoint = {
  date: string;
  total: number;
  android: number;
  ios: number;
  desktop: number;
  other: number;
};

export type PwaRecentInstall = {
  id: string;
  visitorId: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  platform: string;
  deviceType: string;
  source: string;
  installCount: number;
  installedAt: string;
};

export type PwaInstallStats = {
  totalInstalls: number;
  totalInstallEvents: number;
  todayInstalls: number;
  platformBreakdown: {
    android: number;
    ios: number;
    desktop: number;
    other: number;
  };
  dailyStats: PwaDailyPoint[];
  recentInstalls: PwaRecentInstall[];
  updatedAt: string;
};

type AnalyticsPoint = {
  label: string;
  visits: number;
  uniqueVisitors: number;
};

type VisitsResponse = {
  data: AnalyticsPoint[];
  meta: {
    timeframe: AnalyticsTimeframe;
    startDate: string;
    endDate: string;
    totalVisits: number;
    totalUniqueVisitors: number;
    updatedAt: string;
  };
};

type PresenceUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  pagePath: string;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
};

type PresenceResponse = {
  asOf: string;
  staleAfterSeconds: number;
  activeSessions: number;
  activeVisitors: number;
  activeUsers: number;
  activeAnonymousVisitors: number;
  users: PresenceUser[];
};

type AnalyticsFilters = {
  timeframe: AnalyticsTimeframe;
  startDate: string;
  endDate: string;
};

const PRESENCE_REFRESH_MS = 10_000;
const VISITS_REFRESH_MS = 15_000;

function formatNumber(value: number) {
  return Number(value ?? 0).toLocaleString("th-TH");
}

function formatPercent(value: number) {
  return `${Number(value ?? 0).toLocaleString("th-TH", {
    maximumFractionDigits: 1,
  })}%`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: ANALYTICS_TIME_ZONE,
  });
}

function formatRelativeTime(value: string | null | undefined) {
  if (!value) return "ไม่ทราบเวลา";
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "ไม่ทราบเวลา";

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds} วินาทีที่แล้ว`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  return `${Math.floor(minutes / 60)} ชั่วโมงที่แล้ว`;
}

function formatBucketLabel(label: string, timeframe: AnalyticsTimeframe) {
  if (timeframe === "hourly") return `${label.slice(5, 10)} ${label.slice(11, 16)}`;
  if (timeframe === "daily") return `${label.slice(8, 10)}/${label.slice(5, 7)}`;
  if (timeframe === "monthly") return `${label.slice(5, 7)}/${label.slice(0, 4)}`;
  return label;
}

function initials(user: PresenceUser) {
  const source = user.displayName || user.email || "U";
  return source.trim().slice(0, 1).toUpperCase();
}

function formatPwaSource(source: string) {
  switch (source) {
    case "appinstalled_event":
      return "ติดตั้งผ่านเบราว์เซอร์";
    case "prompt_accepted":
      return "กดติดตั้งจากปุ่มในแอป";
    case "standalone_launch":
      return "เปิดจากหน้าจอโฮม (PWA)";
    default:
      return source;
  }
}

function renderPlatformBadge(platform: string) {
  const p = (platform || "").toLowerCase();
  if (p === "android") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
        <Smartphone className="size-3" /> Android
      </span>
    );
  }
  if (p === "ios") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800 ring-1 ring-inset ring-slate-600/20">
        <Apple className="size-3" /> iOS / Safari
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-600/20">
      <Laptop className="size-3" /> {platform || "Desktop"}
    </span>
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return (await response.json()) as T;
}

function StatCard({
  label,
  value,
  description,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  description: string;
  icon: LucideIcon;
  tone: string;
}) {
  return (
    <Card className="border border-[#E5E7EB] bg-white shadow-sm">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#6B7280]">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-[#111827]">{formatNumber(value)}</p>
          <p className="mt-2 text-xs leading-5 text-[#6B7280]">{description}</p>
        </div>
        <div className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${tone}`}>
          <Icon className="size-5" aria-hidden="true" />
        </div>
      </CardContent>
    </Card>
  );
}

function PurchaseEstimateCard({
  label,
  value,
  description,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  description: string;
  icon: LucideIcon;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-[#FAFAFA] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[#6B7280]">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-[#111827]">{formatPercent(value)}</p>
        </div>
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
          <Icon className="size-4" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-[#6B7280]">{description}</p>
    </div>
  );
}

export default function AnalyticsDashboard() {
  const [draftFilters, setDraftFilters] = useState<AnalyticsFilters>(() => ({
    timeframe: "daily",
    startDate: getStartOfCurrentMonthDateOnly(),
    endDate: getDateOnlyInTopupTimeZone(),
  }));
  const [appliedFilters, setAppliedFilters] = useState<AnalyticsFilters>(draftFilters);
  const [visits, setVisits] = useState<VisitsResponse | null>(null);
  const [presence, setPresence] = useState<PresenceResponse | null>(null);
  const [pwaStats, setPwaStats] = useState<PwaInstallStats | null>(null);
  const [isVisitsLoading, setIsVisitsLoading] = useState(false);
  const [isPresenceLoading, setIsPresenceLoading] = useState(false);
  const [isPwaLoading, setIsPwaLoading] = useState(false);
  const [visitsError, setVisitsError] = useState<string | null>(null);
  const [presenceError, setPresenceError] = useState<string | null>(null);
  const [pwaError, setPwaError] = useState<string | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [presenceUpdatedAt, setPresenceUpdatedAt] = useState<string | null>(null);
  const presenceRequestInFlight = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshPresence = useCallback(async (silent = false) => {
    if (presenceRequestInFlight.current) return;
    presenceRequestInFlight.current = true;
    if (!silent) setIsPresenceLoading(true);

    try {
      const data = await fetchJson<PresenceResponse>("/api/admin/analytics/presence");
      if (!mountedRef.current) return;
      setPresence(data);
      setPresenceUpdatedAt(data.asOf);
      setPresenceError(null);
    } catch {
      if (!mountedRef.current) return;
      setPresenceError("โหลดสถานะผู้ใช้งานแบบเรียลไทม์ไม่สำเร็จ");
    } finally {
      presenceRequestInFlight.current = false;
      if (!silent && mountedRef.current) setIsPresenceLoading(false);
    }
  }, []);

  const refreshVisits = useCallback(async (silent = false) => {
    if (!silent) setIsVisitsLoading(true);

    const params = new URLSearchParams({
      timeframe: appliedFilters.timeframe,
      startDate: appliedFilters.startDate,
      endDate: appliedFilters.endDate,
    });

    try {
      const data = await fetchJson<VisitsResponse>(`/api/admin/analytics/visits?${params.toString()}`);
      if (!mountedRef.current) return;
      setVisits(data);
      setVisitsError(null);
    } catch {
      if (!mountedRef.current) return;
      setVisitsError("โหลดสถิติการเข้าชมไม่สำเร็จ");
    } finally {
      if (!silent && mountedRef.current) setIsVisitsLoading(false);
    }
  }, [appliedFilters]);

  const refreshPwaStats = useCallback(async (silent = false) => {
    if (!silent) setIsPwaLoading(true);

    const params = new URLSearchParams({
      startDate: appliedFilters.startDate,
      endDate: appliedFilters.endDate,
    });

    try {
      const data = await fetchJson<PwaInstallStats>(`/api/admin/analytics/pwa-installs?${params.toString()}`);
      if (!mountedRef.current) return;
      setPwaStats(data);
      setPwaError(null);
    } catch {
      if (!mountedRef.current) return;
      setPwaError("โหลดสถิติการติดตั้งเว็ปแอปไม่สำเร็จ");
    } finally {
      if (!silent && mountedRef.current) setIsPwaLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    void refreshPresence();
    const intervalId = window.setInterval(() => void refreshPresence(true), PRESENCE_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [refreshPresence]);

  useEffect(() => {
    void refreshVisits();
    const intervalId = window.setInterval(() => void refreshVisits(true), VISITS_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [refreshVisits]);

  useEffect(() => {
    void refreshPwaStats();
    const intervalId = window.setInterval(() => void refreshPwaStats(true), VISITS_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [refreshPwaStats]);

  const applyFilters = () => {
    if (!draftFilters.startDate || !draftFilters.endDate) {
      setFilterError("กรุณาเลือกวันที่เริ่มต้นและสิ้นสุด");
      return;
    }
    if (draftFilters.startDate > draftFilters.endDate) {
      setFilterError("วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด");
      return;
    }
    setFilterError(null);
    setAppliedFilters(draftFilters);
  };

  const displayVisitors = visits?.data ?? [];
  const lastUpdated = visits?.meta.updatedAt ?? presenceUpdatedAt;
  const purchaseEstimate = calculatePurchaseEstimate(
    visits?.meta.totalVisits ?? 0,
    visits?.meta.totalUniqueVisitors ?? 0,
  );
  const purchaseEstimateDescription = purchaseEstimate.hasData
    ? `จากผู้เยี่ยมชมไม่ซ้ำ ${formatNumber(purchaseEstimate.uniqueVisitors)} คน / การเข้าชม ${formatNumber(purchaseEstimate.totalVisits)} ครั้ง`
    : "ยังไม่มีข้อมูลในช่วงเวลาที่เลือก";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="size-6 text-[var(--theme-color)]" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-[#111827]">สถิติ</h1>
          </div>
          <p className="mt-1 text-sm text-[#6B7280]">
            ตรวจสอบผู้ใช้งานปัจจุบันและสถิติการเยี่ยมชมเว็บไซต์ของไซต์นี้
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void refreshPresence();
            void refreshVisits();
            void refreshPwaStats();
          }}
          disabled={isPresenceLoading || isVisitsLoading || isPwaLoading}
          className="self-start"
        >
          <RefreshCw className={`mr-2 size-4 ${isPresenceLoading || isVisitsLoading || isPwaLoading ? "animate-spin" : ""}`} />
          รีเฟรชข้อมูล
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="ผู้เข้าชมออนไลน์"
          value={presence?.activeVisitors ?? 0}
          description="ผู้เข้าชมที่มี heartbeat ภายใน 90 วินาที"
          icon={Eye}
          tone="bg-emerald-50 text-emerald-700"
        />
        <StatCard
          label="User ออนไลน์"
          value={presence?.activeUsers ?? 0}
          description="User ที่ล็อกอินและกำลังใช้งานเว็บไซต์"
          icon={UserCheck}
          tone="bg-blue-50 text-blue-700"
        />
        <StatCard
          label="ผู้เข้าชมทั่วไป"
          value={presence?.activeAnonymousVisitors ?? 0}
          description="ผู้เข้าชมที่ยังไม่ได้ล็อกอิน"
          icon={Users}
          tone="bg-amber-50 text-amber-700"
        />
        <StatCard
          label="เข้าชมในช่วงที่เลือก"
          value={visits?.meta.totalVisits ?? 0}
          description="จำนวน page view ที่บันทึกไว้ตามช่วงเวลา"
          icon={BarChart3}
          tone="bg-pink-50 text-pink-700"
        />
      </div>

      <Card className="border border-[#E5E7EB] bg-white shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-[#111827]">การประเมินโอกาสซื้อสินค้า</CardTitle>
          <p className="text-xs leading-5 text-[#6B7280]">
            ประเมินจากจำนวนการเข้าชมทั้งหมดและผู้เยี่ยมชมไม่ซ้ำในช่วงเวลาที่เลือก
          </p>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="grid gap-3 sm:grid-cols-2">
            <PurchaseEstimateCard
              label="โอกาสซื้อ (ประมาณการ)"
              value={purchaseEstimate.purchasePercent}
              description={purchaseEstimateDescription}
              icon={ShoppingCart}
              tone="bg-emerald-50 text-emerald-700"
            />
            <PurchaseEstimateCard
              label="ไม่ซื้อ / เข้าชมซ้ำ (ประมาณการ)"
              value={purchaseEstimate.notPurchasePercent}
              description={purchaseEstimateDescription}
              icon={UserX}
              tone="bg-slate-100 text-slate-600"
            />
          </div>
          <p className="text-[11px] leading-4 text-[#9CA3AF]">
            หมายเหตุ: ค่านี้เป็นการประเมินจากผู้เยี่ยมชมไม่ซ้ำ ÷ การเข้าชมทั้งหมด ไม่ใช่อัตราการสั่งซื้อจริง
          </p>
        </CardContent>
      </Card>

      <Card className="border border-[#E5E7EB] bg-white shadow-sm">
        <CardHeader className="border-b border-[#F3F4F6] pb-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base text-[#111827]">
                <CalendarDays className="size-5 text-[var(--theme-color)]" aria-hidden="true" />
                กราฟสถิติการเยี่ยมชมเว็บไซต์
              </CardTitle>
              <p className="mt-1 text-xs text-[#6B7280]">
                อัปเดตอัตโนมัติทุก 15 วินาที · เวลาอ้างอิง Asia/Bangkok
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="analytics-timeframe" className="mb-1 block text-xs font-medium text-[#6B7280]">
                  รูปแบบข้อมูล
                </label>
                <select
                  id="analytics-timeframe"
                  value={draftFilters.timeframe}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, timeframe: event.target.value as AnalyticsTimeframe }))}
                  className="h-9 w-full rounded-md border border-[#D1D5DB] bg-white px-3 text-sm text-[#111827] outline-none focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/20"
                >
                  <option value="hourly">รายชั่วโมง</option>
                  <option value="daily">รายวัน</option>
                  <option value="monthly">รายเดือน</option>
                  <option value="yearly">รายปี</option>
                </select>
              </div>
              <div>
                <label htmlFor="analytics-start-date" className="mb-1 block text-xs font-medium text-[#6B7280]">
                  ตั้งแต่วันที่
                </label>
                <input
                  id="analytics-start-date"
                  type="date"
                  value={draftFilters.startDate}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, startDate: event.target.value }))}
                  className="h-9 w-full rounded-md border border-[#D1D5DB] bg-white px-3 text-sm text-[#111827] outline-none focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/20"
                />
              </div>
              <div>
                <label htmlFor="analytics-end-date" className="mb-1 block text-xs font-medium text-[#6B7280]">
                  ถึงวันที่
                </label>
                <input
                  id="analytics-end-date"
                  type="date"
                  value={draftFilters.endDate}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, endDate: event.target.value }))}
                  className="h-9 w-full rounded-md border border-[#D1D5DB] bg-white px-3 text-sm text-[#111827] outline-none focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/20"
                />
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[#6B7280]">
              ช่วงที่ใช้แสดงผล: {appliedFilters.startDate} ถึง {appliedFilters.endDate}
            </p>
            <Button type="button" onClick={applyFilters} disabled={isVisitsLoading} className="bg-[var(--theme-color)] hover:bg-[var(--theme-color)]">
              ใช้ตัวกรอง
            </Button>
          </div>
          {filterError ? <p className="mt-2 text-sm text-red-600" role="alert">{filterError}</p> : null}
        </CardHeader>
        <CardContent className="pt-5">
          {visitsError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
              <p>{visitsError}</p>
              <Button type="button" variant="outline" onClick={() => void refreshVisits()} className="mt-3 border-red-200 bg-white">
                ลองอีกครั้ง
              </Button>
            </div>
          ) : isVisitsLoading && !visits ? (
            <div className="flex h-[320px] items-center justify-center text-sm text-[#6B7280]">
              <RefreshCw className="mr-2 size-5 animate-spin text-[var(--theme-color)]" /> กำลังโหลดสถิติ...
            </div>
          ) : displayVisitors.length === 0 ? (
            <div className="flex h-[320px] items-center justify-center text-sm text-[#6B7280]">
              ยังไม่มีข้อมูลการเยี่ยมชมในช่วงเวลาที่เลือก
            </div>
          ) : (
            <>
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-[#FFF7FA] p-3">
                  <p className="text-xs text-[#6B7280]">จำนวนการเข้าชมทั้งหมด</p>
                  <p className="mt-1 text-xl font-bold text-[#111827]">{formatNumber(visits?.meta.totalVisits ?? 0)} ครั้ง</p>
                </div>
                <div className="rounded-lg bg-[#F5F9FF] p-3">
                  <p className="text-xs text-[#6B7280]">ผู้เยี่ยมชมไม่ซ้ำ</p>
                  <p className="mt-1 text-xl font-bold text-[#111827]">{formatNumber(visits?.meta.totalUniqueVisitors ?? 0)} คน</p>
                </div>
              </div>
              <div className="h-[320px] w-full" role="img" aria-label="กราฟจำนวนการเยี่ยมชมและผู้เยี่ยมชมไม่ซ้ำ">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={displayVisitors} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: "#6B7280" }}
                      tickFormatter={(value) => formatBucketLabel(String(value), appliedFilters.timeframe)}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: "#6B7280" }}
                      allowDecimals={false}
                      tickFormatter={(value) => formatNumber(Number(value))}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const visitsValue = Number(payload.find((entry) => entry.dataKey === "visits")?.value ?? 0);
                        const uniqueValue = Number(payload.find((entry) => entry.dataKey === "uniqueVisitors")?.value ?? 0);
                        return (
                          <div className="rounded-lg border border-[#E5E7EB] bg-white p-3 text-sm shadow-lg">
                            <p className="mb-2 font-semibold text-[#111827]">{formatBucketLabel(String(label), appliedFilters.timeframe)}</p>
                            <p className="text-[#D94D82]">เข้าชม: {formatNumber(visitsValue)} ครั้ง</p>
                            <p className="text-[#2563EB]">ไม่ซ้ำ: {formatNumber(uniqueValue)} คน</p>
                          </div>
                        );
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="visits" name="จำนวนครั้งเข้าชม" stroke="#D94D82" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="uniqueVisitors" name="ผู้เยี่ยมชมไม่ซ้ำ" stroke="#2563EB" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-5 max-h-72 overflow-auto rounded-lg border border-[#E5E7EB]">
                <table className="min-w-full text-sm">
                  <caption className="sr-only">ข้อมูลสถิติการเยี่ยมชมตามช่วงเวลา</caption>
                  <thead className="sticky top-0 bg-[#F9FAFB] text-left text-xs text-[#6B7280]">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">ช่วงเวลา</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">เข้าชม</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">ไม่ซ้ำ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F3F4F6]">
                    {displayVisitors.map((point) => (
                      <tr key={point.label}>
                        <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium text-[#374151]">
                          {formatBucketLabel(point.label, appliedFilters.timeframe)}
                        </th>
                        <td className="px-3 py-2 text-right text-[#374151]">{formatNumber(point.visits)}</td>
                        <td className="px-3 py-2 text-right text-[#374151]">{formatNumber(point.uniqueVisitors)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="mt-3 text-right text-xs text-[#9CA3AF]">
            อัปเดตล่าสุด: {formatDateTime(lastUpdated)}
          </p>
        </CardContent>
      </Card>

      {/* PWA Mobile App Installation Analytics Section */}
      <Card className="border border-[#E5E7EB] bg-white shadow-sm">
        <CardHeader className="border-b border-[#F3F4F6] pb-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base text-[#111827]">
                <Smartphone className="size-5 text-[var(--theme-color)]" aria-hidden="true" />
                สถิติการดาวน์โหลด & ติดตั้งเว็ปแอปบนมือถือ (PWA)
              </CardTitle>
              <p className="mt-1 text-xs text-[#6B7280]">
                บันทึกจำนวนผู้ใช้งานที่ดาวน์โหลดและติดตั้งเว็ปแอปลงบนหน้าจอมือถือ (Android และ iOS / Safari)
              </p>
            </div>
            {pwaStats?.updatedAt && (
              <p className="text-xs text-[#9CA3AF]">
                อัปเดตล่าสุด: {formatDateTime(pwaStats.updatedAt)}
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-5">
          {pwaError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
              <p>{pwaError}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void refreshPwaStats()}
                className="mt-3 border-red-200 bg-white"
              >
                ลองอีกครั้ง
              </Button>
            </div>
          ) : isPwaLoading && !pwaStats ? (
            <div className="flex h-[240px] items-center justify-center text-sm text-[#6B7280]">
              <RefreshCw className="mr-2 size-5 animate-spin text-[var(--theme-color)]" /> กำลังโหลดสถิติการติดตั้งเว็ปแอป...
            </div>
          ) : (
            <>
              {/* 4 KPI Summary Cards */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-[#E5E7EB] bg-[#FAF5FF] p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-[#6B7280]">การดาวน์โหลดทั้งหมด</p>
                      <p className="mt-2 text-3xl font-bold tracking-tight text-[#6B21A8]">
                        {formatNumber(pwaStats?.totalInstalls ?? 0)} <span className="text-sm font-normal text-[#6B7280]">เครื่อง</span>
                      </p>
                    </div>
                    <div className="flex size-10 items-center justify-center rounded-xl bg-[#F3E8FF] text-[#9333EA]">
                      <Download className="size-5" />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-[#6B7280]">
                    เปิดใช้งานสะสม {formatNumber(pwaStats?.totalInstallEvents ?? 0)} ครั้ง
                  </p>
                </div>

                <div className="rounded-xl border border-[#E5E7EB] bg-[#ECFDF5] p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-[#6B7280]">ติดตั้งใหม่วันนี้</p>
                      <p className="mt-2 text-3xl font-bold tracking-tight text-[#065F46]">
                        {formatNumber(pwaStats?.todayInstalls ?? 0)} <span className="text-sm font-normal text-[#6B7280]">เครื่อง</span>
                      </p>
                    </div>
                    <div className="flex size-10 items-center justify-center rounded-xl bg-[#D1FAE5] text-[#059669]">
                      <CalendarDays className="size-5" />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-[#6B7280]">
                    สถิติประจำวัน (ตามเวลาไทย UTC+7)
                  </p>
                </div>

                <div className="rounded-xl border border-[#E5E7EB] bg-[#F0FDF4] p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-[#6B7280]">ผู้ใช้ระบบ Android</p>
                      <p className="mt-2 text-3xl font-bold tracking-tight text-[#166534]">
                        {formatNumber(pwaStats?.platformBreakdown.android ?? 0)} <span className="text-sm font-normal text-[#6B7280]">เครื่อง</span>
                      </p>
                    </div>
                    <div className="flex size-10 items-center justify-center rounded-xl bg-[#DCFCE7] text-[#16A34A]">
                      <Smartphone className="size-5" />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-[#6B7280]">
                    {pwaStats?.totalInstalls
                      ? `คิดเป็น ${formatPercent(((pwaStats.platformBreakdown.android ?? 0) / pwaStats.totalInstalls) * 100)} ของทั้งหมด`
                      : "ยังไม่มีข้อมูล"}
                  </p>
                </div>

                <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-[#6B7280]">ผู้ใช้ระบบ iOS / Safari</p>
                      <p className="mt-2 text-3xl font-bold tracking-tight text-[#1E293B]">
                        {formatNumber(pwaStats?.platformBreakdown.ios ?? 0)} <span className="text-sm font-normal text-[#6B7280]">เครื่อง</span>
                      </p>
                    </div>
                    <div className="flex size-10 items-center justify-center rounded-xl bg-[#E2E8F0] text-[#334155]">
                      <Apple className="size-5" />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-[#6B7280]">
                    {pwaStats?.totalInstalls
                      ? `คิดเป็น ${formatPercent(((pwaStats.platformBreakdown.ios ?? 0) / pwaStats.totalInstalls) * 100)} ของทั้งหมด`
                      : "ยังไม่มีข้อมูล"}
                  </p>
                </div>
              </div>

              {/* Chart: Daily Installs Trend */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-[#111827]">
                  กราฟแนวโน้มการติดตั้งเว็ปแอปรายวัน (แยกตามระบบปฏิบัติการ)
                </h3>
                {(pwaStats?.dailyStats.length ?? 0) === 0 ? (
                  <div className="flex h-[240px] items-center justify-center rounded-lg border border-dashed border-[#E5E7EB] text-sm text-[#6B7280]">
                    ยังไม่มีข้อมูลการติดตั้งเว็ปแอปในช่วงเวลาที่เลือก
                  </div>
                ) : (
                  <div className="h-[280px] w-full" role="img" aria-label="กราฟแนวโน้มการติดตั้งเว็ปแอปรายวัน">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={pwaStats?.dailyStats} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis
                          dataKey="date"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: "#6B7280" }}
                          tickFormatter={(value) => {
                            const s = String(value);
                            return s.length >= 10 ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : s;
                          }}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: "#6B7280" }}
                          allowDecimals={false}
                          tickFormatter={(value) => formatNumber(Number(value))}
                        />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const total = Number(payload.find((entry) => entry.dataKey === "total")?.value ?? 0);
                            const android = Number(payload.find((entry) => entry.dataKey === "android")?.value ?? 0);
                            const ios = Number(payload.find((entry) => entry.dataKey === "ios")?.value ?? 0);
                            const other = Number(payload.find((entry) => entry.dataKey === "desktop")?.value ?? 0) +
                              Number(payload.find((entry) => entry.dataKey === "other")?.value ?? 0);
                            const s = String(label);
                            const formattedDate = s.length >= 10 ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : s;
                            return (
                              <div className="rounded-lg border border-[#E5E7EB] bg-white p-3 text-sm shadow-lg">
                                <p className="mb-2 font-semibold text-[#111827]">{formattedDate}</p>
                                <p className="font-bold text-[#8B5CF6]">ติดตั้งรวม: {formatNumber(total)} เครื่อง</p>
                                <p className="text-[#10B981]">Android: {formatNumber(android)} เครื่อง</p>
                                <p className="text-[#6366F1]">iOS / Safari: {formatNumber(ios)} เครื่อง</p>
                                {other > 0 && <p className="text-[#64748B]">อื่นๆ: {formatNumber(other)} เครื่อง</p>}
                              </div>
                            );
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="android" name="Android" fill="#10B981" stackId="installs" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="ios" name="iOS / Safari" fill="#6366F1" stackId="installs" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="desktop" name="คอมพิวเตอร์ / อื่นๆ" fill="#94A3B8" stackId="installs" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Table: Daily Breakdown */}
              {(pwaStats?.dailyStats.length ?? 0) > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-[#111827]">รายละเอียดการติดตั้งรายวัน</h3>
                  <div className="max-h-64 overflow-auto rounded-lg border border-[#E5E7EB]">
                    <table className="min-w-full text-sm">
                      <caption className="sr-only">ตารางรายละเอียดการติดตั้งเว็ปแอปรายวัน</caption>
                      <thead className="sticky top-0 bg-[#F9FAFB] text-left text-xs text-[#6B7280]">
                        <tr>
                          <th scope="col" className="px-3 py-2 font-medium">วันที่</th>
                          <th scope="col" className="px-3 py-2 text-right font-medium">รวมติดตั้งใหม่</th>
                          <th scope="col" className="px-3 py-2 text-right font-medium text-emerald-700">Android</th>
                          <th scope="col" className="px-3 py-2 text-right font-medium text-indigo-700">iOS / Safari</th>
                          <th scope="col" className="px-3 py-2 text-right font-medium text-slate-600">คอมพิวเตอร์/อื่นๆ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F3F4F6]">
                        {pwaStats?.dailyStats.map((d) => (
                          <tr key={d.date} className="hover:bg-[#F9FAFB]/60">
                            <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium text-[#374151]">
                              {d.date.length >= 10 ? `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}/${d.date.slice(0, 4)}` : d.date}
                            </th>
                            <td className="px-3 py-2 text-right font-bold text-[#111827]">{formatNumber(d.total)}</td>
                            <td className="px-3 py-2 text-right text-emerald-600 font-medium">{formatNumber(d.android)}</td>
                            <td className="px-3 py-2 text-right text-indigo-600 font-medium">{formatNumber(d.ios)}</td>
                            <td className="px-3 py-2 text-right text-[#6B7280]">{formatNumber(d.desktop + d.other)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Recent 20 Installs Feed */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-[#111827]">
                  ประวัติการติดตั้งล่าสุด ({pwaStats?.recentInstalls.length ?? 0} รายการ)
                </h3>
                {(pwaStats?.recentInstalls.length ?? 0) === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#D1D5DB] bg-[#F9FAFB] p-6 text-center">
                    <Smartphone className="mx-auto size-8 text-[#9CA3AF]" aria-hidden="true" />
                    <p className="mt-2 text-sm font-medium text-[#374151]">ยังไม่มีบันทึกการติดตั้งเว็ปแอป</p>
                    <p className="mt-1 text-xs text-[#6B7280]">
                      เมื่อมีผู้ใช้งานติดตั้งแอปหรือเปิดใช้งานจากหน้าจอโฮม ระบบจะบันทึกและแสดงที่นี่ทันที
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-[#E5E7EB]">
                    <table className="min-w-full text-sm">
                      <thead className="bg-[#F9FAFB] text-left text-xs text-[#6B7280]">
                        <tr>
                          <th scope="col" className="px-3 py-2 font-medium">เวลาติดตั้ง</th>
                          <th scope="col" className="px-3 py-2 font-medium">ระบบ</th>
                          <th scope="col" className="px-3 py-2 font-medium">ผู้ใช้งาน</th>
                          <th scope="col" className="px-3 py-2 font-medium">ช่องทางการติดตั้ง</th>
                          <th scope="col" className="px-3 py-2 text-right font-medium">เปิดใช้งาน</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F3F4F6]">
                        {pwaStats?.recentInstalls.map((item) => (
                          <tr key={item.id} className="hover:bg-[#F9FAFB]/60">
                            <td className="whitespace-nowrap px-3 py-2 text-xs text-[#6B7280]" title={formatDateTime(item.installedAt)}>
                              {formatRelativeTime(item.installedAt)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2">
                              {renderPlatformBadge(item.platform)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2">
                              {item.userName || item.userEmail ? (
                                <div className="text-xs">
                                  <span className="font-semibold text-[#111827]">{item.userName || "สมาชิก"}</span>
                                  {item.userEmail && <span className="ml-1 text-[#6B7280]">({item.userEmail})</span>}
                                </div>
                              ) : (
                                <span className="text-xs text-[#9CA3AF]">ผู้เยี่ยมชมทั่วไป</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-xs text-[#4B5563]">
                              {formatPwaSource(item.source)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-[#111827]">
                              {formatNumber(item.installCount)} ครั้ง
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border border-[#E5E7EB] bg-white shadow-sm">
        <CardHeader className="flex flex-col gap-2 border-b border-[#F3F4F6] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base text-[#111827]">
              <UserCheck className="size-5 text-emerald-600" aria-hidden="true" />
              User ที่กำลังใช้งานอยู่
            </CardTitle>
            <p className="mt-1 text-xs text-[#6B7280]">
              ตรวจจาก heartbeat ทุก {Math.round(PRESENCE_REFRESH_MS / 1000)} วินาที และถือว่า active ภายใน {presence?.staleAfterSeconds ?? 90} วินาที
            </p>
          </div>
          <div className="text-left text-xs text-[#6B7280] sm:text-right">
            <p>{formatNumber(presence?.activeSessions ?? 0)} session</p>
            <p>อัปเดต {formatDateTime(presenceUpdatedAt)}</p>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          {presenceError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
              <p>{presenceError}</p>
              <Button type="button" variant="outline" onClick={() => void refreshPresence()} className="mt-3 border-red-200 bg-white">
                ลองอีกครั้ง
              </Button>
            </div>
          ) : isPresenceLoading && !presence ? (
            <div className="flex min-h-28 items-center justify-center text-sm text-[#6B7280]">
              <RefreshCw className="mr-2 size-5 animate-spin text-emerald-600" /> กำลังตรวจสอบผู้ใช้งาน...
            </div>
          ) : presence?.users.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {presence.users.map((user) => (
                <div key={user.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-[#E5E7EB] bg-[#FCFCFD] p-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-700" aria-hidden="true">
                    {initials(user)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-[#111827]">{user.displayName || user.email || "ไม่ระบุชื่อ"}</p>
                    {user.displayName && user.email ? <p className="truncate text-xs text-[#6B7280]">{user.email}</p> : null}
                    <p className="truncate text-xs text-[#6B7280]" title={user.pagePath}>กำลังดู {user.pagePath}</p>
                    <p className="text-xs text-emerald-700">ออนไลน์ · {formatRelativeTime(user.lastSeenAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[#D1D5DB] bg-[#F9FAFB] p-6 text-center">
              <Users className="mx-auto size-8 text-[#9CA3AF]" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-[#374151]">ยังไม่มี User ที่ล็อกอินใช้งานอยู่</p>
              <p className="mt-1 text-xs text-[#6B7280]">ขณะนี้มีผู้เข้าชมทั่วไปออนไลน์ {formatNumber(presence?.activeAnonymousVisitors ?? 0)} คน</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
