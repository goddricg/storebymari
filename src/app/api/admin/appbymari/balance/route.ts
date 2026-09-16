import { NextResponse } from "next/server";

import { requireSuperAdmin } from "@/lib/auth/server";
import { getSiteId } from "@/lib/site";
import { fetchAppByMariBalance, getAppByMariProvider } from "@/lib/appbymari/client";

function noStoreJson(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return response;
}

export async function GET() {
  try {
    await requireSuperAdmin();
    if (getSiteId() !== "main") return noStoreJson({ message: "เมนูนี้ใช้งานได้เฉพาะร้านหลัก" }, 403);
    const provider = await getAppByMariProvider();
    if (!provider?.isActive || !provider.apiKey) {
      return noStoreJson({ success: false, message: "ยังไม่ได้เชื่อมต่อ AppByMari" }, 400);
    }
    const masterPoint = await fetchAppByMariBalance({ provider });
    return noStoreJson({ success: true, masterPoint });
  } catch {
    return noStoreJson({ success: false, message: "ไม่สามารถดึง Master Point จาก AppByMari ได้" }, 502);
  }
}
