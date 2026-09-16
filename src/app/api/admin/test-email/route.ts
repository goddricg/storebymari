import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { isAdminUser } from "@/lib/auth/roles";
import { getConfiguredEmailRecipient, sendSystemEmail } from "@/lib/email/mailer";
import { sendRestockAlertEmail } from "@/lib/email/restock-alert";

export async function POST(request: Request) {
  try {
    const me = await getCurrentUser();
    const isAdmin = isAdminUser(me);
    if (!me || !isAdmin) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    let mode = "restock";
    try {
      const body = await request.json();
      if (body?.mode) mode = body.mode;
    } catch {
      // fallback
    }

    const timestamp = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
    const recipient = getConfiguredEmailRecipient();
    if (!recipient) {
      return NextResponse.json(
        { success: false, error: "RESTOCK_ALERT_RECIPIENT is missing" },
        { status: 503 },
      );
    }

    if (mode === "simple") {
      const result = await sendSystemEmail({
        to: recipient,
        subject: `[STORE-TEST] ทดสอบระบบอีเมลเซิร์ฟเวอร์ (${timestamp})`,
        text: `สวัสดีครับ/ค่ะ,\n\nนี่คืออีเมลทดสอบการเชื่อมต่อ SMTP Server\nผู้ทดสอบ: ${me.displayName || me.email || "Admin"}\nเวลา: ${timestamp}`,
      });

      return NextResponse.json({
        success: result.success,
        messageId: result.messageId,
        recipient,
        timestamp,
        error: result.error,
      });
    }

    const result = await sendRestockAlertEmail({
      productName: "ทดสอบระบบอีเมลแจ้งเตือนสต็อก (Test Restock)",
      amount: 10,
      previousStock: 0,
      remainingStock: 10,
      actorName: me.displayName || me.email || "Mimi / Admin",
        actorEmail: me.email || "admin",
      note: `ทดสอบส่งอีเมลจากเมนู Operator By Mimi (${timestamp})`,
    });

    return NextResponse.json({
      success: result.success,
      messageId: result.messageId,
      recipient,
      timestamp,
      error: result.error,
    });
  } catch (error: any) {
    console.error("[Test Email Error]:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to send test email",
      },
      { status: 500 }
    );
  }
}
