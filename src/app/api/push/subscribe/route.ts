import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/server";
import { getSiteId } from "@/lib/site";
import { savePushSubscription, hashEndpoint } from "@/lib/push/repository";

const subscribeSchema = z.object({
  endpoint: z.string().url("Invalid push endpoint"),
  keys: z.object({
    p256dh: z.string().min(1, "Missing p256dh key"),
    auth: z.string().min(1, "Missing auth secret"),
  }),
  userAgent: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const body = await request.json().catch(() => null);
    const parsed = subscribeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: parsed.error.issues[0]?.message || "Invalid payload" },
        { status: 400 },
      );
    }

    const { endpoint, keys, userAgent } = parsed.data;
    const siteId = getSiteId();

    // Support both registered users and anonymous/guest visitors (e.g. newly installed PWA)
    const visitorCookie = request.cookies.get("appmymari_visitor_id")?.value;
    const guestId = visitorCookie
      ? `guest_${visitorCookie.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60)}`
      : `guest_${hashEndpoint(endpoint).slice(0, 16)}`;

    const effectiveUserId = user?.id || guestId;
    const effectiveRole = user?.role || (user?.isAdmin ? "admin" : "user");

    const result = await savePushSubscription({
      userId: effectiveUserId,
      siteId,
      endpoint,
      keys,
      userAgent: userAgent || request.headers.get("user-agent") || null,
      role: effectiveRole,
    });

    return NextResponse.json({
      ok: true,
      message: "Push notification subscribed successfully",
      subscriptionId: result.id,
      isGuest: !user,
    });
  } catch (error: any) {
    console.error("[Push Subscribe] Error:", error);
    return NextResponse.json(
      { ok: false, message: error?.message || "Failed to subscribe" },
      { status: 500 },
    );
  }
}
