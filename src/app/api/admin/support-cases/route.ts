import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/server";
import { getSiteId } from "@/lib/site";
import { findSupportCaseById, getAllSupportCases, getAllSupportCasesPaginated, updateSupportCase, claimSupportCase } from "@/lib/support/repository";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";
import { createUserNotification } from "@/lib/notifications/repository";
import { dispatchNotificationToUser } from "@/lib/push/dispatch";
import { z } from "zod";

const updateSchema = z.object({
  status: z.enum(["pending", "in_progress", "resolved"]).optional(),
  adminNote: z.string().nullable().optional(),
  adminResponse: z.string().nullable().optional(),
  handledById: z.string().nullable().optional(),
  handledByName: z.string().nullable().optional(),
});

function getAdminSupportSiteScope() {
  const siteId = getSiteId();
  return siteId === "main" ? undefined : siteId;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    
    // If requesting single case by ID, return with attachments
    if (id) {
      const { findSupportCaseById } = await import("@/lib/support/repository");
      const caseData = await findSupportCaseById(id, getAdminSupportSiteScope());
      if (!caseData) {
        return NextResponse.json({ ok: false, message: "ไม่พบเคส" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, case: caseData });
    }

    const status = searchParams.get("status");
    const productTypeId = searchParams.get("productTypeId");
    const caseType = searchParams.get("caseType");
    const searchEmail = searchParams.get("searchEmail");
    const searchCaseCode = searchParams.get("searchCaseCode");
    const pagination = searchParams.get("pagination");
    const page = searchParams.get("page");
    const limit = searchParams.get("limit");

    // Use pagination if requested
    if (pagination === "true") {
      const pageNum = page ? parseInt(page, 10) : 1;
      const limitNum = limit ? parseInt(limit, 10) : 50;

      const result = await getAllSupportCasesPaginated(
        {
          status: status || undefined,
          productTypeId: productTypeId || undefined,
          caseType: caseType || undefined,
          searchEmail: searchEmail || undefined,
          searchCaseCode: searchCaseCode || undefined,
          siteId: getAdminSupportSiteScope(),
        },
        {
          page: pageNum,
          limit: limitNum,
          includeAttachments: false, // Don't load attachments for list view
        }
      );

      return NextResponse.json({
        ok: true,
        cases: result.cases,
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
      });
    }

    // Fallback to non-paginated for backward compatibility
    const cases = await getAllSupportCases({
      status: status || undefined,
      productTypeId: productTypeId || undefined,
      caseType: caseType || undefined,
      searchEmail: searchEmail || undefined,
      searchCaseCode: searchCaseCode || undefined,
      siteId: getAdminSupportSiteScope(),
    });

    return NextResponse.json({ ok: true, cases });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถดึงข้อมูลเคสได้";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const me = await requireAdmin();

    const body = await request.json();
    const { id, action, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { ok: false, message: "กรุณาระบุ ID ของเคส" },
        { status: 400 }
      );
    }

    const supportSiteScope = getAdminSupportSiteScope();
    const adminName = me.displayName || me.email?.split("@")[0] || "Admin";

    if (action === "claim") {
      const claimResult = await claimSupportCase(id, { id: me.id, name: adminName }, supportSiteScope);
      if (claimResult.success && claimResult.claimedByMe) {
        await recordAdminAuditEvent({
          actor: me,
          action: "SUPPORT_CASE_CLAIM",
          category: "support",
          severity: "low",
          entityType: "support_case",
          entityId: id,
          entityLabel: id,
          before: { status: "pending" },
          after: { status: "in_progress", handledByName: adminName },
          details: `Admin ${adminName} claimed support case`,
          ...getAdminAuditRequestContext(request),
        });
      }
      return NextResponse.json({
        ok: true,
        ...claimResult,
      });
    }

    const validated = updateSchema.parse(updates);
    const previousCase = await findSupportCaseById(id, supportSiteScope);

    // If resolving or case does not have handledByName, assign current admin
    const shouldAssignAdmin = !previousCase?.handledByName || validated.status === "resolved";
    const finalUpdates = {
      ...validated,
      handledById: validated.handledById !== undefined 
        ? validated.handledById 
        : (shouldAssignAdmin ? me.id : undefined),
      handledByName: validated.handledByName !== undefined 
        ? validated.handledByName 
        : (shouldAssignAdmin ? adminName : undefined),
      handledAt: shouldAssignAdmin ? new Date() : undefined,
    };

    const updatedCase = await updateSupportCase(id, finalUpdates, supportSiteScope);

    // Notify customer via DB Notification and Web Push
    if (previousCase?.userId) {
      const isResolvedNow = validated.status === "resolved" && previousCase.status !== "resolved";
      const hasNewAdminResponse = Boolean(
        validated.adminResponse &&
        validated.adminResponse.trim() !== (previousCase.adminResponse || "").trim()
      );

      if (isResolvedNow) {
        createUserNotification({
          userId: previousCase.userId,
          siteId: previousCase.siteId || supportSiteScope || "main",
          type: "support_resolved",
          title: `✨ เคสปัญหาได้รับการแก้ไขแล้ว: ${previousCase.caseCode}`,
          message: `แอดมินแก้ไขปัญหาสำหรับเคส ${previousCase.caseCode}${previousCase.productName ? ` (${previousCase.productName})` : ""} เรียบร้อยแล้ว [คลิกเพื่ออ่าน]`,
          linkUrl: `/support/history?caseId=${encodeURIComponent(previousCase.id)}`,
          referenceId: previousCase.id,
        }).catch((err) => console.error("[Support Case] Failed to create user notification:", err));

        dispatchNotificationToUser({
          userId: previousCase.userId,
          title: `✨ เคสปัญหาได้รับการแก้ไขแล้ว: ${previousCase.caseCode}`,
          body: `แอดมินแก้ไขปัญหาสำหรับเคส ${previousCase.caseCode} เรียบร้อยแล้ว [คลิกเพื่ออ่าน]`,
          url: `/support/history?caseId=${encodeURIComponent(previousCase.id)}`,
          soundType: "case_resolved",
          tag: `support-case-${previousCase.caseCode}`,
        }).catch((err) => console.error("[Support Case] Failed to dispatch push notification:", err));
      } else if (hasNewAdminResponse) {
        const responseSnippet = (validated.adminResponse || "").trim().slice(0, 80);
        createUserNotification({
          userId: previousCase.userId,
          siteId: previousCase.siteId || supportSiteScope || "main",
          type: "support_reply",
          title: "✨ แอดมินตอบกลับเคสปัญหาของคุณแล้ว",
          message: `เคส ${previousCase.caseCode}: ${(validated.adminResponse || "").trim()} [คลิกเพื่ออ่าน]`,
          linkUrl: `/support/history?caseId=${encodeURIComponent(previousCase.id)}`,
          referenceId: previousCase.id,
        }).catch((err) => console.error("[Support Case] Failed to create user notification:", err));

        dispatchNotificationToUser({
          userId: previousCase.userId,
          title: "✨ แอดมินตอบกลับเคสปัญหาของคุณแล้ว",
          body: `เคส ${previousCase.caseCode}: ${responseSnippet} [คลิกเพื่ออ่าน]`,
          url: `/support/history?caseId=${encodeURIComponent(previousCase.id)}`,
          soundType: "case_resolved",
          tag: `support-case-${previousCase.caseCode}`,
        }).catch((err) => console.error("[Support Case] Failed to dispatch push notification:", err));
      }
    }

    await recordAdminAuditEvent({
      actor: me,
      action: "SUPPORT_CASE_UPDATE",
      category: "support",
      severity: validated.status === "resolved" ? "medium" : "low",
      entityType: "support_case",
      entityId: id,
      entityLabel: id,
      before: {
        status: previousCase?.status ?? null,
        hasAdminNote: Boolean(previousCase && "adminNote" in previousCase && previousCase.adminNote),
        hasAdminResponse: Boolean(previousCase && "adminResponse" in previousCase && previousCase.adminResponse),
      },
      after: {
        status: updatedCase?.status ?? validated.status ?? previousCase?.status ?? null,
        hasAdminNote: Boolean(validated.adminNote),
        hasAdminResponse: Boolean(validated.adminResponse),
      },
      details: "Updated a support case without copying customer content into the audit log",
      ...getAdminAuditRequestContext(request),
    });

    return NextResponse.json({
      ok: true,
      message: "อัปเดตเคสสำเร็จ",
      case: updatedCase,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, message: error.issues[0]?.message || "ข้อมูลไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "ไม่สามารถอัปเดตเคสได้";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
