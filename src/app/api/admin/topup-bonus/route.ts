import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireMainSiteSuperAdminApi } from "@/lib/auth/api";
import { getSiteId } from "@/lib/site";
import {
  archiveTopupBonusRule,
  createTopupBonusRule,
  deleteTopupBonusRule,
  getTopupBonusRule,
  isTopupBonusSchemaUnavailable,
  listTopupBonusRules,
  updateTopupBonusRule,
} from "@/lib/topup/bonus-repository";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";

const moneySchema = z
  .coerce
  .number()
  .refine((value) => Number.isFinite(value), "ต้องเป็นตัวเลข")
  .refine((value) => value > 0, "ต้องมากกว่า 0")
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
    "รองรับทศนิยมไม่เกิน 2 ตำแหน่ง"
  );

const bonusSchema = z
  .coerce
  .number()
  .refine((value) => Number.isFinite(value), "ต้องเป็นตัวเลข")
  .refine((value) => value >= 0, "โบนัสต้องไม่ติดลบ")
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
    "รองรับทศนิยมไม่เกิน 2 ตำแหน่ง"
  );

const ruleSchema = z.object({
  triggerAmount: moneySchema,
  bonusPoints: bonusSchema,
  isActive: z.boolean().default(true),
});

const updateSchema = ruleSchema.extend({
  id: z.string().min(1),
});

function serializeRule(rule: Awaited<ReturnType<typeof getTopupBonusRule>>) {
  if (!rule) return null;
  return {
    id: rule.id,
    triggerAmount: rule.triggerAmount,
    bonusPoints: rule.bonusPoints,
    isActive: rule.isActive,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
}

function isDuplicateError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY"
  );
}

function schemaUnavailableResponse() {
  return NextResponse.json(
    { message: "ยังไม่ได้ติดตั้งโครงสร้างระบบโบนัสเติมเงิน กรุณาใช้ migration 17 ก่อน" },
    { status: 503 }
  );
}

export async function GET() {
  const authorization = await requireMainSiteSuperAdminApi();
  if (authorization.response) return authorization.response;

  try {
    const rules = await listTopupBonusRules(getSiteId());
    return NextResponse.json({
      rules: rules.map((rule) => serializeRule(rule)),
    });
  } catch (error) {
    if (isTopupBonusSchemaUnavailable(error)) return schemaUnavailableResponse();
    console.error("Error loading top-up bonus rules:", error);
    return NextResponse.json({ message: "ไม่สามารถโหลดกติกาโบนัสเติมเงินได้" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authorization = await requireMainSiteSuperAdminApi();
  if (authorization.response) return authorization.response;

  const body = await request.json().catch(() => null);
  const parsed = ruleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "ข้อมูลกติกาโบนัสไม่ถูกต้อง", errors: parsed.error.flatten() },
      { status: 422 }
    );
  }

  try {
    const rule = await createTopupBonusRule(
      getSiteId(),
      parsed.data,
      authorization.user.id
    );
    await recordAdminAuditEvent({
      actor: authorization.user,
      action: "TOPUP_BONUS_RULE_CREATE",
      category: "finance",
      severity: "high",
      entityType: "topup_bonus_rule",
      entityId: rule.id,
      entityLabel: `${rule.triggerAmount} -> ${rule.bonusPoints}`,
      after: {
        triggerAmount: rule.triggerAmount,
        bonusPoints: rule.bonusPoints,
        isActive: rule.isActive,
      },
      details: "Created a top-up bonus rule",
      ...getAdminAuditRequestContext(request),
    });
    return NextResponse.json({ rule: serializeRule(rule) }, { status: 201 });
  } catch (error) {
    if (isTopupBonusSchemaUnavailable(error)) return schemaUnavailableResponse();
    if (isDuplicateError(error)) {
      return NextResponse.json(
        { message: "มียอดเติมเงินนี้อยู่แล้ว กรุณาแก้ไขกติกาเดิมแทน" },
        { status: 409 }
      );
    }
    console.error("Error creating top-up bonus rule:", error);
    return NextResponse.json({ message: "ไม่สามารถเพิ่มกติกาโบนัสเติมเงินได้" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const authorization = await requireMainSiteSuperAdminApi();
  if (authorization.response) return authorization.response;

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "ข้อมูลกติกาโบนัสไม่ถูกต้อง", errors: parsed.error.flatten() },
      { status: 422 }
    );
  }

  try {
    const siteId = getSiteId();
    const before = await getTopupBonusRule(siteId, parsed.data.id);
    if (!before) {
      return NextResponse.json({ message: "ไม่พบกติกาโบนัสเติมเงิน" }, { status: 404 });
    }
    const rule = await updateTopupBonusRule(siteId, parsed.data.id, parsed.data, authorization.user.id);
    await recordAdminAuditEvent({
      actor: authorization.user,
      action: "TOPUP_BONUS_RULE_UPDATE",
      category: "finance",
      severity: "high",
      entityType: "topup_bonus_rule",
      entityId: rule.id,
      entityLabel: `${rule.triggerAmount} -> ${rule.bonusPoints}`,
      before: {
        triggerAmount: before.triggerAmount,
        bonusPoints: before.bonusPoints,
        isActive: before.isActive,
      },
      after: {
        triggerAmount: rule.triggerAmount,
        bonusPoints: rule.bonusPoints,
        isActive: rule.isActive,
      },
      details: "Updated a top-up bonus rule",
      ...getAdminAuditRequestContext(request),
    });
    return NextResponse.json({ rule: serializeRule(rule) });
  } catch (error) {
    if (isTopupBonusSchemaUnavailable(error)) return schemaUnavailableResponse();
    if (isDuplicateError(error)) {
      return NextResponse.json(
        { message: "มียอดเติมเงินนี้อยู่แล้ว กรุณาแก้ไขกติกาเดิมแทน" },
        { status: 409 }
      );
    }
    console.error("Error updating top-up bonus rule:", error);
    return NextResponse.json({ message: "ไม่สามารถแก้ไขกติกาโบนัสเติมเงินได้" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authorization = await requireMainSiteSuperAdminApi();
  if (authorization.response) return authorization.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ message: "กรุณาระบุ id" }, { status: 422 });

  const permanentlyDelete = searchParams.get("permanent") === "true";

  try {
    const siteId = getSiteId();
    const before = await getTopupBonusRule(siteId, id);
    if (!before) {
      return NextResponse.json({ message: "ไม่พบกติกาโบนัสเติมเงิน" }, { status: 404 });
    }

    if (permanentlyDelete) {
      await deleteTopupBonusRule(siteId, id);
      await recordAdminAuditEvent({
        actor: authorization.user,
        action: "TOPUP_BONUS_RULE_DELETE",
        category: "finance",
        severity: "high",
        entityType: "topup_bonus_rule",
        entityId: id,
        entityLabel: `${before.triggerAmount} -> ${before.bonusPoints}`,
        before: {
          triggerAmount: before.triggerAmount,
          bonusPoints: before.bonusPoints,
          isActive: before.isActive,
        },
        details: "Deleted a top-up bonus rule; top-up history remains unchanged",
        ...getAdminAuditRequestContext(request),
      });
      return NextResponse.json({ success: true, deleted: true });
    }

    await archiveTopupBonusRule(siteId, id, authorization.user.id);
    await recordAdminAuditEvent({
      actor: authorization.user,
      action: "TOPUP_BONUS_RULE_ARCHIVE",
      category: "finance",
      severity: "high",
      entityType: "topup_bonus_rule",
      entityId: id,
      entityLabel: `${before.triggerAmount} -> ${before.bonusPoints}`,
      before: {
        triggerAmount: before.triggerAmount,
        bonusPoints: before.bonusPoints,
        isActive: before.isActive,
      },
      after: { isActive: false },
      details: "Archived a top-up bonus rule without deleting its audit history",
      ...getAdminAuditRequestContext(request),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (isTopupBonusSchemaUnavailable(error)) return schemaUnavailableResponse();
    console.error("Error archiving top-up bonus rule:", error);
    return NextResponse.json(
      { message: permanentlyDelete ? "ไม่สามารถลบกติกาโบนัสเติมเงินได้" : "ไม่สามารถปิดใช้งานกติกาโบนัสเติมเงินได้" },
      { status: 500 }
    );
  }
}
