import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { getSiteId } from "@/lib/site";
import {
  getUserNotifications,
  countUnreadNotifications,
  countUnreadCustomerResolvedCases,
  type UserNotification,
} from "@/lib/notifications/repository";
import { getRecentBroadcasts } from "@/lib/push/broadcast";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const siteId = getSiteId();
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "25", 10);

    if (!user) {
      // For guest visitors, return recent public broadcasts (Mimi AI Auto-Pilot & Admin announcements)
      const broadcasts = await getRecentBroadcasts(siteId, limit);
      const publicBroadcasts = broadcasts.filter(
        (b) => b.target === "ALL" || b.target === "USER",
      );

      const guestNotifications: UserNotification[] = publicBroadcasts.map((b) => ({
        id: b.id,
        userId: "guest",
        siteId: b.siteId,
        type: "broadcast",
        title: b.title,
        message: b.body,
        linkUrl: b.url || "/",
        referenceId: b.id,
        isRead: false,
        readAt: null,
        createdAt: new Date(b.createdAt).toISOString(),
        updatedAt: new Date(b.createdAt).toISOString(),
      }));

      return NextResponse.json({
        ok: true,
        isGuest: true,
        notifications: guestNotifications,
        unreadCount: guestNotifications.length,
        unreadResolvedCount: 0,
      });
    }

    const [notifications, unreadCount, unreadResolvedCount] = await Promise.all([
      getUserNotifications(user.id, siteId, limit),
      countUnreadNotifications(user.id, siteId),
      countUnreadCustomerResolvedCases(user.id, siteId),
    ]);

    return NextResponse.json({
      ok: true,
      notifications,
      unreadCount,
      unreadResolvedCount,
    });
  } catch (error: any) {
    console.error("[GET /api/notifications error]:", error);
    return NextResponse.json(
      { ok: false, message: error?.message || "ไม่สามารถโหลดการแจ้งเตือนได้" },
      { status: 500 },
    );
  }
}
