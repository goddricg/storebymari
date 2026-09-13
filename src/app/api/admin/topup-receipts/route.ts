import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireMainSiteSuperAdminApi } from "@/lib/auth/api";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";
import {
  ensureTopupCashReceiptForAdminEvent,
  TopupReceiptUnavailableError,
} from "@/lib/receipts/topup-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z.object({
  eventId: z.string().trim().min(1).max(300),
});

export async function POST(request: NextRequest) {
  const authorization = await requireMainSiteSuperAdminApi();
  if (authorization.response) return authorization.response;

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "ไม่พบรายการเติมเงินที่ต้องการออกใบเสร็จ" }, { status: 422 });
  }

  try {
    const result = await ensureTopupCashReceiptForAdminEvent(parsed.data.eventId);
    await recordAdminAuditEvent({
      actor: authorization.user,
      action: result.created ? "TOPUP_RECEIPT_CREATE" : "TOPUP_RECEIPT_VIEW",
      category: "finance",
      severity: "medium",
      entityType: "topup_cash_receipt",
      entityId: result.receipt.id,
      entityLabel: result.receipt.receiptNo,
      details: result.created
        ? "Issued a missing cash receipt from a successful top-up timeline event"
        : "Opened an existing cash receipt from the top-up timeline",
      after: {
        receiptNo: result.receipt.receiptNo,
        created: result.created,
      },
      ...getAdminAuditRequestContext(request),
    });

    return NextResponse.json({
      receiptId: result.receipt.id,
      receiptNo: result.receipt.receiptNo,
      created: result.created,
    });
  } catch (error) {
    if (error instanceof TopupReceiptUnavailableError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    console.error("Admin top-up receipt issue failed:", error);
    return NextResponse.json({ message: "ไม่สามารถเตรียมใบเสร็จเติมพ้อยท์ได้" }, { status: 500 });
  }
}
