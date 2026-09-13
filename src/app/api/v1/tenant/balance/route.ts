import { NextResponse } from "next/server";
import { validateApiKey } from "@/lib/auth/api-key";
import pool from "@/lib/mysql";

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

export async function GET(request: Request) {
  try {
    const tenant = await validateApiKey();
    
    if (!tenant) {
      return NextResponse.json(
        { success: false, message: "Unauthorized: Invalid or missing API Key" },
        { status: 401, headers: corsHeaders() }
      );
    }

    if (tenant.is_site_suspended) {
      return NextResponse.json(
        { success: false, message: "Site is suspended" },
        { status: 403, headers: corsHeaders() }
      );
    }

    const [rows] = await pool.query(
      "SELECT points FROM users WHERE id = ? LIMIT 1",
      [tenant.user_id]
    );

    const users = rows as any[];
    if (users.length === 0) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404, headers: corsHeaders() }
      );
    }

    const balance = parseFloat(users[0].points || 0);

    return NextResponse.json({
      success: true,
      balance,
    }, { headers: corsHeaders() });

  } catch (error) {
    console.error("Error fetching tenant balance:", error);
    return NextResponse.json(
      { success: false, message: "Internal Server Error" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
