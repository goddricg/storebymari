import { NextResponse } from "next/server";
import { validateApiKey } from "@/lib/auth/api-key";
import pool from "@/lib/mysql";

export async function POST(request: Request) {
  const tenant = await validateApiKey();
  
  if (!tenant) {
    return NextResponse.json({ success: false, message: "Invalid or disabled API Key" }, { status: 401 });
  }

  try {
    // Optional check DB connection
    await pool.query("SELECT 1");
    
    return NextResponse.json({
      success: true,
      message: "Connection successful",
      tenant: {
        site_name: tenant.site_name,
        connected_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error("Test connection error:", error);
    return NextResponse.json({ success: false, message: "Internal Server Error" }, { status: 500 });
  }
}
