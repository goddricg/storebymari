import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/server";
import { getSiteId } from "@/lib/site";
import {
  clearProductStock,
  StockClearError,
} from "@/lib/products/stock-clear";
import { sendAdminAuditWebhook } from "@/lib/discord/admin-audit";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";

const clearStockSchema = z.object({
  productId: z.string().trim().min(1).max(128),
  typeId: z.string().trim().min(1).max(255).optional(),
});

function isAdmin(user: Awaited<ReturnType<typeof getCurrentUser>>): boolean {
  return Boolean(
    user &&
      (user.role === "superadmin" || user.role === "admin" || user.isAdmin),
  );
}

function noStoreJson(body: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) {
    return noStoreJson({ message: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 422 });
  }

  const parsed = clearStockSchema.safeParse(body);
  if (!parsed.success) {
    return noStoreJson(
      { message: "ข้อมูลสินค้าไม่ถูกต้อง", errors: parsed.error.issues },
      { status: 422 },
    );
  }

  try {
    const result = await clearProductStock({
      ...parsed.data,
      siteId: getSiteId(),
    });

    await recordAdminAuditEvent({
      actor: me,
      action: "STOCK_CLEAR",
      category: "inventory",
      severity: "critical",
      entityType: "product_stock",
      entityId: result.typeId,
      entityLabel: result.productName,
      before: {
        previousStock: result.previousStock,
        accountCount: result.clearedAccountCount,
        hadStaticAccount: result.clearedStaticAccount,
      },
      after: {
        remainingStock: result.remainingStock,
        accountCount: 0,
        staticAccountCleared: result.clearedStaticAccount,
      },
      details: "Cleared all stock data; account contents were not stored in the audit log and provider configuration was preserved",
      ...getAdminAuditRequestContext(request),
    });

    revalidatePath("/");
    revalidatePath("/api/products");
    (revalidateTag as unknown as (tag: string) => void)("products");
    await sendAdminAuditWebhook({
      action: "Clear Stock สินค้า",
      target: `Product: ${result.productName} (${result.typeId})`,
      details: `ล้าง Stock ${result.previousStock} -> ${result.remainingStock}; ล้าง Account ${result.clearedAccountCount} รายการ`,
    });

    return noStoreJson(result, { status: 200 });
  } catch (error) {
    if (error instanceof StockClearError) {
      return noStoreJson(
        { success: false, code: error.code, message: error.message },
        { status: error.status },
      );
    }

    return noStoreJson(
      { success: false, code: "STOCK_CLEAR_FAILED", message: "ไม่สามารถล้าง Stock ได้ กรุณาลองใหม่" },
      { status: 500 },
    );
  }
}
