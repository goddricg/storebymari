import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireMainSiteSuperAdminApi } from "@/lib/auth/api";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";
import {
  listTopupCashReceiptsForAdmin,
} from "@/lib/receipts/topup-repository";
import { getTopupSourceLabel } from "@/lib/topup/history";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({
  search: z.string().trim().max(100).optional().default(""),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

function noStore(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return response;
}

export async function GET(request: NextRequest) {
  const authorization = await requireMainSiteSuperAdminApi();
  if (authorization.response) return authorization.response;

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    search: searchParams.get("search") ?? "",
    page: searchParams.get("page") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return noStore({ message: "เงื่อนไขค้นหาไม่ถูกต้อง" }, 422);

  try {
    const result = await listTopupCashReceiptsForAdmin({
      search: parsed.data.search,
      page: parsed.data.page,
      limit: parsed.data.limit,
    });
    await recordAdminAuditEvent({
      actor: authorization.user,
      action: "TOPUP_RECEIPTS_LIST_VIEW",
      category: "finance",
      severity: "medium",
      entityType: "topup_cash_receipts",
      after: {
        search: parsed.data.search || undefined,
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
      details: "Viewed the top-up cash receipt list",
      ...getAdminAuditRequestContext(request),
    });

    return noStore({
      rows: result.rows.map(({ receipt, sourceType, sourceLabel, sourceEmail }) => ({
        id: receipt.id,
        receipt_no: receipt.receiptNo,
        issued_at: receipt.issuedAt,
        buyer_name: receipt.buyer.name,
        buyer_email: receipt.buyer.email,
        amount_paid: receipt.amountPaid,
        bonus_points: receipt.bonusPoints,
        credited_points: receipt.creditedPoints,
        source: getTopupSourceLabel({
          sourceType,
          sourceLabel,
          sourceEmail,
          isManual: sourceType === "ADMIN",
        }),
      })),
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    console.error("Admin top-up receipt list failed:", error);
    return noStore({ message: "ไม่สามารถโหลดรายการบิลเติมเงินได้" }, 500);
  }
}
