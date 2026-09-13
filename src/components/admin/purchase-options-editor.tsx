"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, PackagePlus, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type PurchaseOptionRow = {
  id?: string;
  name: string;
  quantity: string;
  price: string;
  priceVip: string;
  priceWalkin: string;
  displayOrder: number;
  isActive: boolean;
};

type PurchaseOptionsEditorProps = {
  typeId: string;
  disabled?: boolean;
};

function emptyRow(displayOrder: number): PurchaseOptionRow {
  return {
    name: "",
    quantity: "2",
    price: "",
    priceVip: "",
    priceWalkin: "",
    displayOrder,
    isActive: true,
  };
}

function toEditorRow(option: Record<string, unknown>, index: number): PurchaseOptionRow {
  return {
    id: typeof option.id === "string" ? option.id : undefined,
    name: typeof option.name === "string" ? option.name : "",
    quantity: String(option.quantity ?? 2),
    price: String(option.price ?? ""),
    priceVip: option.priceVip == null ? "" : String(option.priceVip),
    priceWalkin: option.priceWalkin == null ? "" : String(option.priceWalkin),
    displayOrder: Number(option.displayOrder ?? index),
    isActive: option.isActive !== false,
  };
}

export function PurchaseOptionsEditor({
  typeId,
  disabled = false,
}: PurchaseOptionsEditorProps) {
  const [rows, setRows] = useState<PurchaseOptionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingRowId, setDeletingRowId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetch(`/api/admin/products/options?typeId=${encodeURIComponent(typeId)}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
      if (!response.ok) throw new Error("โหลดตัวเลือกการซื้อไม่สำเร็จ");
        return (await response.json()) as { options?: Record<string, unknown>[] };
      })
      .then((data) => {
        if (cancelled) return;
        setRows((data.options ?? []).map(toEditorRow));
      })
      .catch(() => {
      if (!cancelled) toast.error("โหลดตัวเลือกการซื้อไม่สำเร็จ");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [typeId]);

  const activeCount = useMemo(() => rows.filter((row) => row.isActive).length, [rows]);

  const updateRow = (index: number, patch: Partial<PurchaseOptionRow>) => {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row))
    );
  };

  const removeRow = async (index: number) => {
    const row = rows[index];
    if (!row || isSaving || deletingRowId) return;

    if (!row.id) {
      setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
      return;
    }

    setDeletingRowId(row.id);
    try {
      const response = await fetch("/api/admin/products/options", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typeId, id: row.id }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(data.message || "ลบตัวเลือกการซื้อไม่สำเร็จ");

      setRows((current) => current.filter((currentRow) => currentRow.id !== row.id));
      toast.success("ลบตัวเลือกการซื้อแล้ว");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ลบตัวเลือกการซื้อไม่สำเร็จ");
    } finally {
      setDeletingRowId(null);
    }
  };

  const save = async () => {
    const seenQuantities = new Set<number>();
    const options = [];

    for (const [index, row] of rows.entries()) {
      const quantity = Number(row.quantity);
      const price = Number(row.price);
      const priceVip = row.priceVip.trim() === "" ? null : Number(row.priceVip);
      const priceWalkin = row.priceWalkin.trim() === "" ? null : Number(row.priceWalkin);

      if (!row.name.trim() || !Number.isInteger(quantity) || quantity < 2 || quantity > 100) {
        toast.error(`ตัวเลือกที่ ${index + 1}: กรุณาระบุชื่อและจำนวน 2-100 บัญชี`);
        return;
      }
      if (!Number.isFinite(price) || price < 0) {
        toast.error(`ตัวเลือกที่ ${index + 1}: ราคาต้องเป็น 0 หรือมากกว่า`);
        return;
      }
      if (priceVip !== null && (!Number.isFinite(priceVip) || priceVip < 0)) {
        toast.error(`ตัวเลือกที่ ${index + 1}: ราคา VIP ไม่ถูกต้อง`);
        return;
      }
      if (priceWalkin !== null && (!Number.isFinite(priceWalkin) || priceWalkin < 0)) {
        toast.error(`ตัวเลือกที่ ${index + 1}: ราคาลูกค้าทั่วไปไม่ถูกต้อง`);
        return;
      }
      if (seenQuantities.has(quantity)) {
        toast.error("ตัวเลือกแต่ละรายการต้องใช้จำนวนบัญชีไม่ซ้ำกัน");
        return;
      }
      seenQuantities.add(quantity);
      options.push({
        ...(row.id ? { id: row.id } : {}),
        name: row.name.trim(),
        quantity,
        price,
        priceVip,
        priceWalkin,
        displayOrder: index,
        isActive: row.isActive,
      });
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/products/options", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typeId, options }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        options?: Record<string, unknown>[];
      };
      if (!response.ok) throw new Error(data.message || "บันทึกตัวเลือกการซื้อไม่สำเร็จ");
      setRows((data.options ?? []).map(toEditorRow));
      toast.success("บันทึกตัวเลือกการซื้อแล้ว");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "บันทึกตัวเลือกการซื้อไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-[var(--theme-color)]/25 bg-[var(--theme-color)]/[0.04] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <PackagePlus className="mt-0.5 size-4 text-[var(--theme-color)]" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-semibold text-[#0B0B0B]">ตัวเลือกซื้อแบบชุด</h3>
            <p className="mt-1 text-xs leading-relaxed text-[#6B7280]">
              ตัวเลือกแต่ละรายการจะหักสต็อกตามจำนวนบัญชีที่กำหนดจากสินค้านี้ หากไม่เพิ่มรายการ ระบบจะซื้อแบบบัญชีเดี่ยวตามปกติ
            </p>
          </div>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-[#6B7280]">
          เปิดใช้งาน {activeCount} รายการ
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-[#6B7280]">
          <Loader2 className="size-3.5 animate-spin" /> กำลังโหลดตัวเลือก...
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={row.id ?? `new-${index}`} className="rounded-lg border border-white bg-white p-3 shadow-sm">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_90px_110px_auto]">
                <div className="space-y-1">
                  <Label htmlFor={`purchase-option-name-${index}`} className="text-[11px]">ชื่อตัวเลือก</Label>
                  <Input
                    id={`purchase-option-name-${index}`}
                    value={row.name}
                    onChange={(event) => updateRow(index, { name: event.target.value })}
                    placeholder="ซื้อ 3 บัญชี"
                    disabled={disabled || isSaving}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`purchase-option-quantity-${index}`} className="text-[11px]">จำนวนบัญชี</Label>
                  <Input
                    id={`purchase-option-quantity-${index}`}
                    type="number"
                    min={2}
                    max={100}
                    value={row.quantity}
                    onChange={(event) => updateRow(index, { quantity: event.target.value })}
                    disabled={disabled || isSaving}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`purchase-option-price-${index}`} className="text-[11px]">ราคาปกติ</Label>
                  <Input
                    id={`purchase-option-price-${index}`}
                    type="number"
                    min={0}
                    step="0.01"
                    value={row.price}
                    onChange={(event) => updateRow(index, { price: event.target.value })}
                    placeholder="135"
                    disabled={disabled || isSaving}
                  />
                </div>
                <div className="flex items-end justify-end">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="text-red-500 hover:bg-red-50 hover:text-red-600"
                    onClick={() => void removeRow(index)}
                    disabled={disabled || isSaving || deletingRowId !== null}
                    aria-label={`ลบตัวเลือกที่ ${index + 1}`}
                    title="ลบตัวเลือกนี้ทันที"
                  >
                    {deletingRowId === row.id ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="size-4" aria-hidden="true" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor={`purchase-option-vip-${index}`} className="text-[11px]">ราคา VIP (ไม่บังคับ)</Label>
                  <Input
                    id={`purchase-option-vip-${index}`}
                    type="number"
                    min={0}
                    step="0.01"
                    value={row.priceVip}
                    onChange={(event) => updateRow(index, { priceVip: event.target.value })}
                    placeholder="ใช้ราคาปกติ"
                    disabled={disabled || isSaving}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`purchase-option-walkin-${index}`} className="text-[11px]">ราคาลูกค้าทั่วไป (ไม่บังคับ)</Label>
                  <Input
                    id={`purchase-option-walkin-${index}`}
                    type="number"
                    min={0}
                    step="0.01"
                    value={row.priceWalkin}
                    onChange={(event) => updateRow(index, { priceWalkin: event.target.value })}
                    placeholder="ใช้ราคาปกติ"
                    disabled={disabled || isSaving}
                  />
                </div>
                <div className="flex items-end gap-2 pb-1">
                  <Switch
                    id={`purchase-option-active-${index}`}
                    checked={row.isActive}
                    onCheckedChange={(checked) => updateRow(index, { isActive: checked })}
                    disabled={disabled || isSaving}
                  />
                  <Label htmlFor={`purchase-option-active-${index}`} className="text-xs">แสดงในหน้าร้าน</Label>
                </div>
              </div>
            </div>
          ))}

          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--theme-color)]/30 bg-white p-3 text-xs text-[#6B7280]">
              ยังไม่ได้ตั้งค่าตัวเลือกแบบชุด ระบบซื้อแบบบัญชีเดี่ยวยังคงใช้งานได้ตามปกติ
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRows((current) => [...current, emptyRow(current.length)])}
              disabled={disabled || isSaving || rows.length >= 100}
            >
              <Plus className="size-4" /> เพิ่มตัวเลือก
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={save}
              disabled={disabled || isLoading || isSaving}
              className="bg-[var(--theme-color)] text-white hover:bg-[var(--theme-color)]"
            >
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              บันทึกตัวเลือก
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
