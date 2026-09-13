import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/auth/api-key";
import { createSupportCase, getAllSupportCasesPaginated } from "@/lib/support/repository";
import { z } from "zod";

const createSchema = z.object({
  orderId: z.string().nullable().optional(),
  productName: z.string().nullable().optional(),
  productTypeId: z.string().nullable().optional(),
  accountEmail: z.string().email().nullable().optional(),
  accountPassword: z.string().nullable().optional(),
  expirationDate: z.string().nullable().optional(),
  caseType: z.enum(["screen", "account"]),
  screenNumber: z.string().nullable().optional(),
  problemDescription: z.string().min(1, "กรุณาระบุปัญหาที่พบ"),
  shopName: z.string().nullable().optional(),
});

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(request: NextRequest) {
  try {
    // 1. ตรวจสอบ API Key
    const auth = await validateApiKey();
    if (!auth) {
      return NextResponse.json(
        { ok: false, message: "Unauthorized: Invalid or missing API Key" },
        { status: 401, headers: corsHeaders() }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = searchParams.get("page") ? parseInt(searchParams.get("page")!, 10) : 1;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 50;
    const status = searchParams.get("status") || undefined;
    const caseType = searchParams.get("caseType") || undefined;
    const searchCaseCode = searchParams.get("searchCaseCode") || undefined;

    const productTypeId = searchParams.get("productTypeId") || undefined;
    const searchEmail = searchParams.get("searchEmail") || undefined;

    const result = await getAllSupportCasesPaginated(
      {
        status,
        caseType,
        searchCaseCode,
        productTypeId,
        searchEmail,
        userId: auth.user_id,
      },
      {
        page,
        limit,
        includeAttachments: false,
      }
    );

    return NextResponse.json({
      success: true,
      ok: true,
      cases: result.cases,
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    }, { headers: corsHeaders() });

  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถดึงข้อมูลเคสได้";
    return NextResponse.json({ ok: false, message }, { status: 500, headers: corsHeaders() });
  }
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

    const { user_id } = auth;
    let body: unknown;
    
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, message: "ไม่สามารถอ่านข้อมูลจากคำขอได้" },
        { status: 400, headers: corsHeaders() }
      );
    }

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
      shopName: validated.shopName ?? null,
    }, user_id);

    return NextResponse.json({
      success: true,
      ok: true,
      message: "ระบบได้รับข้อมูลแล้ว ตัวแทนจะตรวจสอบให้เร็วที่สุดค่ะ",
      case: {
        id: caseData.id,
        caseCode: caseData.caseCode,
      },
    }, { headers: corsHeaders() });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, message: error.issues[0]?.message || "ข้อมูลไม่ถูกต้อง" },
        { status: 400, headers: corsHeaders() }
      );
    }

    const message = error instanceof Error ? error.message : "ไม่สามารถสร้างเคสได้";
    return NextResponse.json({ ok: false, message }, { status: 500, headers: corsHeaders() });
  }
}
