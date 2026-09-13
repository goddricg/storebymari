import { NextRequest, NextResponse } from "next/server";
import { findSupportCaseByCode } from "@/lib/support/repository";
import { z } from "zod";

const checkSchema = z.object({
  caseCode: z.string().min(1, "กรุณาระบุรหัสเคส"),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const caseCode = searchParams.get("caseCode");

    if (!caseCode) {
      return NextResponse.json(
        { ok: false, message: "กรุณาระบุรหัสเคส" },
        { status: 400 }
      );
    }

    const caseData = await findSupportCaseByCode(caseCode);

    if (!caseData) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบเคสที่ระบุ" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      case: {
        caseCode: caseData.caseCode,
        status: caseData.status,
        adminResponse: caseData.adminResponse,
        createdAt: caseData.createdAt,
        updatedAt: caseData.updatedAt,
        productName: caseData.productName,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถตรวจสอบเคสได้";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

