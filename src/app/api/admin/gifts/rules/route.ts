import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/server";
import { canManageGlobalGiftConfig } from "@/lib/auth/access-policies";
import { getSiteId } from "@/lib/site";
import {
  createGiftOption,
  deleteGiftOption,
  listAllGiftOptions,
  setGiftOptionActive,
} from "@/lib/gifts/repository";
import { fetchAllProducts } from "@/lib/products/repository";
import { sendAdminAuditWebhook } from "@/lib/discord/admin-audit";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";

const createSchema = z.object({
  baseTypeId: z.string().min(1),
  giftTypeId: z.string().min(1),
});

const toggleSchema = z.object({
  id: z.string(),
  isActive: z.boolean(),
});

function noStoreJson(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return response;
}

async function authorizeGlobalGiftConfig() {
  const me = await getCurrentUser();
  if (!me) {
    return { user: null, response: noStoreJson({ message: "Unauthorized" }, 401) };
  }
  if (!canManageGlobalGiftConfig(getSiteId(), me)) {
    return { user: null, response: noStoreJson({ message: "Forbidden" }, 403) };
  }
  return { user: me, response: null };
}

export async function GET() {
  const authorization = await authorizeGlobalGiftConfig();
  if (authorization.response) return authorization.response;

  const [rules, products] = await Promise.all([listAllGiftOptions(), fetchAllProducts()]);
  const productMap = new Map(products.map((p) => [p.typeId, p]));

  return noStoreJson({
    rules: rules.map((r) => ({
      ...r,
      baseProductName: productMap.get(r.baseProductTypeId)?.name ?? r.baseProductTypeId,
      giftProductName: productMap.get(r.giftProductTypeId)?.name ?? r.giftProductTypeId,
      giftProductStock: productMap.get(r.giftProductTypeId)?.stock ?? null,
      giftIsExternal: Boolean(productMap.get(r.giftProductTypeId)?.apiProviderId),
    })),
    products: products.map((p) => ({
      typeId: p.typeId,
      name: p.name,
      stock: p.stock,
      apiProviderId: p.apiProviderId,
    })),
  });
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeGlobalGiftConfig();
  if (authorization.response) return authorization.response;
  const me = authorization.user!;

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return noStoreJson({ message: "Invalid payload" }, 422);
  }

  const created = await createGiftOption(parsed.data.baseTypeId, parsed.data.giftTypeId);

  await recordAdminAuditEvent({
    actor: me,
    action: "GIFT_RULE_CREATE",
    category: "catalog",
    severity: "medium",
    entityType: "gift_rule",
    entityId: created.id,
    entityLabel: `${created.baseProductTypeId} -> ${created.giftProductTypeId}`,
    after: { baseProductTypeId: created.baseProductTypeId, giftProductTypeId: created.giftProductTypeId },
    details: "Created a gift rule",
    ...getAdminAuditRequestContext(request),
  });

  await sendAdminAuditWebhook({
    action: "เพิ่มของแถม",
    target: `Base: ${created.baseProductTypeId} -> Gift: ${created.giftProductTypeId}`,
  });

  return noStoreJson({ rule: created }, 201);
}

export async function PATCH(request: NextRequest) {
  const authorization = await authorizeGlobalGiftConfig();
  if (authorization.response) return authorization.response;
  const me = authorization.user!;

  const body = await request.json().catch(() => null);
  const parsed = toggleSchema.safeParse(body);
  if (!parsed.success) {
    return noStoreJson({ message: "Invalid payload" }, 422);
  }

  await setGiftOptionActive(parsed.data.id, parsed.data.isActive);

  await recordAdminAuditEvent({
    actor: me,
    action: "GIFT_RULE_UPDATE",
    category: "catalog",
    severity: "medium",
    entityType: "gift_rule",
    entityId: parsed.data.id,
    after: { isActive: parsed.data.isActive },
    details: "Updated a gift rule status",
    ...getAdminAuditRequestContext(request),
  });

  await sendAdminAuditWebhook({
    action: "อัปเดตสถานะของแถม",
    target: `Rule ID: ${parsed.data.id}`,
    details: `ตั้งค่า is_active = ${String(parsed.data.isActive)}`,
  });

  return noStoreJson({ success: true });
}

export async function DELETE(request: NextRequest) {
  const authorization = await authorizeGlobalGiftConfig();
  if (authorization.response) return authorization.response;
  const me = authorization.user!;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return noStoreJson({ message: "กรุณาระบุ id" }, 422);
  }

  await deleteGiftOption(id);

  await recordAdminAuditEvent({
    actor: me,
    action: "GIFT_RULE_DELETE",
    category: "catalog",
    severity: "high",
    entityType: "gift_rule",
    entityId: id,
    details: "Deleted a gift rule",
    ...getAdminAuditRequestContext(request),
  });

  await sendAdminAuditWebhook({
    action: "ลบของแถม",
    target: `Rule ID: ${id}`,
  });

  return noStoreJson({ success: true });
}


