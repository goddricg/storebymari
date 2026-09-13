"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Archive, Loader2, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import { TOPUP_BONUS_DAILY_LIMIT } from "@/lib/topup/bonus";

type BonusRule = {
  id: string;
  triggerAmount: number;
  bonusPoints: number;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

type RuleForm = {
  triggerAmount: string;
  bonusPoints: string;
  isActive: boolean;
};

const EMPTY_FORM: RuleForm = {
  triggerAmount: "",
  bonusPoints: "",
  isActive: true,
};

function formatNumber(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

async function readError(response: Response) {
  const body = await response.json().catch(() => null) as { message?: string } | null;
  return body?.message || "ไม่สามารถบันทึกกติกาโบนัสเติมเงินได้";
}

export default function TopupBonusRulesTable() {
  const [rules, setRules] = useState<BonusRule[]>([]);
  const [form, setForm] = useState<RuleForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/topup-bonus", {
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) throw new Error(await readError(response));
      const body = await response.json() as { rules?: BonusRule[] };
      setRules(body.rules ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ไม่สามารถโหลดกติกาโบนัสได้");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const editRule = (rule: BonusRule) => {
    setEditingId(rule.id);
    setForm({
      triggerAmount: String(rule.triggerAmount),
      bonusPoints: String(rule.bonusPoints),
      isActive: rule.isActive,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const triggerAmount = Number(form.triggerAmount);
    const bonusPoints = Number(form.bonusPoints);
    if (!Number.isFinite(triggerAmount) || triggerAmount <= 0) {
      toast.error("กรุณาระบุยอดเติมเงินให้ถูกต้อง");
      return;
    }
    if (!Number.isFinite(bonusPoints) || bonusPoints < 0) {
      toast.error("กรุณาระบุโบนัสให้ถูกต้อง");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/topup-bonus", {
        method: editingId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : {}),
          triggerAmount,
          bonusPoints,
          isActive: form.isActive,
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      toast.success(editingId ? "แก้ไขกติกาโบนัสแล้ว" : "เพิ่มกติกาโบนัสแล้ว");
      resetForm();
      await loadRules();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ไม่สามารถบันทึกกติกาโบนัสได้");
    } finally {
      setIsSaving(false);
    }
  };

  const archiveRule = async (rule: BonusRule) => {
    if (!window.confirm(`ปิดใช้งานโบนัสสำหรับยอด ${formatNumber(rule.triggerAmount)} บาทใช่หรือไม่?`)) {
      return;
    }
    try {
      const response = await fetch(`/api/admin/topup-bonus?id=${encodeURIComponent(rule.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error(await readError(response));
      toast.success("ปิดใช้งานกติกาโบนัสแล้ว");
      if (editingId === rule.id) resetForm();
      await loadRules();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ไม่สามารถปิดใช้งานกติกาได้");
    }
  };

  const deleteRule = async (rule: BonusRule) => {
    const warning = rule.isActive
      ? "กติกานี้กำลังเปิดใช้งานและจะหยุดมีผลทันที"
      : "กติกานี้ถูกปิดใช้งานอยู่แล้ว";
    if (!window.confirm(`ลบกติกาโบนัสยอด ${formatNumber(rule.triggerAmount)} บาทแบบถาวรใช่หรือไม่?\n${warning}\nประวัติการเติมเงินเดิมจะไม่ถูกลบ`)) {
      return;
    }

    setDeletingId(rule.id);
    try {
      const response = await fetch(`/api/admin/topup-bonus?id=${encodeURIComponent(rule.id)}&permanent=true`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error(await readError(response));
      toast.success("ลบกติกาโบนัสถาวรแล้ว");
      if (editingId === rule.id) resetForm();
      await loadRules();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ไม่สามารถลบกติกาได้");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="border border-[#F1D5C2] bg-[#FFFDFB] shadow-none">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base text-[#0B0B0B]">
                <Plus className="size-4 text-[var(--theme-color)]" />
                {editingId ? "แก้ไขกติกาโบนัส" : "เพิ่มกติกาโบนัส"}
              </CardTitle>
              <p className="mt-1 text-xs text-[#6B7280]">
                ระบบใช้กติกาแบบยอดตรงตัวอย่างละ 1 กติกา และลูกค้า 1 บัญชีรับโบนัสของแต่ละโปรโมชั่นได้ไม่เกิน {TOPUP_BONUS_DAILY_LIMIT} ครั้งต่อวัน (เวลาไทย)
              </p>
            </div>
            {editingId ? (
              <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                <X className="size-4" /> ยกเลิกการแก้ไข
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end" onSubmit={saveRule}>
            <div className="space-y-2">
              <Label htmlFor="bonus-trigger-amount">ยอดเติมเงิน (บาท)</Label>
              <Input
                id="bonus-trigger-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={form.triggerAmount}
                onChange={(event) => setForm((current) => ({ ...current, triggerAmount: event.target.value }))}
                placeholder="เช่น 500"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bonus-points">โบนัสที่เพิ่ม (พ้อยท์)</Label>
              <Input
                id="bonus-points"
                type="number"
                min="0"
                step="0.01"
                value={form.bonusPoints}
                onChange={(event) => setForm((current) => ({ ...current, bonusPoints: event.target.value }))}
                placeholder="เช่น 10"
                required
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 md:justify-end">
              <label className="flex h-9 items-center gap-2 text-sm text-[#374151]">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                  className="size-4 accent-[var(--theme-color)]"
                />
                เปิดใช้งาน
              </label>
              <Button type="submit" disabled={isSaving} className="bg-[var(--theme-color)] hover:bg-[var(--theme-color)]">
                {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                {editingId ? "บันทึกการแก้ไข" : "เพิ่มกติกา"}
              </Button>
            </div>
          </form>
          {form.triggerAmount && form.bonusPoints ? (
            <p className="mt-4 rounded-lg bg-[#FFF3E8] px-3 py-2 text-xs text-[#8A4B25]">
              ตัวอย่างผลลัพธ์: เติม {formatNumber(Number(form.triggerAmount))} บาท รับโบนัส {formatNumber(Number(form.bonusPoints))} พ้อยท์ รวม {formatNumber(Number(form.triggerAmount) + Number(form.bonusPoints))} พ้อยท์
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border border-[#E5E7EB] bg-white shadow-none">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base text-[#0B0B0B]">กติกาโบนัสที่ตั้งไว้</CardTitle>
            <p className="mt-1 text-xs text-[#6B7280]">แก้ไข ปิดใช้งาน หรือลบกติกาได้ โดยประวัติการเติมเงินเดิมจะไม่เปลี่ยนแปลง</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadRules()} disabled={isLoading}>
            <RefreshCw className={isLoading ? "size-4 animate-spin" : "size-4"} /> รีเฟรช
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex min-h-28 items-center justify-center text-sm text-[#6B7280]">
              <Loader2 className="mr-2 size-4 animate-spin" /> กำลังโหลดกติกา
            </div>
          ) : rules.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#D1D5DB] px-4 py-8 text-center text-sm text-[#6B7280]">
              ยังไม่มีกติกาโบนัส ระบบจะเติมพ้อยท์ตามยอดเงินปกติ
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ยอดเติมเงิน</TableHead>
                    <TableHead>โบนัส</TableHead>
                    <TableHead>พ้อยท์รวม</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium">{formatNumber(rule.triggerAmount)} บาท</TableCell>
                      <TableCell className="text-[#B45309]">+{formatNumber(rule.bonusPoints)} พ้อยท์</TableCell>
                      <TableCell>{formatNumber(rule.triggerAmount + rule.bonusPoints)} พ้อยท์</TableCell>
                      <TableCell>
                        <Badge className={rule.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}>
                          {rule.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => editRule(rule)}>
                            <Pencil className="size-3.5" /> แก้ไข
                          </Button>
                          {rule.isActive ? (
                            <Button variant="ghost" size="sm" onClick={() => void archiveRule(rule)} className="text-red-600 hover:text-red-700">
                              <Archive className="size-3.5" /> ปิด
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void deleteRule(rule)}
                            disabled={deletingId === rule.id}
                            className="text-red-700 hover:text-red-800"
                          >
                            {deletingId === rule.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                            ลบ
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
