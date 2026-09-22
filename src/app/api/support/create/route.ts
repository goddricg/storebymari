import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server";
import { createSupportCase } from "@/lib/support/repository";
import {
  forwardSupportCaseToCenter,
  getStoreNameForCenter,
} from "@/lib/support/center-forwarding";
import { z } from "zod";

const createSchema = z.object({
  orderId: z.string().nullable().optional(),
  productName: z.string().nullable().optional(),
  productTypeId: z.string().nullable().optional(),
  accountEmail: z.string().nullable().optional(),
  accountPassword: z.string().nullable().optional(),
  expirationDate: z.string().nullable().optional(),
  caseType: z.enum(["screen", "account"]).default("account"),
  screenNumber: z.string().nullable().optional(),
  problemDescription: z.string().min(1, "กรุณาระบุปัญหาที่พบ"),
  claimIteration: z.number().int().optional(),
  previousCaseId: z.string().nullable().optional(),
  isDisputed: z.boolean().optional(),
  disputeReason: z.string().nullable().optional(),
  verifiedWarrantyStatus: z.string().nullable().optional(),
  verifiedRemainingDays: z.number().nullable().optional(),
  attachmentUrls: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();

    const validated = createSchema.parse(body);
    const shopName = await getStoreNameForCenter();

    const caseData = await createSupportCase({
      ...validated,
      orderId: validated.orderId ?? null,
      productName: validated.productName ?? null,
      productTypeId: validated.productTypeId ?? null,
      accountEmail: validated.accountEmail ?? null,
      accountPassword: validated.accountPassword ?? null,
      expirationDate: validated.expirationDate ?? null,
      screenNumber: validated.screenNumber ?? null,
      claimIteration: validated.claimIteration || 1,
      previousCaseId: validated.previousCaseId ?? null,
      isDisputed: Boolean(validated.isDisputed),
      disputeReason: validated.disputeReason ?? null,
      verifiedWarrantyStatus: validated.verifiedWarrantyStatus ?? null,
      verifiedRemainingDays: validated.verifiedRemainingDays ?? null,
      attachmentUrls: validated.attachmentUrls || [],
      shopName,
    }, user.id);

    let centerForwarded = false;
    let centerCaseCode: string | null = null;
    try {
      const forwarded = await forwardSupportCaseToCenter(caseData);
      centerForwarded = forwarded.status === "sent";
      centerCaseCode = forwarded.remoteCaseCode;
    } catch (error) {
      // The local case is already persisted. Keep the customer's report
      // successful and expose a retryable state to Admin instead of creating
      // a duplicate local case when the central API is temporarily offline.
      console.error("[Support Center] Failed to forward new support case", {
        caseId: caseData.id,
        caseCode: caseData.caseCode,
        code: error instanceof Error ? error.name : "unknown",
      });
    }

    return NextResponse.json({
      ok: true,
      message: centerForwarded
        ? "ระบบได้รับข้อมูลแล้ว และส่งเรื่องให้ศูนย์กลางเรียบร้อยค่ะ"
        : "ระบบได้รับข้อมูลแล้ว ทีมงานจะตรวจสอบให้เร็วที่สุดค่ะ",
      case: {
        id: caseData.id,
        caseCode: caseData.caseCode,
      },
      center: {
        status: centerForwarded ? "sent" : "failed",
        caseCode: centerCaseCode,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, message: error.issues[0]?.message || "ข้อมูลไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "ไม่สามารถสร้างเคสได้";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

