import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/auth/api-key";
import { findSupportCasesByCodesAndUser } from "@/lib/support/repository";
import { z } from "zod";

const bulkSchema = z.object({
  caseCodes: z.array(z.string()).min(1, "กรุณาระบุรหัสเคสอย่างน้อย 1 รายการ").max(100, "ระบุรหัสเคสได้สูงสุด 100 รายการต่อครั้ง"),
});

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function POST(request: NextRequest) {
  try {
    // 1. ตรวจสอบ API Key
    const auth = await validateApiKey();
    if (!auth) {
      return NextResponse.json(
        { ok: false, message: "Unauthorized: Invalid or missing API Key" },
        { status: 401, headers: corsHeaders() }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, message: "ไม่สามารถอ่านข้อมูลจากคำขอได้" },
        { status: 400, headers: corsHeaders() }
      );
    }

    const validated = bulkSchema.parse(body);

    // ดึงข้อมูลสถานะเคสทีละหลายๆ อัน
    const cases = await findSupportCasesByCodesAndUser(validated.caseCodes, auth.user_id);

    // สร้าง response array ตามข้อมูลที่เจอ
    const result = cases.map((c) => ({
      caseCode: c.caseCode,
      status: c.status,
      adminResponse: c.adminResponse,
      updatedAt: c.updatedAt,
    }));

    return NextResponse.json({
      success: true,
      ok: true,
      cases: result,
    }, { headers: corsHeaders() });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, message: error.issues[0]?.message || "ข้อมูลไม่ถูกต้อง" },
        { status: 400, headers: corsHeaders() }
      );
    }

    const message = error instanceof Error ? error.message : "ไม่สามารถตรวจสอบเคสได้";
    return NextResponse.json({ ok: false, message }, { status: 500, headers: corsHeaders() });
  }
}
