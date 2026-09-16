import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/server";
import { isAdminUser } from "@/lib/auth/roles";
import { getSiteId } from "@/lib/site";
import {
  broadcastPushNotification,
  getRecentBroadcasts,
  getRecentRestockAuditEvents,
} from "@/lib/push/broadcast";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";

const broadcastSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "กรุณากรอกหัวข้อแจ้งเตือน")
    .max(100, "หัวข้อแจ้งเตือนต้องไม่เกิน 100 ตัวอักษร"),
  body: z
    .string()
    .trim()
    .min(1, "กรุณากรอกข้อความแจ้งเตือน")
    .max(2000, "ข้อความแจ้งเตือนต้องไม่เกิน 2,000 ตัวอักษร"),
  url: z.string().trim().max(500).optional().nullable(),
  target: z.enum(["ALL", "ADMIN", "USER"]).default("ALL"),
});

function isAuthorized(user: any): boolean {
  return Boolean(user) && isAdminUser(user);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!isAuthorized(user)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const siteId = getSiteId();
  try {
    const [broadcasts, recentRestocks] = await Promise.all([
      getRecentBroadcasts(siteId, 30),
      getRecentRestockAuditEvents(siteId, 20),
    ]);
    return NextResponse.json({ success: true, broadcasts, recentRestocks });
  } catch (error: any) {
    console.error("[Broadcast API GET Error]:", error);
    return NextResponse.json(
      { message: "Failed to fetch broadcasts", error: error?.message },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!isAuthorized(user)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 422 });
  }

  const parsed = broadcastSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "ข้อมูลไม่ถูกต้อง",
        errors: parsed.error.issues,
      },
      { status: 422 },
    );
  }

  const siteId = getSiteId();
  const reqContext = getAdminAuditRequestContext(request);

  try {
    const { id, dispatchResult } = await broadcastPushNotification({
      title: parsed.data.title,
      body: parsed.data.body,
      url: parsed.data.url || null,
      target: parsed.data.target,
      siteId,
      senderId: user?.id || null,
      senderEmail: user?.email || null,
      senderName: user?.displayName || "Mimi Operator",
    });

    await recordAdminAuditEvent({
      actor: user,
      action: "PUSH_BROADCAST_SENT",
      category: "notification",
      severity: "high",
      entityType: "broadcast_notification",
      entityId: id,
      entityLabel: parsed.data.title,
      after: {
        title: parsed.data.title,
        target: parsed.data.target,
        url: parsed.data.url,
        dispatchResult,
      },
      ...reqContext,
    });

    return NextResponse.json({
      success: true,
      broadcastId: id,
      dispatchResult,
    });
  } catch (error: any) {
    console.error("[Broadcast API POST Error]:", error);
    return NextResponse.json(
      {
        message: "เกิดข้อผิดพลาดในการส่ง Broadcast",
        error: error?.message || "Internal error",
      },
      { status: 500 },
    );
  }
}
