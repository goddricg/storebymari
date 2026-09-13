import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { getSiteId } from "@/lib/site";
import {
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "@/lib/notifications/repository";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: true, isGuest: true, message: "Guest read marked" });
    }

    const body = await request.json().catch(() => ({}));
    const { id, all } = body;
    const siteId = getSiteId();

    if (all) {
      await markAllNotificationsAsRead(user.id, siteId);
      return NextResponse.json({ ok: true, message: "อ่านการแจ้งเตือนทั้งหมดแล้ว" });
    }

    if (id && typeof id === "string") {
      await markNotificationAsRead(user.id, id);
      return NextResponse.json({ ok: true, message: "อ่านการแจ้งเตือนแล้ว" });
    }

    return NextResponse.json(
      { ok: false, message: "กรุณาระบุ id หรือ all: true" },
      { status: 400 },
    );
  } catch (error: any) {
    console.error("[POST /api/notifications/read error]:", error);
    return NextResponse.json(
      { ok: false, message: error?.message || "ไม่สามารถอัปเดตสถานะการอ่านได้" },
      { status: 500 },
    );
  }
}
