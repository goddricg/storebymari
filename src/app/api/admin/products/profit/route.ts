import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";

import { getCurrentUser } from "@/lib/auth/server";
import { getSiteId } from "@/lib/site";
import { applyGlobalProfit } from "@/lib/products/repository";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";

const profitSchema = z.object({
  mode: z.enum(["amount", "percent"]),
  value: z.number().nonnegative("มูลค่าต้องไม่ติดลบ"),
});

export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me || !me.isAdmin) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = profitSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "ข้อมูลไม่ถูกต้อง",
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 422 }
    );
  }

  const { mode, value } = parsed.data;

  try {
    // Site scope is derived from the server deployment, never from the
    // request body, and is carried into every profit UPDATE predicate.
    const products = await applyGlobalProfit(mode, value, getSiteId());
    await recordAdminAuditEvent({
      actor: me,
      action: "PRODUCT_PROFIT_BULK_UPDATE",
      category: "finance",
      severity: "high",
      entityType: "product_collection",
      entityLabel: "Global product profit",
      after: { mode, value, affectedCount: products.length },
      details: "Applied a global product profit update",
      ...getAdminAuditRequestContext(request),
    });
    revalidatePath("/");
    revalidatePath("/api/products");
    (revalidateTag as any)("products");
    return NextResponse.json({ products, count: products.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถตั้งกำไรได้";
    return NextResponse.json({ message }, { status: 500 });
  }
}

