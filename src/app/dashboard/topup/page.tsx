"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, X, Wallet, CreditCard, Smartphone, CheckCircle2, Copy, Check, Building2, FileText, History } from "lucide-react";
import { useSession } from "@/lib/auth/use-session";
import { TOPUP_BONUS_DAILY_LIMIT } from "@/lib/topup/bonus";

type VerifySlipResponse = {
  success: boolean;
  data?: {
    message: string;
    pointsAdded: number;
    currentPoints: number;
    transactionAmount: number;
    topupAmount: number;
    bonusPoints: number;
    creditedPoints: number;
    topupReceiptId?: string;
    topupReceiptNo?: string;
    minimumAmount: number;
    bonusUsageCount?: number;
    bonusDailyLimit?: number;
    bonusLimitReached?: boolean;
  };
  error?: string;
};

type PaymentMethod = "bank-transfer" | "promptpay" | "truewallet" | "credit-card";

type TopupBonusRule = {
  id: string;
  triggerAmount: number;
  bonusPoints: number;
  creditedPoints: number;
};

export default function TopupPage() {
  const router = useRouter();
  const { user, isLoading: isLoadingSession, refreshSession } = useSession();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [topupRequestKey, setTopupRequestKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeMethod, setActiveMethod] = useState<PaymentMethod>("bank-transfer");
  const [bankAccount, setBankAccount] = useState<{
    number: string | null;
    name: string | null;
    bank: string | null;
  }>({ number: null, name: null, bank: null });
  const [minimumAmount, setMinimumAmount] = useState(49);
  const [bonusRules, setBonusRules] = useState<TopupBonusRule[]>([]);
  const [lastTopupReceipt, setLastTopupReceipt] = useState<{
    id: string;
    receiptNo: string;
  } | null>(null);

  const currentPoints = user?.points ?? null;

  // CopyButton component สำหรับคัดลอกเลขบัญชี
  function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success("คัดลอกเลขบัญชีเรียบร้อย");
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        console.error('Failed to copy:', error);
        toast.error("ไม่สามารถคัดลอกได้");
      }
    };

    return (
      <button
        onClick={handleCopy}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--theme-color)]/40 bg-white px-2.5 sm:px-3 py-1.5 text-xs font-medium text-[var(--theme-color)] transition-colors hover:bg-[var(--theme-color)]/10 hover:border-[var(--theme-color)] active:bg-[var(--theme-color)]/20 flex-shrink-0"
        type="button"
      >
        {copied ? (
          <>
            <Check className="size-3.5" />
            <span>คัดลอกแล้ว</span>
          </>
        ) : (
          <>
            <Copy className="size-3.5" />
            <span className="hidden sm:inline">คัดลอก</span>
          </>
        )}
      </button>
    );
  }

  useEffect(() => {
    if (!isLoadingSession && !user) {
          router.push("/login");
    }
  }, [isLoadingSession, user, router]);

  useEffect(() => {
    const loadPublicSettings = async () => {
      try {
        const res = await fetch("/api/settings/public");
        if (res.ok) {
          const data = (await res.json()) as {
            bankAccount: { number: string | null; name: string | null; bank: string | null };
            minimumAmount: number;
          };
          setBankAccount(data.bankAccount);
          setMinimumAmount(data.minimumAmount);
        }
      } catch (error) {
        console.error("Failed to load public settings:", error);
      }
    };
    loadPublicSettings();
  }, []);

  useEffect(() => {
    const loadBonusRules = async () => {
      try {
        const response = await fetch("/api/topup/bonus-rules", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { rules?: TopupBonusRule[] };
        setBonusRules(data.rules ?? []);
      } catch (error) {
        console.error("Failed to load top-up bonus rules:", error);
      }
    };
    void loadBonusRules();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast.error("กรุณาเลือกรูปภาพเท่านั้น");
        return;
      }
      setSelectedFile(file);
      setTopupRequestKey(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setTopupRequestKey(null);
    // Reset file input
    const fileInput = document.getElementById("slipImage") as HTMLInputElement;
    if (fileInput) {
      fileInput.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      toast.error("กรุณาเลือกรูปสลิปโอนเงิน");
      return;
    }
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append("slip", selectedFile);
      const requestKey = topupRequestKey ?? globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
      if (!topupRequestKey) setTopupRequestKey(requestKey);

      const response = await fetch("/api/verify-slip", {
        method: "POST",
        credentials: "include",
        headers: { "Idempotency-Key": requestKey },
        body: formData,
      });
      const result: VerifySlipResponse = await response.json();
      if (!result.success) {
        throw new Error(result.error || "เกิดข้อผิดพลาด");
      }
      if (result.data) {
        clearFile();
        if (result.data.topupReceiptId && result.data.topupReceiptNo) {
          setLastTopupReceipt({
            id: result.data.topupReceiptId,
            receiptNo: result.data.topupReceiptNo,
          });
        }
        await refreshSession(); // Refresh session เพื่ออัปเดต points
        const bonusDescription = result.data.bonusPoints > 0
          ? `โบนัส ${result.data.bonusPoints.toLocaleString("th-TH")} พ้อยท์`
          : result.data.bonusLimitReached
            ? `โปรโมชั่นนี้ใช้สิทธิ์ครบ ${TOPUP_BONUS_DAILY_LIMIT} ครั้งวันนี้แล้ว`
            : "";
        const usageDescription = result.data.bonusUsageCount !== undefined
          ? `สิทธิ์โปรโมชั่น ${result.data.bonusUsageCount}/${result.data.bonusDailyLimit ?? TOPUP_BONUS_DAILY_LIMIT} ครั้งวันนี้`
          : "";
        toast.success(result.data.message, {
          description: [
            bonusDescription,
            usageDescription,
            `พ้อยท์ปัจจุบัน: ${result.data.currentPoints.toLocaleString("th-TH", { minimumFractionDigits: 2 })} พ้อยท์`,
          ].filter(Boolean).join(" • "),
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoadingSession) {
    return (
      <section className="min-h-screen bg-[var(--theme-color-bg-bottom)] py-12">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-center px-4">
          <Loader2 className="size-6 animate-spin text-[var(--theme-color)]" />
        </div>
      </section>
    );
  }

  const paymentMethods = [
    {
      id: "bank-transfer" as PaymentMethod,
      name: "โอนเงิน",
      icon: Wallet,
      description: "โอนเงินเข้าบัญชีธนาคาร",
      available: true,
    },
    {
      id: "promptpay" as PaymentMethod,
      name: "พร้อมเพย์",
      icon: Smartphone,
      description: "สแกน QR Code",
      available: false,
      comingSoon: true,
    },
    {
      id: "truewallet" as PaymentMethod,
      name: "ทรูวอลเล็ต",
      icon: CreditCard,
      description: "เติมผ่านทรูวอลเล็ต",
      available: false,
      comingSoon: true,
    },
    {
      id: "credit-card" as PaymentMethod,
      name: "บัตรเครดิต",
      icon: CreditCard,
      description: "ชำระด้วยบัตร",
      available: false,
      comingSoon: true,
    },
  ];

  return (
    <section className="min-h-screen bg-[var(--theme-color-bg-bottom)] py-6 sm:py-8">
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[#0B0B0B] sm:text-2xl">เติมพ้อยท์</h1>
            <p className="mt-1 text-sm text-[#6B7280]">ยอดพ้อยท์ปัจจุบัน: {currentPoints != null ? currentPoints.toLocaleString("th-TH", { minimumFractionDigits: 2 }) : "0.00"} พ้อยท์</p>
          </div>
          <Button asChild variant="outline" className="border-[#E5E7EB] bg-white text-[#374151]">
            <Link href="/dashboard/topup/history">
              <History className="mr-2 size-4" />
              ประวัติใบเสร็จเติมพ้อยท์
            </Link>
          </Button>
        </div>

        {lastTopupReceipt ? (
          <Card className="mb-6 border border-emerald-200 bg-emerald-50/70">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-emerald-100 p-2 text-emerald-700">
                  <FileText className="size-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-emerald-900">ออกใบเสร็จเติมพ้อยท์แล้ว</p>
                  <p className="mt-0.5 text-xs text-emerald-800">Receipt No.: {lastTopupReceipt.receiptNo}</p>
                </div>
              </div>
              <Button asChild size="sm" className="bg-emerald-700 text-white hover:bg-emerald-800">
                <Link href={`/dashboard/topup/receipts/${lastTopupReceipt.id}`} target="_blank" rel="noreferrer">
                  ดู / พิมพ์ใบเสร็จ
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {/* Payment Methods */}
        <Tabs value={activeMethod} onValueChange={(v) => setActiveMethod(v as PaymentMethod)}>
          {/* Mobile: Dropdown Select */}
          <div className="mb-4 sm:hidden">
            <Select value={activeMethod} onValueChange={(v) => setActiveMethod(v as PaymentMethod)}>
              <SelectTrigger className="w-full bg-white border-[#E5E7EB] h-11">
                <SelectValue placeholder="เลือกช่องทางชำระเงิน">
                  {(() => {
                    const method = paymentMethods.find((m) => m.id === activeMethod);
                    if (!method) return "เลือกช่องทางชำระเงิน";
                    return method.name;
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {paymentMethods.map((method) => {
                  const Icon = method.icon;
                  return (
                    <SelectItem
                      key={method.id}
                      value={method.id}
                      disabled={!method.available}
                      className={method.comingSoon ? "opacity-60" : ""}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="size-4" />
                        <span>{method.name}</span>
                        {method.comingSoon && <Badge className="ml-1 h-4 px-1 text-[10px]">เร็วๆ นี้</Badge>}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Desktop: Tabs */}
          <TabsList className="hidden sm:grid mb-6 w-full grid-cols-4 bg-[#F9FAFB] gap-0">
            {paymentMethods.map((method) => {
              const Icon = method.icon;
              return (
                <TabsTrigger
                  key={method.id}
                  value={method.id}
                  disabled={!method.available}
                  className="relative text-xs data-[state=active]:bg-white disabled:opacity-40 flex flex-row items-center gap-1.5 py-1.5"
                >
                  <Icon className="size-3.5" />
                  <span>{method.name}</span>
                  {method.comingSoon && (
                    <Badge className="absolute -right-0.5 -top-0.5 h-3 px-1 text-[9px]">เร็วๆ นี้</Badge>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* Bank Transfer */}
          <TabsContent value="bank-transfer" className="space-y-4 mt-0 sm:mt-0">
            <Card className="border border-[#E5E7EB]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">อัปโหลดสลิปโอนเงิน</CardTitle>
                <CardDescription className="text-xs">ถ่ายรูปสลิปที่มี QR Code ชัดเจน</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={handleSubmit} className="space-y-4">
                  {!selectedFile ? (
                    <div className="relative">
                      <input
                        type="file"
                        id="slipImage"
                        accept="image/*"
                        onChange={handleFileSelect}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        disabled={isLoading}
                      />
                      <div className="flex min-h-[180px] flex-col items-center justify-center rounded-lg border border-dashed border-[#D1D5DB] bg-[#FAFAFA] transition-colors hover:border-[var(--theme-color)] hover:bg-[#FEF2F2]">
                        <Upload className="mb-2 size-8 text-[#9CA3AF]" />
                        <p className="text-sm font-medium text-[#374151]">คลิกเพื่อเลือกรูปภาพ</p>
                        <p className="mt-0.5 text-xs text-[#6B7280]">หรือลากและวาง</p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-[#E5E7EB] bg-[#FAFAFA] p-3 sm:p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                          <div className="flex size-8 sm:size-10 items-center justify-center rounded-lg bg-[var(--theme-color)]/10 flex-shrink-0">
                            <Upload className="size-4 sm:size-5 text-[var(--theme-color)]" />
                          </div>
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <p className="text-xs sm:text-sm font-medium text-[#0B0B0B] truncate">{selectedFile.name}</p>
                            <p className="text-[10px] sm:text-xs text-[#6B7280]">
                              {(selectedFile.size / 1024).toFixed(2)} KB
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={clearFile}
                          disabled={isLoading}
                          className="rounded-full bg-[var(--theme-color)] p-1.5 sm:p-2 text-white hover:bg-[var(--theme-color)] disabled:opacity-50 transition-colors flex-shrink-0"
                          aria-label="ลบไฟล์"
                        >
                          <X className="size-3.5 sm:size-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={isLoading || !selectedFile}
                    className="w-full bg-[var(--theme-color)] hover:bg-[var(--theme-color)]"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 size-3.5 animate-spin" />
                        กำลังตรวจสอบ
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="mr-2 size-3.5" />
                        ตรวจสอบสลิป
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Bank Account Info - Prominent Display */}
            <Card className="border-2 border-[var(--theme-color)] bg-gradient-to-br from-[#fff4ed] to-[#FEF2F2] shadow-lg">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Building2 className="size-5 text-[var(--theme-color)]" />
                  <CardTitle className="text-base sm:text-lg text-[#0B0B0B]">ข้อมูลบัญชีสำหรับโอนเงิน</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {bankAccount.number && bankAccount.name && bankAccount.bank ? (
                  <>
                    {/* Account Number - Most Prominent */}
                    <div className="rounded-lg bg-white border-2 border-[var(--theme-color)]/30 p-4 sm:p-5">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <Label className="text-xs sm:text-sm font-medium text-[#6B7280]">เลขบัญชี</Label>
                        <CopyButton text={bankAccount.number} />
                      </div>
                      <p className="text-xl sm:text-2xl font-bold text-[#0B0B0B] tracking-wider break-all">
                        {bankAccount.number}
                      </p>
                    </div>

                    {/* Account Details Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div className="rounded-lg bg-white border border-[#E5E7EB] p-3 sm:p-4">
                        <Label className="text-xs font-medium text-[#6B7280] block mb-1.5">ชื่อบัญชี</Label>
                        <p className="text-sm sm:text-base font-semibold text-[#0B0B0B] break-words">
                          {bankAccount.name}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white border border-[#E5E7EB] p-3 sm:p-4">
                        <Label className="text-xs font-medium text-[#6B7280] block mb-1.5">ธนาคาร</Label>
                        <p className="text-sm sm:text-base font-semibold text-[#0B0B0B] break-words">
                          {bankAccount.bank}
                        </p>
                      </div>
                    </div>

                    {/* Rate Info */}
                    <div className="rounded-lg bg-[var(--theme-color)]/10 border border-[var(--theme-color)]/30 p-3 sm:p-4">
                      <div className="flex items-center gap-2">
                        <Wallet className="size-4 sm:size-5 text-[var(--theme-color)]" />
                        <p className="text-xs sm:text-sm text-[#0B0B0B]">
                          <span className="font-semibold">1 บาท = 1 พ้อยท์</span>{" "}
                          <span className="text-[#6B7280]">(ขั้นต่ำ {minimumAmount.toLocaleString()} บาท)</span>
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg bg-[#FEF3C7] border border-[#FBBF24] p-4 text-center">
                    <p className="text-sm text-[#92400E]">
                      กำลังโหลดข้อมูลบัญชี... หากไม่แสดงกรุณาติดต่อทีมงาน
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {bonusRules.length > 0 ? (
              <Card className="border border-[#F1D5C2] bg-[#FFFDFB]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg text-[#0B0B0B]">โบนัสเติมเงิน</CardTitle>
                  <CardDescription className="text-xs">
                    เติมให้ตรงตามยอดที่กำหนด รับโบนัสของแต่ละโปรโมชั่นได้ไม่เกิน {TOPUP_BONUS_DAILY_LIMIT} ครั้งต่อวัน รีเซตเวลา 00:00 น. (เวลาไทย)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {bonusRules.map((rule) => (
                      <div key={rule.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#F3D8C7] bg-white px-3 py-2.5 text-sm">
                        <span className="font-medium text-[#374151]">เติม {rule.triggerAmount.toLocaleString("th-TH")} บาท</span>
                        <span className="text-right text-[#B45309]">+{rule.bonusPoints.toLocaleString("th-TH")} โบนัส<br /><span className="text-xs text-[#6B7280]">รวม {rule.creditedPoints.toLocaleString("th-TH")} พ้อยท์ · สูงสุด {TOPUP_BONUS_DAILY_LIMIT} ครั้ง/วัน</span></span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {/* Instructions */}
            <Card className="border border-[#E5E7EB] bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm sm:text-base">วิธีเติมเงิน</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2.5 text-xs sm:text-sm text-[#6B7280] list-decimal list-inside">
                  <li className="pl-2">โอนเงินเข้าบัญชีธนาคารตามข้อมูลด้านบน</li>
                  <li className="pl-2">ถ่ายรูปสลิปโอนเงินให้เห็น QR Code ชัดเจน</li>
                  <li className="pl-2">อัปโหลดรูปสลิปในช่องด้านบน</li>
                  <li className="pl-2">รอระบบตรวจสอบและเติมพ้อยท์ให้อัตโนมัติ (ภายใน 5-10 นาที)</li>
                </ol>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Coming Soon */}
          {paymentMethods
            .filter((m) => !m.available)
            .map((method) => (
              <TabsContent key={method.id} value={method.id}>
                <Card className="border border-[#E5E7EB]">
                  <CardContent className="flex min-h-[200px] flex-col items-center justify-center py-8 text-center">
                    <method.icon className="mb-3 size-10 text-[#D1D5DB]" />
                    <p className="mb-1 text-sm font-medium text-[#374151]">{method.name}</p>
                    <p className="text-xs text-[#6B7280]">{method.description}</p>
                    <Badge className="mt-3 bg-[#F3F4F6] text-[#6B7280]">เร็วๆ นี้</Badge>
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
        </Tabs>
      </div>
    </section>
  );
}
