import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/server";
import { isAdminUser } from "@/lib/auth/roles";
import { getSiteId } from "@/lib/site";
import {
  countUnreadSupportCaseNotifications,
  getUnreadSupportCaseNotifications,
  markSupportCaseNotificationRead,
} from "@/lib/support/notifications";

const markReadSchema = z.object({
  caseId: z.string().trim().min(1).max(128),
});

function noStoreJson(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return response;
}

function getNotificationScope() {
  const siteId = getSiteId();
  // The main-site admin is the central operator and already sees all support
  // cases in the existing admin table. Child-site admins remain tenant-scoped.
  return siteId === "main" ? undefined : { siteId };
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return noStoreJson({ message: "Unauthorized" }, 401);
    if (!isAdminUser(user)) return noStoreJson({ message: "Forbidden" }, 403);

    const scope = getNotificationScope();
    const [notifications, unreadCount] = await Promise.all([
      getUnreadSupportCaseNotifications(user.id, scope),
      countUnreadSupportCaseNotifications(user.id, scope),
    ]);

    return noStoreJson({
      ok: true,
      notifications,
      unreadCount,
      meta: {
        limit: 20,
        onlyPendingCases: true,
        timeZone: "Asia/Bangkok",
      },
    });
  } catch (error) {
    console.error(
      "Error loading support case notifications",
      error instanceof Error ? error.message : "unknown error",
    );
    return noStoreJson({ message: "Unable to load support case notifications" }, 503);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return noStoreJson({ message: "Unauthorized" }, 401);
    if (!isAdminUser(user)) return noStoreJson({ message: "Forbidden" }, 403);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return noStoreJson({ message: "รูปแบบข้อมูลไม่ถูกต้อง" }, 400);
    }

    const parsed = markReadSchema.safeParse(body);
    if (!parsed.success) {
      return noStoreJson({ message: "กรุณาระบุเคสที่ต้องการอ่าน" }, 400);
    }

    const marked = await markSupportCaseNotificationRead(
      user.id,
      parsed.data.caseId,
      getNotificationScope(),
    );
    if (!marked) return noStoreJson({ message: "ไม่พบเคสแจ้งปัญหา" }, 404);

    return noStoreJson({ ok: true, notification: marked });
  } catch (error) {
    console.error(
      "Error marking support case notification as read",
      error instanceof Error ? error.message : "unknown error",
    );
    return noStoreJson({ message: "Unable to mark support case notification as read" }, 503);
  }
}
