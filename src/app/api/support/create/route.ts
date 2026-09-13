import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server";
import { createSupportCase } from "@/lib/support/repository";
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
    }, user.id);

    return NextResponse.json({
      ok: true,
      message: "ระบบได้รับข้อมูลแล้ว ตัวแทนจะตรวจสอบให้เร็วที่สุดค่ะ",
      case: {
        id: caseData.id,
        caseCode: caseData.caseCode,
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

