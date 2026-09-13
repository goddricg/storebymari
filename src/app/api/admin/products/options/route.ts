import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/server";
import { getSiteId } from "@/lib/site";
import {
  deletePurchaseOptionForProduct,
  listPurchaseOptionsForAdmin,
  replacePurchaseOptionsForProduct,
} from "@/lib/purchase-options/repository";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";

const optionSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(255),
  quantity: z.number().int().min(2).max(100),
  price: z.number().nonnegative(),
  priceVip: z.number().nonnegative().nullable().optional(),
  priceWalkin: z.number().nonnegative().nullable().optional(),
  displayOrder: z.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional().default(true),
});

const saveSchema = z.object({
  typeId: z.string().trim().min(1),
  options: z.array(optionSchema).max(100),
});

async function requireMainAdmin() {
  const me = await getCurrentUser();
  const isAdmin = me?.role === "superadmin" || me?.role === "admin" || me?.isAdmin;
  if (!me || !isAdmin) {
    return null;
  }
  if (getSiteId() !== "main") {
    return null;
  }
  return me;
}

export async function GET(request: NextRequest) {
  const me = await requireMainAdmin();
  if (!me) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const typeId = new URL(request.url).searchParams.get("typeId")?.trim();
  if (!typeId) {
    return NextResponse.json({ message: "typeId is required" }, { status: 422 });
  }

  try {
    const options = await listPurchaseOptionsForAdmin(typeId);
    return NextResponse.json({ options });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load purchase options";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const me = await requireMainAdmin();
  if (!me) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const parsed = saveSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Invalid purchase option data", errors: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const before = await listPurchaseOptionsForAdmin(parsed.data.typeId);
    const options = await replacePurchaseOptionsForProduct(
      parsed.data.typeId,
      parsed.data.options
    );

    await recordAdminAuditEvent({
      actor: me,
      action: "PURCHASE_OPTIONS_UPDATE",
      category: "catalog",
      severity: "high",
      entityType: "product_purchase_options",
      entityId: parsed.data.typeId,
      entityLabel: parsed.data.typeId,
      before: { count: before.length, options: before.map((option) => ({
        id: option.id,
        name: option.name,
        quantity: option.quantity,
        price: option.price,
        priceVip: option.priceVip,
        priceWalkin: option.priceWalkin,
        displayOrder: option.displayOrder,
        isActive: option.isActive,
      })) },
      after: { count: options.length, options: options.map((option) => ({
        id: option.id,
        name: option.name,
        quantity: option.quantity,
        price: option.price,
        priceVip: option.priceVip,
        priceWalkin: option.priceWalkin,
        displayOrder: option.displayOrder,
        isActive: option.isActive,
      })) },
      details: "Replaced product purchase options",
      ...getAdminAuditRequestContext(request),
    });
    return NextResponse.json({ options });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save purchase options";
    const status = message.includes("unique quantity") || message.includes("API provider")
      ? 409
      : message.includes("not found")
        ? 404
        : 500;
    return NextResponse.json({ message }, { status });
  }
}

const deleteSchema = z.object({
  typeId: z.string().trim().min(1),
  id: z.string().trim().min(1),
});

export async function DELETE(request: Request) {
  const me = await requireMainAdmin();
  if (!me) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const parsed = deleteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Invalid purchase option delete data", errors: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const before = await listPurchaseOptionsForAdmin(parsed.data.typeId);
    const deleted = await deletePurchaseOptionForProduct(parsed.data.typeId, parsed.data.id);
    if (!deleted) {
      return NextResponse.json({ message: "Purchase option was not found" }, { status: 404 });
    }

    const options = await listPurchaseOptionsForAdmin(parsed.data.typeId);
    await recordAdminAuditEvent({
      actor: me,
      action: "PURCHASE_OPTION_DELETE",
      category: "catalog",
      severity: "high",
      entityType: "product_purchase_option",
      entityId: deleted.id,
      entityLabel: deleted.name,
      before: {
        option: {
          id: deleted.id,
          name: deleted.name,
          quantity: deleted.quantity,
          price: deleted.price,
          priceVip: deleted.priceVip,
          priceWalkin: deleted.priceWalkin,
          displayOrder: deleted.displayOrder,
          isActive: deleted.isActive,
        },
        count: before.length,
      },
      after: { count: options.length },
      details: "Deleted a product purchase option",
      ...getAdminAuditRequestContext(request),
    });

    return NextResponse.json({ options, deletedId: deleted.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete purchase option";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ message }, { status });
  }
}
