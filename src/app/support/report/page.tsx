"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  History,
  AlertTriangle,
  Mail,
  Link2,
  Lock,
  Upload,
  X,
  ImageIcon,
  ShieldCheck,
  Clock,
  Calendar,
  ExternalLink,
} from "lucide-react";
import { useSession } from "@/lib/auth/use-session";
import { triggerHaptic } from "@/lib/ui/haptics";

interface VerifyResponse {
  ok: boolean;
  matched: boolean;
  hasActiveCase?: boolean;
  activeCase?: {
    id: string;
    caseCode: string;
    status: string;
    createdAt: string;
  };
  order?: {
    id: string;
    productName: string;
    productTypeId?: string;
    purchaseDate?: string;
    createdAt?: string;
  };
  extracted?: {
    email: string | null;
    password: string | null;
    screenNumber: string | null;
    caseType: "screen" | "account";
    inviteLink: string | null;
  };
  warranty?: {
    rawString?: string | null;
    isoDate?: string | null;
    expirationDate: string | null;
    formattedDate: string | null;
    remainingDays: number | null;
    status: "active" | "expiring_today" | "expired" | "unknown";
    displayText: string;
  };
  reclaim?: {
    claimIteration: number;
    isReclaim: boolean;
    previousCaseId: string | null;
    previousCaseCode: string | null;
    previousAdminResponse: string | null;
    previousAdminNote: string | null;
  };
  message?: string;
}

export default function ReportSupportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: isLoadingSession } = useSession();

  // Form Fields (Core Inputs)
  const [identifier, setIdentifier] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [problemDescription, setProblemDescription] = useState("");

  // Attachments (1-3 Screenshots)
  const [attachments, setAttachments] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Verification & Dispute State
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyData, setVerifyData] = useState<VerifyResponse | null>(null);
  const [isDisputed, setIsDisputed] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Debounce ref for verification
  const verifyTimerRef = useRef<number | null>(null);

  // Redirect if not logged in
  useEffect(() => {
    if (!isLoadingSession && !user) {
      router.push("/login?redirect=/support/report");
    }
  }, [user, isLoadingSession, router]);

  // Handle URL search params (?orderId=... or ?identifier=...)
  useEffect(() => {
    const orderIdParam = searchParams.get("orderId");
    const idParam = searchParams.get("identifier") || searchParams.get("email");

    if (orderIdParam) {
      runVerification("", orderIdParam);
    } else if (idParam) {
      setIdentifier(idParam);
      runVerification(idParam, "");
    }
  }, [searchParams]);

  // Real-time verify function
  const runVerification = async (ident: string, orderId?: string) => {
    const cleanIdent = (ident || "").trim();
    if (!cleanIdent && !orderId) {
      setVerifyData(null);
      return;
    }

    setIsVerifying(true);
    try {
      const res = await fetch("/api/support/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: cleanIdent,
          orderId: orderId || undefined,
        }),
      });

      const data: VerifyResponse = await res.json();
      if (res.ok && data.ok) {
        setVerifyData(data);
        // Auto-fill password if available in order and customer hasn't typed one
        if (data.extracted?.password && !accountPassword) {
          setAccountPassword(data.extracted.password);
        }
        // Auto-fill expiration date if available in order
        const detectedExp = data.warranty?.isoDate || data.warranty?.expirationDate;
        if (detectedExp) {
          setExpirationDate(detectedExp);
        } else if (data.warranty?.formattedDate) {
          const parts = data.warranty.formattedDate.split(/[\/\-\.]/);
          if (parts.length === 3 && parts[2].length === 4) {
            setExpirationDate(`${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`);
          }
        }
        // If matched and active warranty, reset dispute mode
        if (data.matched && !data.hasActiveCase && data.warranty?.status === "active") {
          setIsDisputed(false);
        }
      } else {
        setVerifyData({
          ok: false,
          matched: false,
          message: data.message || "ไม่พบข้อมูลการสั่งซื้อ",
        });
      }
    } catch (err) {
      console.error("Verification fetch error:", err);
    } finally {
      setIsVerifying(false);
    }
  };

  // Handle identifier change with debounce
  const handleIdentifierChange = (val: string) => {
    setIdentifier(val);
    if (verifyTimerRef.current) window.clearTimeout(verifyTimerRef.current);

    if (val.trim().length >= 4) {
      verifyTimerRef.current = window.setTimeout(() => {
        runVerification(val);
      }, 500);
    } else {
      setVerifyData(null);
      setExpirationDate("");
    }
  };

  // Handle screenshot upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (attachments.length + files.length > 3) {
      toast.error("สามารถแนบรูปภาพได้สูงสุด 3 รูป");
      return;
    }

    setIsUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 8 * 1024 * 1024) {
          toast.error(`ไฟล์ ${file.name} มีขนาดเกิน 8MB`);
          continue;
        }

        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/support/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (res.ok && data.fileUrl) {
          setAttachments((prev) => [...prev, data.fileUrl]);
          toast.success("อัปโหลดรูปภาพสำเร็จ");
        } else {
          toast.error(data.message || "อัปโหลดรูปภาพไม่สำเร็จ");
        }
      }
    } catch (err) {
      toast.error("เกิดข้อผิดพลาดในการอัปโหลดรูป");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (indexToRemove: number) => {
    setAttachments((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Detect input type
  const isLink =
    identifier.startsWith("http://") ||
    identifier.startsWith("https://") ||
    identifier.includes(".com") ||
    identifier.includes("/");
  const isEmail = identifier.includes("@");

  // Determine warranty status flags
  const isMatched = verifyData?.matched === true;
  const isExpired = verifyData?.warranty?.status === "expired";
  const hasActiveCase = verifyData?.hasActiveCase === true;
  const isNotFound = verifyData !== null && !isMatched;

  // Validation before submit
  const canSubmit =
    Boolean(identifier.trim()) &&
    Boolean(problemDescription.trim()) &&
    !hasActiveCase &&
    !isVerifying &&
    (!isNotFound || isDisputed) &&
    (!isExpired || isDisputed);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!identifier.trim()) {
      triggerHaptic("warning");
      toast.error("กรุณาระบุ Email หรือ ลิงก์สินค้า");
      return;
    }

    if (!problemDescription.trim()) {
      triggerHaptic("warning");
      toast.error("กรุณาระบุปัญหาที่พบ");
      return;
    }

    if (hasActiveCase) {
      triggerHaptic("warning");
      toast.error("สินค้านี้มีเคสที่กำลังดำเนินการอยู่แล้ว");
      return;
    }

    if ((isNotFound || isExpired) && !isDisputed) {
      triggerHaptic("warning");
      toast.warning("กรุณากดปุ่ม 'ต้องการโต้แย้ง' เพื่อระบุรายละเอียดเพิ่มเติมก่อนส่งเคส");
      setIsDisputed(true);
      return;
    }

    if (isDisputed && !disputeReason.trim()) {
      triggerHaptic("warning");
      toast.error("กรุณาระบุเหตุผลในการโต้แย้งข้อมูล");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        orderId: verifyData?.order?.id || null,
        productName: verifyData?.order?.productName || (isLink ? "สินค้าประเภทลิงก์" : "บัญชีผู้ใช้งาน"),
        productTypeId: verifyData?.order?.productTypeId || null,
        accountEmail: isEmail ? identifier.trim() : (verifyData?.extracted?.email || null),
        accountPassword: accountPassword.trim() || verifyData?.extracted?.password || null,
        expirationDate: expirationDate.trim() || verifyData?.warranty?.isoDate || verifyData?.warranty?.expirationDate || verifyData?.warranty?.formattedDate || null,
        caseType: verifyData?.extracted?.caseType || (isLink ? "account" : "screen"),
        screenNumber: verifyData?.extracted?.screenNumber || null,
        problemDescription: problemDescription.trim(),
        claimIteration: verifyData?.reclaim?.claimIteration || 1,
        previousCaseId: verifyData?.reclaim?.previousCaseId || null,
        isDisputed: Boolean(isDisputed),
        disputeReason: isDisputed ? disputeReason.trim() : null,
        verifiedWarrantyStatus: verifyData?.warranty?.status || (isNotFound ? "not_found" : null),
        verifiedRemainingDays: verifyData?.warranty?.remainingDays ?? null,
        attachmentUrls: attachments,
      };

      const res = await fetch("/api/support/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.message || "ไม่สามารถส่งเรื่องแจ้งปัญหาได้");
      }

      triggerHaptic("success");
      toast.success(data.message || "ระบบได้รับข้อมูลแล้ว", {
        description: `รหัสเคส: ${data.case?.caseCode}`,
      });

      // Redirect to check page
      if (data.case?.caseCode) {
        router.push(`/support/check?caseCode=${encodeURIComponent(data.case.caseCode)}`);
      } else {
        router.push("/support/history");
      }
    } catch (err: any) {
      triggerHaptic("error");
      toast.error(err.message || "เกิดข้อผิดพลาดในการส่งเคส");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingSession) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-[var(--theme-color)]" />
      </div>
    );
  }

  return (
    <section className="bg-[var(--theme-color-bg-bottom)] py-8 sm:py-12">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 lg:px-10">
        {/* Header Title */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-[#0B0B0B] dark:text-white sm:text-3xl tracking-tight">
              แจ้งปัญหาการใช้งาน & เคลมสินค้า
            </h1>
            <p className="text-sm text-[#6B7280] dark:text-gray-400 mt-1">
              ระบบตรวจสอบสิทธิ์และประกันอัตโนมัติ กรอกเพียง 3 ช่อง สะดวกและรวดเร็ว
            </p>
          </div>
          <Link href="/support/history">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-[var(--theme-color)]/40 text-[var(--theme-color)] hover:bg-[var(--theme-color)] hover:text-white hover:border-[var(--theme-color)] self-start sm:self-auto"
            >
              <History className="mr-1.5 size-4" />
              ประวัติการแจ้ง
            </Button>
          </Link>
        </div>

        <Card className="border border-black/5 bg-white/95 shadow-xl backdrop-blur dark:bg-[#151515] dark:border-white/10">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-[#0B0B0B] dark:text-white flex items-center gap-2">
              <span>แบบฟอร์มเคลมสินค้า</span>
              <Badge variant="outline" className="text-xs border-[var(--theme-color)]/40 text-[var(--theme-color)]">
                Smart Verification 2.0
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs text-[#6B7280] dark:text-gray-400">
              เพียงระบุอีเมลสินค้าหรือลิงก์ ระบบจะดึงข้อมูลคำสั่งซื้อและตรวจประกันให้อัตโนมัติค่ะ
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* ช่องที่ 1: Email หรือ Link */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="identifier" className="text-sm font-semibold text-[#0B0B0B] dark:text-white flex items-center gap-1.5">
                    {isLink ? (
                      <Link2 className="size-4 text-purple-600" />
                    ) : (
                      <Mail className="size-4 text-blue-600" />
                    )}
                    <span>Email สินค้า หรือ ลิงก์ที่ได้รับ</span>
                    <span className="text-red-500">*</span>
                  </Label>
                  {isVerifying && (
                    <span className="text-xs text-[var(--theme-color)] flex items-center gap-1">
                      <Loader2 className="size-3 animate-spin" />
                      กำลังตรวจสอบประวัติ...
                    </span>
                  )}
                </div>

                <div className="relative">
                  <Input
                    id="identifier"
                    type="text"
                    value={identifier}
                    onChange={(e) => handleIdentifierChange(e.target.value)}
                    placeholder="กรอก Email สินค้า (เช่น som@gmail.com) หรือ ลิงก์คำเชิญ..."
                    className="bg-white text-[#0B0B0B] placeholder:text-[#9CA3AF] caret-[#0B0B0B] dark:bg-[#202020] dark:text-white dark:border-white/10 pr-10"
                    required
                  />
                  {identifier && (
                    <button
                      type="button"
                      onClick={() => {
                        setIdentifier("");
                        setVerifyData(null);
                        setIsDisputed(false);
                        setExpirationDate("");
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-white"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* LIVE PROOF / VERIFICATION CARD */}
              {verifyData && (
                <div className="transition-all duration-300">
                  {/* กรณี 1: มีเคสเดิมกำลังดำเนินอยู่ (Active Case) */}
                  {hasActiveCase && (
                    <div className="rounded-xl border border-sky-300 bg-sky-50 p-4 text-sky-900 shadow-sm dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-200">
                      <div className="flex items-start gap-3">
                        <Clock className="size-5 text-sky-600 shrink-0 mt-0.5 animate-spin" />
                        <div className="space-y-1 text-xs">
                          <p className="font-bold text-sm">สินค้านี้มีเคสที่กำลังดำเนินการอยู่</p>
                          <p>
                            รหัสเคส: <strong className="font-mono">{verifyData.activeCase?.caseCode}</strong> (สถานะ:{" "}
                            {verifyData.activeCase?.status === "in_progress" ? "แอดมินกำลังแก้ไข" : "รอคิวตรวจสอบ"})
                          </p>
                          <p className="text-[#6B7280] dark:text-gray-400">
                            ทีมงานกำลังเร่งช่วยเหลือตามคิว กรุณารอสักครู่หรือตรวจสอบความคืบหน้าที่หน้าติดตามเคส
                          </p>
                          <div className="pt-2">
                            <Link href={`/support/check?caseCode=${verifyData.activeCase?.caseCode}`}>
                              <Button size="sm" variant="outline" className="h-7 text-xs border-sky-400 text-sky-700 bg-white hover:bg-sky-100 dark:bg-transparent dark:text-sky-300">
                                <ExternalLink className="mr-1 size-3" />
                                ดูสถานะเคสเดิม
                              </Button>
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* กรณี 2: ตรวจพบประวัติ & อยู่ในประกัน (Active Warranty) */}
                  {isMatched && !hasActiveCase && !isExpired && (
                    <div className="rounded-xl border border-emerald-300 bg-emerald-50/90 p-4 text-emerald-950 shadow-sm dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-200">
                      <div className="flex items-start justify-between gap-2 pb-2 border-b border-emerald-200/70 dark:border-emerald-800/40">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="size-5 text-emerald-600 shrink-0" />
                          <span className="font-bold text-sm">พบข้อมูลคำสั่งซื้อในระบบ (อยู่ในประกัน)</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {verifyData.reclaim?.isReclaim && (
                            <Badge className="bg-purple-600 text-white text-[10px] px-1.5 py-0.5">
                              🔄 เคลมครั้งที่ {verifyData.reclaim.claimIteration}
                            </Badge>
                          )}
                          <Badge className="bg-emerald-600 text-white text-[10px] px-2 py-0.5">
                            {verifyData.warranty?.remainingDays !== null && verifyData.warranty?.remainingDays !== undefined
                              ? `ประกันเหลืออีก ${verifyData.warranty.remainingDays} วัน`
                              : "อยู่ในประกัน"}
                          </Badge>
                        </div>
                      </div>

                      <div className="grid gap-2.5 sm:grid-cols-2 text-xs pt-3">
                        <div>
                          <span className="text-emerald-800/80 dark:text-emerald-400/80 block">สินค้า:</span>
                          <span className="font-semibold text-emerald-950 dark:text-emerald-100 text-sm">
                            {verifyData.order?.productName || "-"}
                          </span>
                        </div>
                        <div>
                          <span className="text-emerald-800/80 dark:text-emerald-400/80 block">ประเภท / จอ:</span>
                          <span className="font-medium text-emerald-950 dark:text-emerald-100">
                            {verifyData.extracted?.caseType === "screen"
                              ? `แบบจอ ${verifyData.extracted.screenNumber ? `(จอ ${verifyData.extracted.screenNumber})` : ""}`
                              : "แบบบัญชีเต็ม / ลิงก์"}
                          </span>
                        </div>
                        <div>
                          <span className="text-emerald-800/80 dark:text-emerald-400/80 block">วันหมดอายุในระบบ:</span>
                          <span className="font-medium text-emerald-950 dark:text-emerald-100">
                            {verifyData.warranty?.formattedDate || verifyData.warranty?.displayText || "-"}
                          </span>
                        </div>
                        <div>
                          <span className="text-emerald-800/80 dark:text-emerald-400/80 block">เลขออเดอร์อ้างอิง:</span>
                          <span className="font-mono text-emerald-800 dark:text-emerald-300">
                            {verifyData.order?.id?.slice(0, 14)}...
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* กรณี 3: พบข้อมูล แต่หมดประกันแล้ว (Expired) */}
                  {isMatched && !hasActiveCase && isExpired && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-4 text-amber-950 shadow-sm dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-200">
                      <div className="flex items-start justify-between gap-2 pb-2 border-b border-amber-200/70 dark:border-amber-800/40">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="size-5 text-amber-600 shrink-0" />
                          <span className="font-bold text-sm">สินค้านี้หมดระยะเวลารับประกันแล้ว</span>
                        </div>
                        <Badge variant="outline" className="border-amber-500 text-amber-800 text-[10px] px-2 py-0.5">
                          หมดประกันแล้ว
                        </Badge>
                      </div>

                      <div className="text-xs space-y-1 pt-2.5">
                        <p>
                          สินค้า: <strong>{verifyData.order?.productName}</strong>
                        </p>
                        <p>
                          วันหมดอายุตามประวัติ: <strong>{verifyData.warranty?.formattedDate || verifyData.warranty?.displayText || "ไม่ระบุ"}</strong>
                        </p>
                        <p className="text-amber-800/90 dark:text-amber-300/80">
                          หากท่านเพิ่งต่ออายุ หรือข้อมูลวันที่ในระบบไม่ถูกต้อง สามารถกดปุ่มโต้แย้งเพื่อส่งเรื่องให้แอดมินตรวจสอบได้ค่ะ
                        </p>
                      </div>

                      {!isDisputed && (
                        <div className="pt-3">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => setIsDisputed(true)}
                            className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                          >
                            <AlertTriangle className="mr-1.5 size-3.5" />
                            ข้อมูลไม่ถูกต้อง / ต้องการโต้แย้ง
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* กรณี 4: ไม่พบข้อมูลในบัญชี (Not Found) */}
                  {isNotFound && (
                    <div className="rounded-xl border border-rose-300 bg-rose-50/90 p-4 text-rose-950 shadow-sm dark:border-rose-800/40 dark:bg-rose-950/30 dark:text-rose-200">
                      <div className="flex items-start justify-between gap-2 pb-2 border-b border-rose-200/70 dark:border-rose-800/40">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="size-5 text-rose-600 shrink-0" />
                          <span className="font-bold text-sm">ไม่พบประวัติการสั่งซื้อในบัญชีของคุณ</span>
                        </div>
                        <Badge variant="outline" className="border-rose-500 text-rose-700 text-[10px]">
                          ไม่พบในประวัติ
                        </Badge>
                      </div>

                      <p className="text-xs text-rose-900/90 dark:text-rose-300/80 pt-2.5">
                        อีเมลหรือลิงก์นี้ไม่ตรงกับประวัติคำสั่งซื้อของบัญชีที่เข้าสู่ระบบอยู่ขณะนี้ (อาจเป็นสินค้าที่สั่งซื้อจากบัญชีอื่น หรือทางร้านมีการเปลี่ยนอีเมลให้ใหม่)
                      </p>

                      {!isDisputed && (
                        <div className="pt-3">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => setIsDisputed(true)}
                            className="text-xs bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                          >
                            <AlertTriangle className="mr-1.5 size-3.5" />
                            ข้อมูลไม่ถูกต้อง / ต้องการโต้แย้ง
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* DISPUTE SECTION (เมื่อลูกค้ากดปุ่มโต้แย้ง) */}
              {isDisputed && (
                <div className="rounded-xl border-2 border-dashed border-amber-400 bg-amber-50/60 p-4 dark:bg-amber-950/20 dark:border-amber-600/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="size-4 text-amber-600 shrink-0" />
                      <span className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200">
                        ส่วนโต้แย้งข้อมูล (Dispute Ticket)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsDisputed(false)}
                      className="text-xs text-gray-500 hover:text-gray-700 underline dark:text-gray-400"
                    >
                      ยกเลิกโต้แย้ง
                    </button>
                  </div>
                  <Label htmlFor="disputeReason" className="text-xs text-amber-950 dark:text-amber-200 block">
                    โปรดระบุรายละเอียดที่ต้องการโต้แย้ง (เช่น เพิ่งต่ออายุมา, เปลี่ยนเมลใหม่จากแอดมิน, หรือวันที่ในระบบไม่ตรง) <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    id="disputeReason"
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    placeholder="ระบุเหตุผลที่ต้องการให้แอดมินตรวจสอบเป็นกรณีพิเศษ..."
                    rows={2}
                    className="bg-white text-xs text-[#0B0B0B] dark:bg-[#1f1f1f] dark:text-white resize-none"
                    required={isDisputed}
                  />
                  <p className="text-[11px] text-amber-800/80 dark:text-amber-300/70">
                    * เมื่อส่งเคสแบบโต้แย้ง ระบบจะติดป้ายพิเศษเพื่อให้แอดมินเปิดดูและตรวจสอบข้อมูลเชิงลึกให้ท่านค่ะ
                  </p>
                </div>
              )}

              {/* ช่องที่ 2: รหัสผ่าน (ถ้ามี / สินค้าประเภทลิงก์ไม่ต้องกรอก) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-semibold text-[#0B0B0B] dark:text-white flex items-center gap-1.5">
                    <Lock className="size-4 text-gray-500" />
                    <span>รหัสผ่าน (Password)</span>
                  </Label>
                  <span className="text-[11px] text-[#6B7280] dark:text-gray-400">
                    (ถ้ามี / สินค้าแบบลิงก์ไม่ต้องกรอก)
                  </span>
                </div>
                <Input
                  id="password"
                  type="text"
                  value={accountPassword}
                  onChange={(e) => setAccountPassword(e.target.value)}
                  placeholder="รหัสผ่านเข้าสู่ระบบ (ถ้าสินค้ามีรหัสผ่าน)"
                  className="bg-white text-[#0B0B0B] placeholder:text-[#9CA3AF] caret-[#0B0B0B] dark:bg-[#202020] dark:text-white dark:border-white/10"
                />
              </div>

              {/* ช่อง: วันหมดอายุ (Exp Date) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="expirationDate" className="text-sm font-semibold text-[#0B0B0B] dark:text-white flex items-center gap-1.5">
                    <Calendar className="size-4 text-emerald-600" />
                    <span>วันหมดอายุ (Exp Date)</span>
                  </Label>
                  <span className="text-[11px] text-[#6B7280] dark:text-gray-400">
                    {verifyData?.matched ? "(ระบบดึงให้อัตโนมัติจากคำสั่งซื้อ)" : "(ระบุวันหมดอายุของสินค้า)"}
                  </span>
                </div>
                <Input
                  id="expirationDate"
                  type="date"
                  value={expirationDate}
                  onChange={(e) => setExpirationDate(e.target.value)}
                  className="bg-white text-[#0B0B0B] placeholder:text-[#9CA3AF] caret-[#0B0B0B] dark:bg-[#202020] dark:text-white dark:border-white/10"
                />
              </div>

              {/* ช่องที่ 3: ปัญหาที่พบ */}
              <div className="space-y-2">
                <Label htmlFor="problem" className="text-sm font-semibold text-[#0B0B0B] dark:text-white flex items-center gap-1">
                  <span>ปัญหาที่พบ</span>
                  <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="problem"
                  value={problemDescription}
                  onChange={(e) => setProblemDescription(e.target.value)}
                  placeholder="อธิบายปัญหาที่พบโดยละเอียด เช่น เข้าไม่ได้, จอชน, ติดรหัส 4 หลัก, บัญชีถูกปิด..."
                  rows={4}
                  className="bg-white text-[#0B0B0B] placeholder:text-[#9CA3AF] caret-[#0B0B0B] resize-none dark:bg-[#202020] dark:text-white dark:border-white/10"
                  required
                />
              </div>

              {/* แนบรูปภาพหลักฐาน (Attachments: 1-3 รูป) */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-[#6B7280] dark:text-gray-300 flex items-center gap-1.5">
                    <ImageIcon className="size-3.5" />
                    <span>แนบภาพหน้าจอหลักฐาน (สูงสุด 3 รูป)</span>
                  </Label>
                  <span className="text-[11px] text-[#9CA3AF]">
                    {attachments.length}/3 รูป (ไม่เกิน 8MB)
                  </span>
                </div>

                {/* Previews */}
                {attachments.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {attachments.map((url, idx) => (
                      <div key={idx} className="relative size-20 rounded-lg overflow-hidden border border-black/10 dark:border-white/10 group">
                        <img
                          src={url}
                          alt={`หลักฐานที่ ${idx + 1}`}
                          className="size-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeAttachment(idx)}
                          className="absolute top-1 right-1 size-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-90 hover:opacity-100 transition-opacity"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload Button */}
                {attachments.length < 3 && (
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                      id="screenshot-upload"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="text-xs border-dashed border-gray-300 dark:border-gray-700 w-full py-5 hover:bg-gray-50 dark:hover:bg-gray-800/50 text-[#6B7280] dark:text-gray-300"
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin text-[var(--theme-color)]" />
                          กำลังอัปโหลดรูป...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 size-4" />
                          คลิกเพื่อเลือกรูปภาพหลักฐาน (PNG, JPG, WEBP)
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  className="flex-1 border-[var(--theme-color)]/40 text-[var(--theme-color)] hover:bg-[var(--theme-color)]/10"
                >
                  ยกเลิก
                </Button>
                <Button
                  type="submit"
                  disabled={!canSubmit || isSubmitting}
                  className="flex-1 bg-[var(--theme-color)] text-white hover:bg-[var(--theme-color)]/90 shadow-md font-semibold"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      กำลังส่งเคส...
                    </>
                  ) : isDisputed ? (
                    "ยืนยันส่งเรื่อง (แบบโต้แย้ง)"
                  ) : (
                    "ส่งแจ้งปัญหา & เคลม"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
