import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/server";
import { isAdminUser } from "@/lib/auth/roles";
import { getSiteId } from "@/lib/site";
import pool from "@/lib/mysql";
import { safeParseJson, type Separator } from "@/lib/products/account-parser";
import {
  appendProductAccounts,
  StockAppendError,
  type StockAppendFormat,
} from "@/lib/products/stock-append";
import {
  StockAccountEditError,
  updateProductAccount,
} from "@/lib/products/stock-account-edit";
import {
  deleteProductAccount,
  StockAccountDeleteError,
} from "@/lib/products/stock-account-delete";
import { deleteProductAccounts } from "@/lib/products/stock-account-bulk-delete";
import {
  DEFAULT_STOCK_DELIVERY_TYPE,
  parseStockDeliveryType,
} from "@/lib/products/stock-delivery-type";
import { sendAdminAuditWebhook } from "@/lib/discord/admin-audit";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";
import { sendRestockAlertEmail } from "@/lib/email/restock-alert";
import { triggerMimiAutoPilot } from "@/lib/ai/mimi-generator";

const accountAppendSchema = z.object({
  productId: z.string().min(1),
  typeId: z.string().min(1).optional(),
  rawInput: z.string().min(1).max(2_000_000),
  dataFormat: z.enum(["short", "long"]).default("long"),
  separator: z.enum([",", "|", ":", ";", "----"]).default(","),
  stockDeliveryType: z
    .enum(["account-pool", "account-screen-pool", "reusable-account-pool", "invite-link-pool", "reusable-link"])
    .default(DEFAULT_STOCK_DELIVERY_TYPE),
  requestId: z.string().trim().min(1).max(128).optional(),
});

const accountEditSchema = z.object({
  productId: z.string().trim().min(1).max(128),
  typeId: z.string().trim().min(1).max(255).optional(),
  accountIndex: z.number().int().min(0),
  account: z.object({
    email: z.string().max(255),
    password: z.string().max(255),
    details: z.string().max(2_000_000).optional(),
  }),
});

const accountDeleteSchema = z.object({
  productId: z.string().trim().min(1).max(128),
  typeId: z.string().trim().min(1).max(255).optional(),
  accountIndex: z.number().int().min(0),
  expectedAccount: z.object({
    email: z.string().max(255),
    password: z.string().max(255),
    details: z.string().max(2_000_000).optional(),
  }),
});

const accountBulkDeleteSchema = z.object({
  productId: z.string().trim().min(1).max(128),
  typeId: z.string().trim().min(1).max(255).optional(),
  accounts: z.array(z.object({
    accountIndex: z.number().int().min(0),
    expectedAccount: z.object({
      email: z.string().max(255),
      password: z.string().max(255),
      details: z.string().max(2_000_000).optional(),
    }),
  })).min(1).max(1_000),
});

function isAdmin(user: Awaited<ReturnType<typeof getCurrentUser>>): boolean {
  return isAdminUser(user);
}

function noStoreJson(body: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: Request) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) {
    return noStoreJson({ message: "Forbidden" }, { status: 403 });
  }

  const productId = new URL(request.url).searchParams.get("productId")?.trim();
  if (!productId) {
    return noStoreJson({ message: "กรุณาระบุสินค้า" }, { status: 422 });
  }

  const siteId = getSiteId();
  const [rows] = await pool.execute(
    `SELECT id, type_id, name, stock, account_data, stock_delivery_type, api_provider_id,
            account_email, account_password, updated_at
     FROM products
     WHERE id = ?
       AND (is_local = 0 OR (is_local = 1 AND site_id = ?))
     LIMIT 1`,
    [productId, siteId],
  );
  const product = (rows as Array<Record<string, unknown>>)[0];
  if (!product) {
    return noStoreJson({ message: "ไม่พบสินค้าที่เลือก" }, { status: 404 });
  }

  const accountData = safeParseJson<Array<{ email: string; password: string; details?: string }>>(
    product.account_data,
  ) ?? [];
  const accountCount = Array.isArray(accountData) ? accountData.length : 0;
  const stock = Number(product.stock ?? 0);
  const sourceMode = product.api_provider_id
    ? "provider"
    : product.account_email || product.account_password
      ? "static"
      : "account-pool";

  await recordAdminAuditEvent({
    actor: me,
    action: "STOCK_ACCOUNT_VIEW",
    category: "inventory",
    severity: "high",
    entityType: "product_stock",
    entityId: String(product.type_id ?? product.id),
    entityLabel: String(product.name ?? product.type_id ?? product.id),
    after: {
      accountCount,
      availableStock: accountCount > 0 ? accountCount : Math.max(0, Math.trunc(stock || 0)),
      sourceMode,
      stockDeliveryType: parseStockDeliveryType(product.stock_delivery_type),
    },
    details: "Viewed stock account data; account contents were not copied into audit storage",
    ...getAdminAuditRequestContext(request),
  });

  return noStoreJson({
    product: {
      id: product.id,
      typeId: product.type_id,
      name: product.name,
      accountData,
      accountCount,
      availableStock: accountCount > 0 ? accountCount : Math.max(0, Math.trunc(stock || 0)),
      sourceMode,
      stockDeliveryType: parseStockDeliveryType(product.stock_delivery_type),
      updatedAt: product.updated_at,
    },
  });
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

  const parsed = accountAppendSchema.safeParse(body);
  if (!parsed.success) {
    return noStoreJson(
      { message: "ข้อมูล Account ไม่ถูกต้อง", errors: parsed.error.issues },
      { status: 422 },
    );
  }

  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || parsed.data.requestId;
  if (!idempotencyKey) {
    return noStoreJson(
      { message: "กรุณาระบุ Idempotency-Key เพื่อป้องกันการเพิ่มซ้ำ" },
      { status: 422 },
    );
  }

  try {
    const outcome = await appendProductAccounts({
      productId: parsed.data.productId,
      typeId: parsed.data.typeId,
      rawInput: parsed.data.rawInput,
      dataFormat: parsed.data.dataFormat as StockAppendFormat,
      separator: parsed.data.separator as Separator,
      stockDeliveryType: parsed.data.stockDeliveryType,
      actorId: me.id,
      siteId: getSiteId(),
      idempotencyKey,
    });

    if (outcome.kind === "success") {
      await recordAdminAuditEvent({
        actor: me,
        action: "STOCK_ACCOUNT_APPEND",
        category: "inventory",
        severity: outcome.body.addedCount > 0 ? "high" : "medium",
        entityType: "product_stock",
        entityId: outcome.body.typeId,
        entityLabel: outcome.body.productName,
        after: {
          addedCount: outcome.body.addedCount,
          duplicateCount: outcome.body.duplicateCount,
          previousStock: outcome.body.previousStock,
          remainingStock: outcome.body.remainingStock,
          stockDeliveryType: parsed.data.stockDeliveryType,
        },
        details: "Appended stock metadata; account contents were excluded",
        ...getAdminAuditRequestContext(request),
      });
      revalidatePath("/");
      revalidatePath("/api/products");
      (revalidateTag as unknown as (tag: string) => void)("products");
      await sendAdminAuditWebhook({
        action: "เพิ่ม Account สินค้า",
        target: `Product: ${outcome.body.productName} (${outcome.body.typeId})`,
        details: `เพิ่ม ${outcome.body.addedCount} รายการ, ข้ามรายการซ้ำ ${outcome.body.duplicateCount} รายการ, Stock ${outcome.body.previousStock} เป็น ${outcome.body.remainingStock}`,
      });
      if (outcome.body.addedCount > 0) {
        try {
          await sendRestockAlertEmail({
            productName: outcome.body.productName,
            amount: outcome.body.addedCount,
            previousStock: outcome.body.previousStock,
            remainingStock: outcome.body.remainingStock,
            actorName: me.displayName || "Admin",
            actorEmail: me.email || "",
            note: `เพิ่มสต็อกบัญชี (${parsed.data.stockDeliveryType})`,
          });
        } catch (err) {
          console.error("[Restock Email Error]:", err);
        }

        try {
          await triggerMimiAutoPilot({
            productName: outcome.body.productName,
            amount: outcome.body.addedCount,
            previousStock: outcome.body.previousStock,
            remainingStock: outcome.body.remainingStock,
            actorName: me.displayName || "Admin",
          });
        } catch (mimiErr) {
          console.error("[Mimi Auto-Pilot Error]:", mimiErr);
        }
      }
    }

    return noStoreJson(outcome.body, { status: outcome.status });
  } catch (error) {
    if (error instanceof StockAppendError) {
      return noStoreJson(
        {
          success: false,
          code: error.code,
          message: error.message,
          errors: error.details,
        },
        { status: error.status },
      );
    }

    return noStoreJson(
      { success: false, code: "STOCK_APPEND_FAILED", message: "ไม่สามารถเพิ่ม Account ได้ กรุณาลองใหม่" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) {
    return noStoreJson({ message: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ message: "Account data is not valid" }, { status: 422 });
  }

  const parsed = accountEditSchema.safeParse(body);
  if (!parsed.success) {
    return noStoreJson(
      { message: "Account data is not valid", errors: parsed.error.issues },
      { status: 422 },
    );
  }

  try {
    const result = await updateProductAccount({
      ...parsed.data,
      siteId: getSiteId(),
    });

    await recordAdminAuditEvent({
      actor: me,
      action: "STOCK_ACCOUNT_UPDATE",
      category: "inventory",
      severity: "high",
      entityType: "product_stock_account",
      entityId: result.typeId,
      entityLabel: result.productName,
      after: {
        accountIndex: result.accountIndex,
        remainingStock: result.remainingStock,
      },
      details: "Edited one stock account; account contents were not stored",
      ...getAdminAuditRequestContext(request),
    });

    revalidatePath("/");
    revalidatePath("/api/products");
    (revalidateTag as unknown as (tag: string) => void)("products");
    await sendAdminAuditWebhook({
      action: "Edit product Account",
      target: `Product: ${result.productName} (${result.typeId})`,
      details: `Edited Account #${result.accountIndex + 1}; Stock remains ${result.remainingStock}`,
    });

    return noStoreJson(result, { status: 200 });
  } catch (error) {
    if (error instanceof StockAccountEditError) {
      return noStoreJson(
        { success: false, code: error.code, message: error.message },
        { status: error.status },
      );
    }

    return noStoreJson(
      { success: false, code: "STOCK_ACCOUNT_EDIT_FAILED", message: "Unable to edit the Account; please try again" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) {
    return noStoreJson({ message: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ message: "Account data is not valid" }, { status: 422 });
  }

  const bulkParsed = accountBulkDeleteSchema.safeParse(body);
  if (bulkParsed.success) {
    try {
      const result = await deleteProductAccounts({
        ...bulkParsed.data,
        accounts: bulkParsed.data.accounts.map((selection) => ({
          ...selection,
          expectedAccount: {
            ...selection.expectedAccount,
            details: selection.expectedAccount.details ?? "",
          },
        })),
        siteId: getSiteId(),
      });

      await recordAdminAuditEvent({
        actor: me,
        action: "STOCK_ACCOUNT_DELETE_BULK",
        category: "inventory",
        severity: "critical",
        entityType: "product_stock_account",
        entityId: result.typeId,
        entityLabel: result.productName,
        before: {
          previousStock: result.previousStock,
          deletedCount: result.deletedCount,
        },
        after: {
          remainingStock: result.remainingStock,
        },
        details: "Deleted selected stock accounts; account contents were not stored",
        ...getAdminAuditRequestContext(request),
      });

      revalidatePath("/");
      revalidatePath("/api/products");
      (revalidateTag as unknown as (tag: string) => void)("products");
      await sendAdminAuditWebhook({
        action: "Delete selected product Accounts",
        target: `Product: ${result.productName} (${result.typeId})`,
        details: `Deleted ${result.deletedCount} selected Accounts; Stock ${result.previousStock} -> ${result.remainingStock}`,
      });

      return noStoreJson(result, { status: 200 });
    } catch (error) {
      if (error instanceof StockAccountDeleteError) {
        return noStoreJson(
          { success: false, code: error.code, message: error.message },
          { status: error.status },
        );
      }

      return noStoreJson(
        { success: false, code: "STOCK_ACCOUNT_DELETE_FAILED", message: "Unable to delete the Accounts; please try again" },
        { status: 500 },
      );
    }
  }

  const parsed = accountDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return noStoreJson(
      { message: "Account data is not valid", errors: parsed.error.issues },
      { status: 422 },
    );
  }

  try {
    const result = await deleteProductAccount({
      ...parsed.data,
      expectedAccount: {
        ...parsed.data.expectedAccount,
        details: parsed.data.expectedAccount.details ?? "",
      },
      siteId: getSiteId(),
    });

    await recordAdminAuditEvent({
      actor: me,
      action: "STOCK_ACCOUNT_DELETE",
      category: "inventory",
      severity: "critical",
      entityType: "product_stock_account",
      entityId: result.typeId,
      entityLabel: result.productName,
      before: {
        accountIndex: result.accountIndex,
        previousStock: result.previousStock,
      },
      after: {
        remainingStock: result.remainingStock,
      },
      details: "Deleted one stock account; account contents were not stored",
      ...getAdminAuditRequestContext(request),
    });

    revalidatePath("/");
    revalidatePath("/api/products");
    (revalidateTag as unknown as (tag: string) => void)("products");
    await sendAdminAuditWebhook({
      action: "Delete product Account",
      target: `Product: ${result.productName} (${result.typeId})`,
      details: `Deleted Account #${result.accountIndex + 1}; Stock ${result.previousStock} -> ${result.remainingStock}`,
    });

    return noStoreJson(result, { status: 200 });
  } catch (error) {
    if (error instanceof StockAccountDeleteError) {
      return noStoreJson(
        { success: false, code: error.code, message: error.message },
        { status: error.status },
      );
    }

    return noStoreJson(
      { success: false, code: "STOCK_ACCOUNT_DELETE_FAILED", message: "Unable to delete the Account; please try again" },
      { status: 500 },
    );
  }
}
