"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ReceiptPrintButton() {
  return (
    <Button
      type="button"
      className="receipt-no-print bg-[var(--theme-color)] text-white hover:bg-[var(--theme-color)]"
      onClick={() => window.print()}
    >
      <Printer className="size-4" />
      พิมพ์ / บันทึก PDF
    </Button>
  );
}
