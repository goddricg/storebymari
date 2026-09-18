import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { isAdminUser } from "@/lib/auth/roles";
import { getUserSubscriptions } from "@/lib/push/repository";
import { sendPushNotification } from "@/lib/push/dispatch";
import { SITE_BRAND_PWA_BADGE_PATH, SITE_BRAND_PWA_ICON_192_PATH } from "@/lib/site-branding";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }
    if (!isAdminUser(user)) {
      return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const subscriptions = await getUserSubscriptions(user.id);

    if (subscriptions.length === 0) {
      return NextResponse.json({
        ok: false,
        message: "ไม่พบข้อมูลการเปิดรับแจ้งเตือนของอุปกรณ์นี้ กรุณากด 'เปิดรับแจ้งเตือนบนมือถือ' ก่อนทดสอบ",
      }, { status: 400 });
    }

    // If specific endpoint requested, filter for it
    const targetSubs = body.endpoint
      ? subscriptions.filter((s) => s.endpoint === body.endpoint)
      : subscriptions;

    const testPayload = {
      title: "🔔 ทดสอบแจ้งเตือน Store By Mari",
      body: `ระบบ Web Push แจ้งเตือนเคสปัญหาพร้อมใช้งานแล้ว! เวลา ${new Date().toLocaleTimeString("th-TH")}`,
      icon: SITE_BRAND_PWA_ICON_192_PATH,
      badge: SITE_BRAND_PWA_BADGE_PATH,
      tag: "test-push-" + Date.now(),
      url: "/admin?menu=support",
      data: {
        test: true,
        sentAt: Date.now(),
      },
    };

    let sent = 0;
    let failed = 0;

    for (const sub of targetSubs) {
      const result = await sendPushNotification(sub, testPayload);
      if (result.success) {
        sent++;
      } else {
        failed++;
      }
    }

    return NextResponse.json({
      ok: true,
      message: `ส่งการแจ้งเตือนทดสอบสำเร็จ ${sent} รายการ (ล้มเหลว ${failed})`,
      sent,
      failed,
      total: targetSubs.length,
    });
  } catch (error: any) {
    console.error("[Push Test] Error:", error);
    return NextResponse.json(
      { ok: false, message: error?.message || "Test push failed" },
      { status: 500 },
    );
  }
}
