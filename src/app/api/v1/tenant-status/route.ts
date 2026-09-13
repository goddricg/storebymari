import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/auth/api-key";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await validateApiKey();
    
    if (!auth) {
      return NextResponse.json(
        { ok: false, message: "Unauthorized: Invalid or missing API Key" },
        { status: 401, headers: corsHeaders() }
      );
    }

    return NextResponse.json({
      ok: true,
      isSuspended: auth.is_site_suspended,
    }, { headers: corsHeaders() });

  } catch (error) {
    console.error("Error fetching tenant status:", error);
    return NextResponse.json(
      { ok: false, message: "Internal Server Error" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
