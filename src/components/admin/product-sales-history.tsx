"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  ImageOff,
  Loader2,
  Search,
  ShoppingBag,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addTopupReportDays, getDateOnlyInTopupTimeZone } from "@/lib/topup/report-time";
import { normalizeNewlines } from "@/lib/utils";

const TIME_ZONE = "Asia/Bangkok";
const PAGE_SIZE = 20;

type Period = "today" | "yesterday" | "7d" | "30d" | "all" | "custom";

type ProductSalesHistoryItem = {
  id: string;
  productName: string;
  productImage: string | null;
  productData: string | null;
  storeName: string;
  buyerName: string;
  buyerEmail: string | null;
  purchasedAt: string | null;
};

type ProductSalesHistoryMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  startDate: string | null;
  endDate: string | null;
  timeZone: string;
};

type ProductSalesHistoryResponse = {
  items?: ProductSalesHistoryItem[];
  meta?: ProductSalesHistoryMeta;
  message?: string;
};

function getRangeForPeriod(
  period: Period,
  startDate: string,
  endDate: string,
): { startDate?: string; endDate?: string } | null {
  const today = getDateOnlyInTopupTimeZone();

  switch (period) {
    case "today":
      return { startDate: today, endDate: today };
    case "yesterday": {
      const yesterday = addTopupReportDays(today, -1);
      return { startDate: yesterday, endDate: yesterday };
    }
    case "7d":
      return { startDate: addTopupReportDays(today, -6), endDate: today };
    case "30d":
      return { startDate: addTopupReportDays(today, -29), endDate: today };
    case "custom":
      return startDate && endDate ? { startDate, endDate } : null;
    case "all":
    default:
      return {};
  }
}

function formatThaiDate(value: string | null): string {
  if (!value) return "ไม่ระบุ";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ไม่ระบุ";

  return new Intl.DateTimeFormat("th-TH", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getDetailCards(value: string | null): string[] {
  const normalized = normalizeNewlines(value).trim();
  if (!normalized) return [];

  return normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitDetailLabel(value: string): { label: string | null; text: string } {
  const match = value.match(/^([^:=]{1,80})\s*[:=]\s*(.*)$/);
  if (!match) return { label: null, text: value };
  return { label: match[1].trim(), text: match[2].trim() || "-" };
}

async function copyProductData(value: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      if (!copied) throw new Error("Clipboard unavailable");
    }
    toast.success("คัดลอกข้อมูลสินค้าแล้ว");
  } catch {
    toast.error("ไม่สามารถคัดลอกข้อมูลสินค้าได้");
  }
}

export default function ProductSalesHistory() {
  const [period, setPeriod] = useState<Period>("today");
  const [startDate, setStartDate] = useState(() => getDateOnlyInTopupTimeZone());
  const [endDate, setEndDate] = useState(() => getDateOnlyInTopupTimeZone());
  const [searchUser, setSearchUser] = useState("");
  const [searchProductEmail, setSearchProductEmail] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ProductSalesHistoryItem[]>([]);
  const [meta, setMeta] = useState<ProductSalesHistoryMeta>({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    totalPages: 1,
    startDate: null,
    endDate: null,
    timeZone: TIME_ZONE,
  });
  const [selectedItem, setSelectedItem] = useState<ProductSalesHistoryItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const requestSequence = useRef(0);

  const activeRange = useMemo(
    () => getRangeForPeriod(period, startDate, endDate),
    [period, startDate, endDate],
  );

  useEffect(() => {
    if (!activeRange) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const requestNumber = ++requestSequence.current;
    setIsLoading(true);
    setError(null);

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({ page: String(page) });
          if (searchUser.trim()) params.set("searchUser", searchUser.trim());
          if (searchProductEmail.trim()) params.set("searchProductEmail", searchProductEmail.trim());
          if (activeRange.startDate) params.set("startDate", activeRange.startDate);
          if (activeRange.endDate) params.set("endDate", activeRange.endDate);

          const response = await fetch(`/api/admin/product-sales-history?${params.toString()}`, {
            credentials: "include",
            cache: "no-store",
            signal: controller.signal,
          });
          const data = (await response.json().catch(() => ({}))) as ProductSalesHistoryResponse;

          if (!response.ok) {
            throw new Error(
              response.status === 401 || response.status === 403
                ? "คุณไม่มีสิทธิ์เข้าถึงประวัติการขายสินค้า"
                : data.message || "โหลดประวัติการขายสินค้าไม่สำเร็จ",
            );
          }

          if (requestNumber !== requestSequence.current) return;
          setItems(data.items ?? []);
          if (data.meta) setMeta(data.meta);
        } catch (requestError) {
          if (requestError instanceof DOMException && requestError.name === "AbortError") return;
          if (requestNumber !== requestSequence.current) return;
          setItems([]);
          setError(requestError instanceof Error ? requestError.message : "โหลดข้อมูลไม่สำเร็จ");
        } finally {
          if (requestNumber === requestSequence.current) setIsLoading(false);
        }
      })();
    }, 240);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeRange, page, retryNonce, searchProductEmail, searchUser]);

  const detailCards = selectedItem ? getDetailCards(selectedItem.productData) : [];
  const firstItem = meta.total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastItem = Math.min(page * PAGE_SIZE, meta.total);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-[#0B0B0B]">
            <ShoppingBag className="size-5 text-[var(--theme-color)]" aria-hidden="true" />
            ประวัติการขายสินค้า
          </h1>
          <p className="mt-1 text-sm text-[#9a5832]">
            รายการสินค้าที่ขายแล้ว พร้อมข้อมูลผู้ซื้อและเวลาซื้อในเขตเวลาไทย
          </p>
        </div>
        <Badge variant="outline" className="w-fit border-[#f1b8cb] bg-[#fff8fb] text-[#a63c69]">
          {PAGE_SIZE} รายการต่อหน้า
        </Badge>
      </div>

      <Card className="border-[#f1d8e2] bg-white/95 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-[#0B0B0B]">ค้นหาและกรองประวัติการขาย</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="product-sales-user-search">ชื่อหรืออีเมลผู้ซื้อ</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9a5832]" aria-hidden="true" />
                <Input
                  id="product-sales-user-search"
                  value={searchUser}
                  onChange={(event) => {
                    setSearchUser(event.target.value);
                    setPage(1);
                  }}
                  placeholder="ค้นหาชื่อ User หรือ Email..."
                  className="border-[#ead7df] bg-white pl-9 focus-visible:ring-[var(--theme-color)]"
                  autoComplete="off"
                />
              </div>
              <p className="text-xs text-[#8a6c78]">ระบบค้นหาให้อัตโนมัติขณะพิมพ์</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="product-sales-email-search">Email ในรายละเอียดสินค้า</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9a5832]" aria-hidden="true" />
                <Input
                  id="product-sales-email-search"
                  value={searchProductEmail}
                  onChange={(event) => {
                    setSearchProductEmail(event.target.value);
                    setPage(1);
                  }}
                  placeholder="ค้นหา Email ของบัญชีสินค้า..."
                  className="border-[#ead7df] bg-white pl-9 focus-visible:ring-[var(--theme-color)]"
                  autoComplete="off"
                />
              </div>
              <p className="text-xs text-[#8a6c78]">ค้นหาในข้อมูลสินค้าที่ส่งมอบให้ผู้ซื้อ</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-[#f3e4e9] pt-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <Label htmlFor="product-sales-period">ช่วงเวลา</Label>
              <select
                id="product-sales-period"
                value={period}
                onChange={(event) => {
                  setPeriod(event.target.value as Period);
                  setPage(1);
                }}
                className="flex h-10 w-full rounded-md border border-[#ead7df] bg-white px-3 py-2 text-sm text-[#0B0B0B] outline-none focus:ring-2 focus:ring-[var(--theme-color)] sm:w-52"
              >
                <option value="today">วันนี้</option>
                <option value="yesterday">เมื่อวาน</option>
                <option value="7d">7 วัน</option>
                <option value="30d">30 วัน</option>
                <option value="all">ทั้งหมด</option>
                <option value="custom">กำหนดเอง</option>
              </select>
            </div>

            <p className="text-xs text-[#8a6c78]">ตัวกรองและเวลาทั้งหมดอ้างอิง Asia/Bangkok (UTC+7)</p>
          </div>

          {period === "custom" && (
            <div className="grid gap-4 rounded-xl border border-[#f3e4e9] bg-[#fffafd] p-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="product-sales-start-date">วันที่เริ่มต้น</Label>
                <Input
                  id="product-sales-start-date"
                  type="date"
                  value={startDate}
                  onChange={(event) => {
                    setStartDate(event.target.value);
                    setPage(1);
                  }}
                  className="border-[#ead7df] bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-sales-end-date">วันที่สิ้นสุด</Label>
                <Input
                  id="product-sales-end-date"
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(event) => {
                    setEndDate(event.target.value);
                    setPage(1);
                  }}
                  className="border-[#ead7df] bg-white"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex flex-col gap-3 p-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <Button type="button" variant="outline" onClick={() => setRetryNonce((current) => current + 1)}>
              ลองใหม่
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="border-transparent bg-white/95 shadow-lg shadow-black/5" aria-busy={isLoading}>
        <CardHeader className="flex flex-col gap-2 border-b border-[#f3e4e9] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base text-[#0B0B0B]">รายการขายสินค้า</CardTitle>
            <p className="mt-1 text-xs text-[#8a6c78]">
              ทั้งหมด {meta.total.toLocaleString("th-TH")} รายการ
            </p>
          </div>
          {isLoading && <Loader2 className="size-5 animate-spin text-[var(--theme-color)]" aria-label="กำลังโหลด" />}
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {isLoading && items.length === 0 ? (
            <div className="grid gap-4 md:grid-cols-2" aria-label="กำลังโหลดรายการขายสินค้า">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-52 animate-pulse rounded-2xl bg-[#fff0f5]" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#e9cbd7] bg-[#fffafd] px-4 py-12 text-center">
              <ShoppingBag className="mx-auto size-9 text-[#e9a5bd]" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-[#6f4857]">
                {searchUser || searchProductEmail ? "ไม่พบรายการที่ตรงกับการค้นหา" : "ยังไม่มีประวัติการขายในช่วงเวลานี้"}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {items.map((item) => (
                <Card key={item.id} className="overflow-hidden border-[#f1d8e2] bg-white shadow-sm transition-shadow hover:shadow-md">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#f3e4e9] bg-[#fffafd]">
                        {item.productImage ? (
                          <img
                            src={item.productImage}
                            alt={item.productName}
                            className="h-full w-full object-contain"
                            loading="lazy"
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <ImageOff className="size-6 text-[#d9a5b8]" aria-label="ไม่มีรูปสินค้า" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-[#9a5832]">ร้านค้า</p>
                        <p className="truncate text-sm font-semibold text-[#0B0B0B]">{item.storeName}</p>
                        <p className="mt-2 text-xs font-medium text-[#9a5832]">สินค้า</p>
                        <p className="line-clamp-2 text-sm font-semibold text-[#0B0B0B]">{item.productName}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 border-t border-[#f3e4e9] pt-4 sm:grid-cols-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[#9a5832]">User ผู้ซื้อ</p>
                        <p className="truncate text-sm font-medium text-[#0B0B0B]" title={item.buyerName}>
                          {item.buyerName}
                        </p>
                        {item.buyerEmail && (
                          <p className="truncate text-xs text-[#6f6470]" title={item.buyerEmail}>
                            {item.buyerEmail}
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-[#9a5832]">วันที่และเวลาที่ซื้อ</p>
                        <p className="text-sm font-medium text-[#0B0B0B]">{formatThaiDate(item.purchasedAt)}</p>
                        <p className="text-[11px] text-[#8a6c78]">เวลาไทย</p>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      className="mt-4 w-full border-[#e9a5bd] text-[#a63c69] hover:bg-[#fff0f5] hover:text-[#8f2f59]"
                      onClick={() => setSelectedItem(item)}
                    >
                      <Eye className="size-4" aria-hidden="true" />
                      ดูรายละเอียดสินค้า
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 border-t border-[#f3e4e9] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[#6f6470]">
              แสดง {firstItem.toLocaleString("th-TH")}–{lastItem.toLocaleString("th-TH")} จาก {meta.total.toLocaleString("th-TH")} รายการ
            </p>
            <div className="flex items-center justify-between gap-2 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="หน้าก่อนหน้า"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </Button>
              <Label htmlFor="product-sales-page" className="sr-only">เลือกหน้าประวัติการขาย</Label>
              <select
                id="product-sales-page"
                value={page}
                onChange={(event) => setPage(Number(event.target.value))}
                className="h-9 rounded-md border border-[#ead7df] bg-white px-3 text-sm text-[#0B0B0B] outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                aria-label="เลือกหน้าประวัติการขาย"
              >
                {Array.from({ length: meta.totalPages }, (_, index) => index + 1).map((pageNumber) => (
                  <option key={pageNumber} value={pageNumber}>หน้า {pageNumber}</option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="หน้าถัดไป"
                disabled={page >= meta.totalPages || isLoading}
                onClick={() => setPage((current) => Math.min(meta.totalPages, current + 1))}
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={selectedItem !== null} onOpenChange={(open) => !open && setSelectedItem(null)}>
        {selectedItem && (
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="pr-8 text-xl text-[#0B0B0B]">รายละเอียดสินค้าที่ขาย</DialogTitle>
              <DialogDescription className="text-[#6f6470]">
                ตรวจสอบข้อมูลผู้ซื้อและข้อมูลสินค้าที่ส่งมอบ โดยแสดงเวลาไทย
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid gap-3 rounded-2xl border border-[#f3e4e9] bg-[#fffafd] p-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-[#9a5832]">ชื่อสินค้า</p>
                  <p className="mt-1 text-sm font-semibold text-[#0B0B0B]">{selectedItem.productName}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-[#9a5832]">ร้านค้า</p>
                  <p className="mt-1 text-sm font-semibold text-[#0B0B0B]">{selectedItem.storeName}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-[#9a5832]">ชื่อ User ผู้ซื้อ</p>
                  <p className="mt-1 text-sm font-semibold text-[#0B0B0B]">{selectedItem.buyerName}</p>
                  {selectedItem.buyerEmail && <p className="text-xs text-[#6f6470]">{selectedItem.buyerEmail}</p>}
                </div>
                <div>
                  <p className="text-xs font-medium text-[#9a5832]">วันที่และเวลาที่ซื้อ (เวลาไทย)</p>
                  <p className="mt-1 text-sm font-semibold text-[#0B0B0B]">{formatThaiDate(selectedItem.purchasedAt)}</p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-[#0B0B0B]">รายละเอียดข้อมูลสินค้า</h2>
                  <p className="mt-1 text-xs text-[#6f6470]">ข้อมูลที่บันทึกไว้ในรายการขายนี้</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!selectedItem.productData}
                  onClick={() => selectedItem.productData && void copyProductData(normalizeNewlines(selectedItem.productData))}
                  className="border-[#e9a5bd] text-[#a63c69] hover:bg-[#fff0f5] hover:text-[#8f2f59]"
                >
                  <Copy className="size-4" aria-hidden="true" />
                  Copy ข้อมูลสินค้า
                </Button>
              </div>

              {detailCards.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {detailCards.map((detail, index) => {
                    const parsed = splitDetailLabel(detail);
                    return (
                      <Card key={`${detail}-${index}`} className="border-[#f1d8e2] bg-white shadow-none">
                        <CardContent className="p-4">
                          {parsed.label && <p className="text-xs font-semibold text-[#9a5832]">{parsed.label}</p>}
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[#0B0B0B]">{parsed.text}</p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[#e9cbd7] bg-[#fffafd] p-6 text-center text-sm text-[#6f6470]">
                  ไม่มีรายละเอียดข้อมูลสินค้า
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
