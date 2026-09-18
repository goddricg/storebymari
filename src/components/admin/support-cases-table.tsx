"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  Search,
  Eye,
  CheckCircle2,
  Clock,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  User,
  AlertTriangle,
  RotateCcw,
  Key,
  Tv,
  Link2,
  HelpCircle,
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";
import PushSubscriptionControl from "@/components/push/push-subscription-control";
import { useSession } from "@/lib/auth/use-session";
import type { SupportCase, SupportCaseStatus } from "@/lib/support/types";

const ADMIN_TAG_COLORS = [
  "border-sky-500 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  "border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300",
  "border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  "border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  "border-rose-500 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  "border-cyan-500 bg-cyan-50 text-cyan-700 dark:border-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300",
  "border-fuchsia-500 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-700 dark:bg-fuchsia-950/50 dark:text-fuchsia-300",
  "border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-950/50 dark:text-teal-300",
];

function getAdminTagColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % ADMIN_TAG_COLORS.length;
  return ADMIN_TAG_COLORS[index];
}

function formatExpirationDate(val: string | null | undefined): string | null {
  if (!val || !val.trim()) return null;
  const str = val.trim();
  const isoMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
  }
  const dmMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (dmMatch) {
    const d = parseInt(dmMatch[1], 10);
    const m = parseInt(dmMatch[2], 10);
    let y = parseInt(dmMatch[3], 10);
    if (y < 100) y = 2000 + y;
    return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }
  return str;
}

export default function SupportCasesTable() {
  const { user: currentAdmin } = useSession();
  const currentAdminName = currentAdmin?.displayName || currentAdmin?.email?.split("@")[0] || "Admin";
  const searchParams = useSearchParams();
  const router = useRouter();
  const deepLinkedCaseRef = useRef<string | null>(null);
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCase, setSelectedCase] = useState<SupportCase | null>(null);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [caseTypeFilter, setCaseTypeFilter] = useState<string>("all");
  const [searchEmail, setSearchEmail] = useState("");
  const [searchCaseCode, setSearchCaseCode] = useState("");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const itemsPerPage = 50;

  // Form states in Floating Card Console
  const [updateStatus, setUpdateStatus] = useState<SupportCaseStatus>("pending");
  const [adminNote, setAdminNote] = useState("");
  const [adminResponse, setAdminResponse] = useState("");

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
    setCases([]);
  }, [statusFilter, caseTypeFilter, searchEmail, searchCaseCode]);

  // Fetch cases when page or filters change
  useEffect(() => {
    fetchCases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, statusFilter, caseTypeFilter, searchEmail, searchCaseCode]);

  const fetchCases = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        pagination: "true",
        page: String(currentPage),
        limit: String(itemsPerPage),
      });
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (caseTypeFilter !== "all") params.append("caseType", caseTypeFilter);
      if (searchEmail) params.append("searchEmail", searchEmail);
      if (searchCaseCode) params.append("searchCaseCode", searchCaseCode);

      const response = await fetch(`/api/admin/support-cases?${params.toString()}`);
      const data = (await response.json()) as {
        ok: boolean;
        cases: SupportCase[];
        total?: number;
        page?: number;
        totalPages?: number;
      };

      if (!response.ok || !data.ok) {
        throw new Error("ไม่สามารถดึงข้อมูลเคสได้");
      }

      setCases(data.cases || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (error) {
      toast.error("ไม่สามารถโหลดข้อมูลเคสได้");
    } finally {
      setIsLoading(false);
    }
  };

  // Open Floating Card Console
  const handleOpenConsole = async (caseData: SupportCase) => {
    const shouldClaim = caseData.status === "pending" || !caseData.handledByName || !caseData.handledById;

    // Optimistic instant tag & in_progress status
    const initialCase: SupportCase = shouldClaim
      ? {
          ...caseData,
          status: "in_progress",
          handledByName: caseData.handledByName || currentAdminName,
        }
      : caseData;

    if (shouldClaim) {
      setCases((prev) =>
        prev.map((c) => (c.id === caseData.id ? initialCase : c))
      );
    }

    setSelectedCase(initialCase);
    setUpdateStatus(initialCase.status === "pending" ? "in_progress" : initialCase.status);
    setAdminNote(caseData.adminNote || "");
    setAdminResponse(caseData.adminResponse || "");
    setIsConsoleOpen(true);

    // Concurrently trigger claim in DB if needed
    if (shouldClaim) {
      fetch("/api/admin/support-cases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: caseData.id, action: "claim" }),
      })
        .then((res) => res.json())
        .then((claimData) => {
          if (claimData.ok && claimData.case) {
            setCases((prev) =>
              prev.map((c) => (c.id === caseData.id ? { ...c, ...claimData.case } : c))
            );
            setSelectedCase((curr) =>
              curr?.id === caseData.id ? { ...curr, ...claimData.case } : curr
            );
          }
        })
        .catch((err) => console.error("Auto claim error:", err));
    }

    // Fetch full case data with attachments
    try {
      const response = await fetch(`/api/admin/support-cases?id=${caseData.id}`);
      const data = (await response.json()) as { ok: boolean; case?: SupportCase };
      if (data.ok && data.case) {
        const fetchedCase = data.case;
        setSelectedCase((curr) =>
          curr?.id === caseData.id
            ? {
                ...fetchedCase,
                handledByName: curr.handledByName || fetchedCase.handledByName,
                status: curr.status === "in_progress" ? "in_progress" : fetchedCase.status,
              }
            : curr
        );
        setCases((prev) =>
          prev.map((c) =>
            c.id === caseData.id
              ? {
                  ...fetchedCase,
                  handledByName: c.handledByName || fetchedCase.handledByName,
                  status: c.status === "in_progress" ? "in_progress" : fetchedCase.status,
                }
              : c
          )
        );
      }
    } catch (err) {
      console.error("Error fetching full case:", err);
    }
  };

  // Handle deep-link
  const deepLinkedCaseId = searchParams.get("caseId");
  useEffect(() => {
    if (!deepLinkedCaseId || isLoading || deepLinkedCaseRef.current === deepLinkedCaseId) return;

    deepLinkedCaseRef.current = deepLinkedCaseId;
    let cancelled = false;

    const openDeepLinkedCase = async () => {
      const caseFromPage = cases.find((caseData) => caseData.id === deepLinkedCaseId);
      if (caseFromPage) {
        await handleOpenConsole(caseFromPage);
      } else {
        try {
          const response = await fetch(`/api/admin/support-cases?id=${encodeURIComponent(deepLinkedCaseId)}`);
          const data = (await response.json()) as { ok: boolean; case?: SupportCase };
          if (!response.ok || !data.ok || !data.case) {
            throw new Error("ไม่พบเคสแจ้งปัญหาที่ต้องการเปิด");
          }
          if (!cancelled) {
            await handleOpenConsole(data.case);
          }
        } catch (error) {
          if (!cancelled) {
            toast.error(error instanceof Error ? error.message : "ไม่สามารถเปิดเคสได้");
          }
        }
      }

      if (!cancelled) {
        const nextParams = new URLSearchParams(searchParams.toString());
        nextParams.delete("caseId");
        const query = nextParams.toString();
        router.replace(query ? `/admin?${query}` : "/admin", { scroll: false });
      }
    };

    void openDeepLinkedCase();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cases, deepLinkedCaseId, isLoading, router, searchParams]);

  // Save update (with optional direct status override)
  const handleSaveUpdate = (statusToSet?: SupportCaseStatus) => {
    if (!selectedCase) return;

    const finalStatus = statusToSet || updateStatus;

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/support-cases", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: selectedCase.id,
            status: finalStatus,
            adminNote: adminNote || null,
            adminResponse: adminResponse || null,
          }),
        });

        const data = (await response.json()) as { ok: boolean; message?: string };

        if (!response.ok || !data.ok) {
          throw new Error(data.message || "ไม่สามารถอัปเดตเคสได้");
        }

        toast.success(
          finalStatus === "resolved"
            ? "บันทึกและปิดเคสเรียบร้อยแล้ว ✅"
            : "อัปเดตเคสเรียบร้อยแล้ว"
        );
        setIsConsoleOpen(false);
        fetchCases();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "เกิดข้อผิดพลาด");
      }
    });
  };

  // Quick Reply button click handler
  const handleQuickReply = (text: string) => {
    setAdminResponse((prev) => {
      if (!prev.trim()) return text;
      return `${prev}\n${text}`;
    });
    toast.info("แทรกข้อความด่วนเรียบร้อย");
  };

  // Copy helper
  const copyToClipboard = (text: string, fieldName: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    toast.success(`คัดลอก ${fieldName} แล้ว`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Bangkok",
    });
  };

  return (
    <div className="space-y-6">
      {/* Web Push Notification Control */}
      <PushSubscriptionControl />

      {/* Filters */}
      <Card className="border-transparent bg-white/95 shadow-sm dark:bg-[#151515] dark:border-white/10">
        <CardHeader>
          <CardTitle className="text-lg text-[#0B0B0B] dark:text-white">ตัวกรอง</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label className="text-sm text-[#6B7280]">สถานะ</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="bg-white dark:bg-[#202020]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งหมด</SelectItem>
                  <SelectItem value="pending">ยังไม่แก้</SelectItem>
                  <SelectItem value="in_progress">กำลังแก้</SelectItem>
                  <SelectItem value="resolved">แก้แล้ว</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-[#6B7280]">ประเภทเคส</Label>
              <Select value={caseTypeFilter} onValueChange={setCaseTypeFilter}>
                <SelectTrigger className="bg-white dark:bg-[#202020]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งหมด</SelectItem>
                  <SelectItem value="screen">จอ</SelectItem>
                  <SelectItem value="account">แอค</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-[#6B7280]">ค้นหา Email</Label>
              <Input
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                placeholder="ค้นหาเมลสินค้า หรือ เมลผู้ส่งเคส..."
                className="bg-white dark:bg-[#202020]"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-[#6B7280]">ค้นหารหัสเคส</Label>
              <Input
                value={searchCaseCode}
                onChange={(e) => setSearchCaseCode(e.target.value.toUpperCase())}
                placeholder="CASE-2026-00031"
                className="bg-white dark:bg-[#202020]"
              />
            </div>
          </div>

          {(statusFilter !== "all" ||
            caseTypeFilter !== "all" ||
            searchEmail ||
            searchCaseCode) && (
            <div className="mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatusFilter("all");
                  setCaseTypeFilter("all");
                  setSearchEmail("");
                  setSearchCaseCode("");
                }}
                className="border-[var(--theme-color)]/40 text-[var(--theme-color)] hover:bg-[var(--theme-color)]/10"
              >
                <X className="mr-2 size-4" />
                ล้างตัวกรอง
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cases Table */}
      <Card className="border-transparent bg-white/95 shadow-sm dark:bg-[#151515] dark:border-white/10">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg text-[#0B0B0B] dark:text-white">
              เคสทั้งหมด ({total.toLocaleString()})
            </CardTitle>
            <Badge variant="outline" className="text-xs border-[var(--theme-color)]/50 text-[var(--theme-color)]">
              Support Console 2.0
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && cases.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-8 animate-spin text-[var(--theme-color)]" />
            </div>
          ) : cases.length === 0 ? (
            <div className="py-12 text-center text-[#6B7280]">
              ไม่พบเคสที่ตรงกับเงื่อนไข
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-[950px] w-full divide-y divide-[#E5E7EB] dark:divide-white/10">
                  <thead className="bg-[#F9FAFB] dark:bg-[#1c1c1c]">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                        รหัสเคส & สถานะตรวจ
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                        ผู้ส่งเคส
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                        ร้านค้า
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                        สินค้า
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                        Email / ลิงก์
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                        สถานะเคส
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                        วันที่แจ้ง
                      </th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                        ศูนย์ควบคุม
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E7EB] bg-white dark:bg-[#151515] dark:divide-white/10">
                    {cases.map((caseData) => (
                      <tr
                        key={caseData.id}
                        onClick={() => handleOpenConsole(caseData)}
                        className="hover:bg-[#F9FAFB] dark:hover:bg-[#1c1c1c] cursor-pointer transition-colors"
                      >
                        {/* รหัสเคส + Badges */}
                        <td className="px-3 py-2.5 text-sm">
                          <div className="flex flex-col gap-1 items-start">
                            <span className="font-mono font-bold text-[#0B0B0B] dark:text-white">
                              {caseData.caseCode}
                            </span>
                            <div className="flex items-center gap-1 flex-wrap">
                              {/* Claim Iteration Badge */}
                              {(caseData.claimIteration ?? 1) > 1 && (
                                <span className="inline-flex items-center rounded px-1.5 py-0.2 text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                                  เคลม #{caseData.claimIteration}
                                </span>
                              )}
                              {/* Dispute Badge */}
                              {caseData.isDisputed && (
                                <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 text-[10px] font-bold bg-rose-100 text-rose-700 animate-pulse dark:bg-rose-950/60 dark:text-rose-300">
                                  <AlertTriangle className="size-2.5" />
                                  โต้แย้ง
                                </span>
                              )}
                              {/* Warranty Status Badge */}
                              {caseData.verifiedWarrantyStatus === "active" && (
                                <span className="inline-flex items-center rounded px-1.5 py-0.2 text-[10px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                                  เหลือ {caseData.verifiedRemainingDays ?? "?"} วัน
                                </span>
                              )}
                              {caseData.verifiedWarrantyStatus === "expired" && (
                                <span className="inline-flex items-center rounded px-1.5 py-0.2 text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                  หมดประกัน
                                </span>
                              )}
                              {caseData.verifiedWarrantyStatus === "not_found" && (
                                <span className="inline-flex items-center rounded px-1.5 py-0.2 text-[10px] font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                  ไม่พบประวัติ
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* ผู้ส่งเคส */}
                        <td className="px-3 py-2.5 text-sm">
                          <div className="flex flex-col min-w-[120px] max-w-[170px]">
                            <span className="font-semibold text-[#0B0B0B] dark:text-white truncate" title={caseData.userName || "-"}>
                              {caseData.userName || "ผู้ใช้ทั่วไป"}
                            </span>
                            {caseData.userEmail ? (
                              <span className="text-[11px] text-[#6B7280] dark:text-gray-400 truncate font-mono" title={caseData.userEmail}>
                                {caseData.userEmail}
                              </span>
                            ) : null}
                          </div>
                        </td>

                        {/* ร้านค้า */}
                        <td className="px-3 py-2.5 text-sm text-[#0B0B0B] dark:text-white">
                          <Badge variant="outline" className="text-[11px]">
                            {caseData.shopName === "Appbymari" ? "Store By Mari" : (caseData.shopName || "Store By Mari")}
                          </Badge>
                        </td>

                        {/* สินค้า */}
                        <td className="px-3 py-2.5 text-sm text-[#0B0B0B] dark:text-white max-w-[150px] truncate" title={caseData.productName || "-"}>
                          {caseData.productName || "-"}
                        </td>

                        {/* Email สินค้า / จอ */}
                        <td className="px-3 py-2.5 text-sm text-[#6B7280] dark:text-gray-400">
                          <div className="flex flex-col">
                            <span className="font-mono text-xs truncate max-w-[160px]" title={caseData.accountEmail || "-"}>
                              {caseData.accountEmail || "-"}
                            </span>
                            <span className="text-[11px]">
                              {caseData.caseType === "screen"
                                ? `จอ ${caseData.screenNumber || "-"}`
                                : "แบบแอค/ลิงก์"}
                            </span>
                            {caseData.expirationDate && (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                                หมดอายุ: {formatExpirationDate(caseData.expirationDate)}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* สถานะเคส */}
                        <td className="px-3 py-2.5 text-sm">
                          <div className="flex flex-col gap-1 items-start">
                            <Badge
                              className={
                                caseData.status === "resolved"
                                  ? "bg-green-500 text-white hover:bg-green-600"
                                  : caseData.status === "in_progress"
                                  ? "bg-sky-500 text-white hover:bg-sky-600"
                                  : "bg-yellow-500 text-white hover:bg-yellow-600"
                              }
                            >
                              {caseData.status === "resolved"
                                ? "แก้แล้ว"
                                : caseData.status === "in_progress"
                                ? "กำลังแก้"
                                : "ยังไม่แก้"}
                            </Badge>
                            {caseData.handledByName && (
                              <span
                                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold border ${getAdminTagColor(
                                  caseData.handledByName
                                )}`}
                              >
                                {caseData.status === "in_progress" && (
                                  <span className="size-1 rounded-full bg-current animate-pulse" />
                                )}
                                {caseData.handledByName}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* วันที่แจ้ง */}
                        <td className="px-3 py-2.5 text-xs text-[#6B7280] dark:text-gray-400 whitespace-nowrap">
                          {formatDate(caseData.createdAt)}
                        </td>

                        {/* ปุ่มเปิดคอนโซล */}
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenConsole(caseData);
                            }}
                            className="h-8 text-xs font-semibold border-[var(--theme-color)]/50 text-[var(--theme-color)] hover:bg-[var(--theme-color)] hover:text-white shadow-sm"
                          >
                            <Eye className="mr-1 size-3.5" />
                            จัดการเคส
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="block md:hidden divide-y divide-[#E5E7EB] dark:divide-white/10">
                {cases.map((caseData) => (
                  <div
                    key={caseData.id}
                    onClick={() => handleOpenConsole(caseData)}
                    className="p-4 space-y-3 hover:bg-[#F9FAFB]/70 dark:hover:bg-[#1c1c1c] cursor-pointer transition-colors"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-bold text-[#0B0B0B] dark:text-white">{caseData.caseCode}</span>
                          {caseData.handledByName && (
                            <span
                              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold border shadow-xs ${getAdminTagColor(
                                caseData.handledByName
                              )}`}
                            >
                              <span>👤</span>
                              {caseData.handledByName}
                              {caseData.status === "in_progress" && (
                                <span className="size-1.5 rounded-full bg-current animate-pulse" />
                              )}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-wrap">
                          {(caseData.claimIteration ?? 1) > 1 && (
                            <span className="rounded px-1.5 py-0.2 text-[10px] font-bold bg-purple-100 text-purple-700">
                              เคลม #{caseData.claimIteration}
                            </span>
                          )}
                          {caseData.isDisputed && (
                            <span className="rounded px-1.5 py-0.2 text-[10px] font-bold bg-rose-100 text-rose-700 animate-pulse">
                              โต้แย้ง
                            </span>
                          )}
                          {caseData.verifiedWarrantyStatus === "active" && (
                            <span className="rounded px-1.5 py-0.2 text-[10px] font-medium bg-emerald-100 text-emerald-700">
                              เหลือ {caseData.verifiedRemainingDays ?? "?"} วัน
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge
                          className={
                            caseData.status === "resolved"
                              ? "bg-green-500 text-white text-[10px]"
                              : caseData.status === "in_progress"
                              ? "bg-sky-500 text-white text-[10px]"
                              : "bg-yellow-500 text-white text-[10px]"
                          }
                        >
                          {caseData.status === "resolved"
                            ? "แก้แล้ว"
                            : caseData.status === "in_progress"
                            ? "กำลังแก้"
                            : "ยังไม่แก้"}
                        </Badge>
                      </div>
                    </div>

                    <div className="text-xs space-y-1 text-[#4B5563] dark:text-gray-300">
                      <p><strong>ผู้ส่ง:</strong> {caseData.userName || "ผู้ใช้ทั่วไป"} ({caseData.userEmail || "-"})</p>
                      <p><strong>สินค้า:</strong> {caseData.productName || "-"}</p>
                      <p className="truncate"><strong>Email:</strong> {caseData.accountEmail || "-"} {caseData.caseType === "screen" ? `(จอ ${caseData.screenNumber || "-"})` : ""}</p>
                      {caseData.expirationDate && (
                        <p className="text-emerald-600 dark:text-emerald-400 font-medium">
                          <strong>วันหมดอายุ:</strong> {formatExpirationDate(caseData.expirationDate)}
                        </p>
                      )}
                      {caseData.handledByName && (
                        <p>
                          <strong>ผู้รับเคส:</strong>{" "}
                          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold border ${getAdminTagColor(caseData.handledByName)}`}>
                            👤 {caseData.handledByName}
                          </span>
                        </p>
                      )}
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenConsole(caseData);
                      }}
                      className="w-full h-8 text-xs border-[var(--theme-color)]/50 text-[var(--theme-color)]"
                    >
                      <Eye className="mr-1 size-3.5" />
                      เปิดการ์ดจัดการเคส
                    </Button>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between border-t border-[#E5E7EB] dark:border-white/10 px-4 py-4 sm:px-6">
                  <div className="flex flex-1 justify-between sm:hidden">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => currentPage > 1 && setCurrentPage(currentPage - 1)}
                      disabled={currentPage === 1 || isLoading}
                    >
                      ก่อนหน้า
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => currentPage < totalPages && setCurrentPage(currentPage + 1)}
                      disabled={currentPage === totalPages || isLoading}
                    >
                      ถัดไป
                    </Button>
                  </div>
                  <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                    <p className="text-sm text-[#6B7280] dark:text-gray-400">
                      แสดง <span className="font-medium">{((currentPage - 1) * itemsPerPage + 1).toLocaleString()}</span> ถึง{" "}
                      <span className="font-medium">
                        {Math.min(currentPage * itemsPerPage, total).toLocaleString()}
                      </span>{" "}
                      จาก <span className="font-medium">{total.toLocaleString()}</span> เคส
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => currentPage > 1 && setCurrentPage(currentPage - 1)}
                        disabled={currentPage === 1 || isLoading}
                      >
                        <ChevronLeft className="size-4" />
                      </Button>
                      <span className="text-sm font-semibold px-2">
                        {currentPage} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => currentPage < totalPages && setCurrentPage(currentPage + 1)}
                        disabled={currentPage === totalPages || isLoading}
                      >
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ========================================================================= */}
      {/* FLOATING CARD CONSOLE (POPOVER MODAL) - รวมรายละเอียด + จัดการในแผ่นเดียว */}
      {/* ========================================================================= */}
      <Dialog open={isConsoleOpen} onOpenChange={setIsConsoleOpen}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-0 border border-black/10 dark:border-white/15 shadow-2xl rounded-2xl">
          {selectedCase && (
            <div className="flex flex-col">
              {/* ZONE 1: PROOF & STATUS BANNER (HEADER) */}
              <div className="bg-[#111827] text-white p-5 rounded-t-2xl space-y-3 dark:bg-[#1a1a1e]">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-xl font-mono font-extrabold tracking-tight text-white">
                      {selectedCase.caseCode}
                    </span>
                    <Badge
                      className={
                        selectedCase.status === "resolved"
                          ? "bg-emerald-500 text-white hover:bg-emerald-600"
                          : selectedCase.status === "in_progress"
                          ? "bg-sky-500 text-white hover:bg-sky-600"
                          : "bg-amber-500 text-white hover:bg-amber-600"
                      }
                    >
                      {selectedCase.status === "resolved"
                        ? "✅ แก้ไขสำเร็จแล้ว"
                        : selectedCase.status === "in_progress"
                        ? "⏳ กำลังดำเนินการแก้ไข"
                        : "⏳ รอคิวตรวจสอบ"}
                    </Badge>
                    {selectedCase.handledByName ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${getAdminTagColor(
                          selectedCase.handledByName
                        )}`}
                      >
                        {selectedCase.status === "in_progress" && (
                          <span className="size-1.5 rounded-full bg-current animate-pulse" />
                        )}
                        ผู้รับเคส: {selectedCase.handledByName}
                      </span>
                    ) : (
                      <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full font-medium">
                        ยังไม่มีผู้รับเคส
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">
                    แจ้งเมื่อ: {formatDate(selectedCase.createdAt)}
                  </span>
                </div>

                {/* Sub-Banner: Warranty & Verification Status */}
                <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-gray-800/80 border border-gray-700 text-xs flex-wrap">
                  <div className="flex items-center gap-2">
                    {selectedCase.verifiedWarrantyStatus === "active" ? (
                      <ShieldCheck className="size-4 text-emerald-400 shrink-0" />
                    ) : selectedCase.verifiedWarrantyStatus === "expired" ? (
                      <ShieldAlert className="size-4 text-amber-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="size-4 text-gray-400 shrink-0" />
                    )}
                    <span className="text-gray-200 font-medium">
                      {selectedCase.verifiedWarrantyStatus === "active"
                        ? `🛡️ สิทธิ์คำสั่งซื้อ: ตรงกับระบบ (ประกันคงเหลืออีก ${selectedCase.verifiedRemainingDays ?? "?"} วัน)`
                        : selectedCase.verifiedWarrantyStatus === "expired"
                        ? "⚠️ สิทธิ์คำสั่งซื้อ: สินค้าหมดระยะเวลารับประกันแล้ว"
                        : selectedCase.verifiedWarrantyStatus === "not_found"
                        ? "❌ สิทธิ์คำสั่งซื้อ: ไม่พบประวัติในระบบ (อาจมาจากคนละบัญชี หรือมีการเปลี่ยนเมล)"
                        : "🛡️ ตรวจสอบสิทธิ์คำสั่งซื้อในระบบ"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {(selectedCase.claimIteration ?? 1) > 1 && (
                      <Badge className="bg-purple-600 text-white text-[11px]">
                        🔄 เคลมครั้งที่ {selectedCase.claimIteration}
                      </Badge>
                    )}
                    {selectedCase.isDisputed && (
                      <Badge className="bg-rose-600 text-white text-[11px] animate-pulse">
                        ⚠️ ลูกค้าโต้แย้งข้อมูล
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* ZONE 2: DETAILS & EVIDENCE (BODY) */}
              <div className="p-5 space-y-4 bg-[#F9FAFB] dark:bg-[#121212]">
                {/* Dispute Alert Box (ถ้ามีลูกค้าโต้แย้ง) */}
                {selectedCase.isDisputed && (
                  <div className="rounded-xl border-2 border-rose-400 bg-rose-50 p-4 text-rose-950 dark:bg-rose-950/40 dark:border-rose-700 dark:text-rose-200 shadow-sm">
                    <div className="flex items-center gap-2 pb-1.5 border-b border-rose-200 dark:border-rose-800">
                      <AlertTriangle className="size-4 text-rose-600 shrink-0" />
                      <span className="text-xs font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                        ข้อความโต้แย้งจากลูกค้า (Customer Dispute Reason)
                      </span>
                    </div>
                    <p className="mt-2 text-sm whitespace-pre-wrap font-semibold text-rose-900 dark:text-rose-100">
                      &ldquo;{selectedCase.disputeReason || "ลูกค้าแจ้งโต้แย้งข้อมูล แต่ไม่ได้ระบุข้อความ"}&rdquo;
                    </p>
                  </div>
                )}

                {/* Previous Case History Box (ถ้าเป็นการเคลมต่อเนื่อง / ซ้ำ) */}
                {((selectedCase.claimIteration ?? 1) > 1 || selectedCase.previousCaseId) && (
                  <div className="rounded-xl border-2 border-purple-400 bg-purple-50 p-4 text-purple-950 dark:bg-purple-950/40 dark:border-purple-700 dark:text-purple-200 shadow-sm">
                    <div className="flex items-center justify-between pb-1.5 border-b border-purple-200 dark:border-purple-800">
                      <div className="flex items-center gap-2">
                        <RotateCcw className="size-4 text-purple-600 shrink-0" />
                        <span className="text-xs font-bold uppercase tracking-wider text-purple-800 dark:text-purple-300">
                          ประวัติการเคลมครั้งก่อนหน้า (Previous Claim Reference)
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[10px] border-purple-400 text-purple-800 dark:text-purple-300">
                        อ้างอิง: {selectedCase.previousCaseCode || selectedCase.previousCaseId}
                      </Badge>
                    </div>
                    <div className="mt-2 text-xs space-y-1.5">
                      {selectedCase.previousAdminResponse && (
                        <div>
                          <span className="font-semibold text-purple-900 dark:text-purple-200">วิธีแก้ไขรอบก่อนหน้า: </span>
                          <span className="text-purple-800 dark:text-purple-300 whitespace-pre-wrap">
                            {selectedCase.previousAdminResponse}
                          </span>
                        </div>
                      )}
                      {selectedCase.previousAdminNote && (
                        <div>
                          <span className="font-semibold text-purple-900 dark:text-purple-200">Note แอดมินรอบก่อน: </span>
                          <span className="text-purple-800 dark:text-purple-300 whitespace-pre-wrap">
                            {selectedCase.previousAdminNote}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Customer & Product Info Grid */}
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* กล่องข้อมูลลูกค้า */}
                  <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:bg-[#1c1c1c] dark:border-white/10">
                    <div className="flex items-center justify-between pb-2 mb-3 border-b border-gray-100 dark:border-white/10">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-gray-400 flex items-center gap-1.5">
                        <User className="size-3.5 text-[var(--theme-color)]" />
                        ข้อมูลลูกค้า
                      </span>
                      {selectedCase.user?.userTier && (
                        <Badge variant="outline" className="text-[10px] border-[var(--theme-color)]/50 text-[var(--theme-color)]">
                          Tier: {selectedCase.user.userTier}
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-[#6B7280]">ชื่อ:</span>
                        <span className="font-bold text-[#0B0B0B] dark:text-white">
                          {selectedCase.user?.displayName || selectedCase.userName || "ผู้ใช้ทั่วไป"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#6B7280]">อีเมล:</span>
                        <div className="flex items-center gap-1 font-mono text-[#0B0B0B] dark:text-white">
                          <span>{selectedCase.user?.email || selectedCase.userEmail || "-"}</span>
                          {selectedCase.user?.email && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(selectedCase.user?.email || "", "อีเมลลูกค้า")}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              {copiedField === "อีเมลลูกค้า" ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#6B7280]">User ID:</span>
                        <span className="font-mono text-[11px] text-[#6B7280]">
                          {selectedCase.userId ? `${selectedCase.userId.slice(0, 16)}...` : "ไม่ระบุ"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* กล่องข้อมูลสินค้า & บัญชี */}
                  <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:bg-[#1c1c1c] dark:border-white/10">
                    <div className="flex items-center justify-between pb-2 mb-3 border-b border-gray-100 dark:border-white/10">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-gray-400 flex items-center gap-1.5">
                        <Tv className="size-3.5 text-[var(--theme-color)]" />
                        ข้อมูลสินค้า & บัญชี
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {selectedCase.caseType === "screen" ? `จอ ${selectedCase.screenNumber || "-"}` : "แบบแอค"}
                      </Badge>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-[#6B7280]">สินค้า:</span>
                        <span className="font-bold text-[#0B0B0B] dark:text-white truncate max-w-[180px]">
                          {selectedCase.productName || "-"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#6B7280]">Email สินค้า:</span>
                        <div className="flex items-center gap-1 font-mono text-[#0B0B0B] dark:text-white">
                          <span className="truncate max-w-[160px]">{selectedCase.accountEmail || "-"}</span>
                          {selectedCase.accountEmail && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(selectedCase.accountEmail || "", "อีเมลสินค้า")}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              {copiedField === "อีเมลสินค้า" ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#6B7280]">Password:</span>
                        <div className="flex items-center gap-1 font-mono text-[#0B0B0B] dark:text-white">
                          <span>{selectedCase.accountPassword || "-"}</span>
                          {selectedCase.accountPassword && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(selectedCase.accountPassword || "", "รหัสผ่าน")}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              {copiedField === "รหัสผ่าน" ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#6B7280]">วันหมดอายุ:</span>
                        <span className="text-[#0B0B0B] dark:text-white font-medium">
                          {formatExpirationDate(selectedCase.expirationDate) || "-"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* รายละเอียดปัญหาที่ลูกค้าแจ้ง */}
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:bg-[#1c1c1c] dark:border-white/10">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-gray-400 block mb-2">
                    ปัญหาที่ลูกค้าพบ (Problem Description)
                  </span>
                  <p className="text-sm text-[#0B0B0B] dark:text-white whitespace-pre-wrap leading-relaxed">
                    {selectedCase.problemDescription}
                  </p>
                </div>

                {/* รูปภาพหลักฐานที่ลูกค้าแนบมา (Screenshot Attachments) */}
                {selectedCase.attachments && selectedCase.attachments.length > 0 && (
                  <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:bg-[#1c1c1c] dark:border-white/10">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-gray-400 block mb-2">
                      รูปภาพหลักฐานที่แนบมา ({selectedCase.attachments.length} รูป)
                    </span>
                    <div className="grid grid-cols-3 gap-3">
                      {selectedCase.attachments.map((att, idx) => (
                        <a
                          key={att.id || idx}
                          href={att.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="group relative aspect-video rounded-lg overflow-hidden border border-black/10 dark:border-white/10 bg-black/5"
                        >
                          <img
                            src={att.fileUrl}
                            alt={`หลักฐาน ${idx + 1}`}
                            className="size-full object-cover transition-transform group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-semibold gap-1">
                            <ExternalLink className="size-3.5" />
                            เปิดดูรูป
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* ZONE 3: RESOLUTION & QUICK REPLIES (ADMIN CONTROLS) */}
                <div className="rounded-2xl border-2 border-[var(--theme-color)]/40 bg-[var(--theme-color)]/5 p-4 sm:p-5 space-y-4 dark:bg-[var(--theme-color)]/10">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--theme-color)] flex items-center gap-1.5">
                      <Key className="size-4" />
                      ศูนย์ตอบกลับและจัดการเคส (Resolution Console)
                    </span>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-[#6B7280]">สถานะเคส:</Label>
                      <Select
                        value={updateStatus}
                        onValueChange={(v) => setUpdateStatus(v as SupportCaseStatus)}
                      >
                        <SelectTrigger className="w-[125px] h-7 text-xs bg-white dark:bg-[#202020]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">ยังไม่แก้</SelectItem>
                          <SelectItem value="in_progress">กำลังแก้</SelectItem>
                          <SelectItem value="resolved">แก้แล้ว</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* QUICK REPLY PRESETS */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold text-[#6B7280] dark:text-gray-400 block">
                      ⚡ ข้อความสำเร็จรูป (Quick Reply Presets) คลิกเพื่อวางข้อความ:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleQuickReply("ทางร้านได้ทำการเปลี่ยนรหัสผ่านใหม่ให้เรียบร้อยแล้วนะคะ รหัสผ่านใหม่คือ: ")}
                        className="h-7 text-xs bg-white hover:bg-sky-50 text-sky-700 border-sky-300 dark:bg-transparent dark:text-sky-300"
                      >
                        <Key className="mr-1 size-3" />
                        เปลี่ยนรหัสใหม่
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleQuickReply("ทางร้านได้ทำการจัดสรรจอ/โปรไฟล์ใหม่ให้เรียบร้อยแล้วนะคะ จอใหม่คือ: ")}
                        className="h-7 text-xs bg-white hover:bg-purple-50 text-purple-700 border-purple-300 dark:bg-transparent dark:text-purple-300"
                      >
                        <Tv className="mr-1 size-3" />
                        เคลมจอใหม่
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleQuickReply("ทางร้านได้จัดส่งลิงก์คำเชิญเข้าร่วมใหม่ให้เรียบร้อยแล้วนะคะ: ")}
                        className="h-7 text-xs bg-white hover:bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-transparent dark:text-emerald-300"
                      >
                        <Link2 className="mr-1 size-3" />
                        ส่งลิงก์ใหม่
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleQuickReply("รบกวนลูกค้าแนบภาพหน้าจอหรือแจ้งข้อมูลเพิ่มเติมเข้ามา เพื่อให้ทางทีมงานตรวจสอบให้ค่ะ")}
                        className="h-7 text-xs bg-white hover:bg-amber-50 text-amber-700 border-amber-300 dark:bg-transparent dark:text-amber-300"
                      >
                        <HelpCircle className="mr-1 size-3" />
                        ขอข้อมูลเพิ่ม
                      </Button>
                    </div>
                  </div>

                  {/* Textarea: ข้อความตอบกลับลูกค้า */}
                  <div className="space-y-1.5">
                    <Label htmlFor="adminResponse" className="text-xs font-semibold text-[#0B0B0B] dark:text-white">
                      คำเคลม / ข้อความแจ้งลูกค้า (Customer Response)
                    </Label>
                    <Textarea
                      id="adminResponse"
                      value={adminResponse}
                      onChange={(e) => setAdminResponse(e.target.value)}
                      placeholder="พิมพ์ข้อความสรุปผลการแก้ปัญหา หรือ ข้อมูลสินค้าใหม่เพื่อส่งให้ลูกค้า..."
                      rows={3}
                      className="bg-white text-xs text-[#0B0B0B] dark:bg-[#1a1a1a] dark:text-white resize-none"
                    />
                    <p className="text-[10px] text-[#6B7280] dark:text-gray-400">
                      * ข้อความนี้จะแสดงในหน้าเช็คสถานะและประวัติการเคลมของลูกค้าทันที
                    </p>
                  </div>

                  {/* Textarea: Note ภายในแอดมิน */}
                  <div className="space-y-1.5">
                    <Label htmlFor="adminNote" className="text-xs font-semibold text-[#0B0B0B] dark:text-white">
                      Note ภายในทีมแอดมิน (Internal Note)
                    </Label>
                    <Textarea
                      id="adminNote"
                      value={adminNote}
                      onChange={(e) => setAdminNote(e.target.value)}
                      placeholder="บันทึกช่วยจำสำหรับแอดมิน (ลูกค้าจะไม่เห็นข้อความนี้)..."
                      rows={2}
                      className="bg-white text-xs text-[#0B0B0B] dark:bg-[#1a1a1a] dark:text-white resize-none"
                    />
                  </div>

                  {/* ONE-CLICK ACTION BUTTONS */}
                  <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-[var(--theme-color)]/20">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsConsoleOpen(false)}
                      className="h-9 text-xs flex-1 border-gray-300 dark:border-gray-700"
                    >
                      ปิดหน้าต่าง
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleSaveUpdate("in_progress")}
                      disabled={isPending}
                      className="h-9 text-xs flex-1 border-sky-400 text-sky-700 hover:bg-sky-50 dark:bg-transparent dark:text-sky-300 font-medium"
                    >
                      {isPending ? <Loader2 className="size-3 animate-spin" /> : "⏳ รับเคสกำลังทำ"}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => handleSaveUpdate("resolved")}
                      disabled={isPending}
                      className="h-9 text-xs flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md"
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="mr-1 size-3 animate-spin" />
                          กำลังบันทึก...
                        </>
                      ) : (
                        "✅ แก้ไขสำเร็จ (Resolved)"
                      )}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => handleSaveUpdate()}
                      disabled={isPending}
                      className="h-9 text-xs flex-1 bg-[var(--theme-color)] hover:bg-[var(--theme-color)]/90 text-white font-semibold shadow-md"
                    >
                      {isPending ? <Loader2 className="size-3 animate-spin" /> : "💾 บันทึกทั่วไป"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
