import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/auth/api-key";
import {
  findSupportCaseByCodeAndUser,
  updateSupportCase,
} from "@/lib/support/repository";
import { z } from "zod";

const updateSchema = z.object({
  status: z.enum(["pending", "resolved"]).optional(),
  adminNote: z.string().nullable().optional(),
  adminResponse: z.string().nullable().optional(),
});

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caseCode: string }> }
) {
  try {
    // 1. ตรวจสอบ API Key
    const auth = await validateApiKey();
    if (!auth) {
      return NextResponse.json(
        { ok: false, message: "Unauthorized: Invalid or missing API Key" },
        { status: 401, headers: corsHeaders() }
      );
    }

    const { caseCode } = await params;

    if (!caseCode) {
      return NextResponse.json(
        { ok: false, message: "กรุณาระบุรหัสเคส" },
        { status: 400, headers: corsHeaders() }
      );
    }

    const caseData = await findSupportCaseByCodeAndUser(caseCode, auth.user_id);

    if (!caseData) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบเคสที่ระบุ" },
        { status: 404, headers: corsHeaders() }
      );
    }

    // Return the support case data
    return NextResponse.json({
      success: true,
      ok: true,
      case: {
        caseCode: caseData.caseCode,
        status: caseData.status,
        adminResponse: caseData.adminResponse,
        createdAt: caseData.createdAt,
        updatedAt: caseData.updatedAt,
        productName: caseData.productName,
      },
    }, { headers: corsHeaders() });

  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถตรวจสอบเคสได้";
    return NextResponse.json({ ok: false, message }, { status: 500, headers: corsHeaders() });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ caseCode: string }> }
) {
  try {
    // 1. ตรวจสอบ API Key
    const auth = await validateApiKey();
    if (!auth) {
      return NextResponse.json(
        { ok: false, message: "Unauthorized: Invalid or missing API Key" },
        { status: 401, headers: corsHeaders() }
      );
    }

    const { caseCode } = await params;

    if (!caseCode) {
      return NextResponse.json(
        { ok: false, message: "กรุณาระบุรหัสเคส" },
        { status: 400, headers: corsHeaders() }
      );
    }

    // ค้นหาเคสจากรหัส
    const caseData = await findSupportCaseByCodeAndUser(caseCode, auth.user_id);
    if (!caseData) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบเคสที่ระบุ" },
        { status: 404, headers: corsHeaders() }
      );
    }

    // อนุญาตให้อัปเดตเฉพาะเคสที่เป็นของ Admin คนนี้ (หรือถ้าเป็นซุปเปอร์แอดมินก็ไม่เป็นไร แต่ในที่นี้เราผูกกับ user_id ไว้ตอนสร้าง)
    // สำหรับ V1 API ปกติเว็ปลูกควรอัปเดตเคสของตัวเองได้เท่านั้น
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, message: "ไม่สามารถอ่านข้อมูลจากคำขอได้" },
        { status: 400, headers: corsHeaders() }
      );
    }

    const validated = updateSchema.parse(body);

    const updatedCase = await updateSupportCase(caseData.id, validated);

    return NextResponse.json({
      success: true,
      ok: true,
      message: "อัปเดตข้อมูลสำเร็จ",
      case: {
        caseCode: updatedCase.caseCode,
        status: updatedCase.status,
        adminResponse: updatedCase.adminResponse,
        updatedAt: updatedCase.updatedAt,
      },
    }, { headers: corsHeaders() });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, message: error.issues[0]?.message || "ข้อมูลไม่ถูกต้อง" },
        { status: 400, headers: corsHeaders() }
      );
    }

    const message = error instanceof Error ? error.message : "ไม่สามารถอัปเดตเคสได้";
    return NextResponse.json({ ok: false, message }, { status: 500, headers: corsHeaders() });
  }
}
