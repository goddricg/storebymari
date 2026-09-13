import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { getVapidPublicKey } from "@/lib/push/vapid";
import { isSubscriptionActive, getUserSubscriptions } from "@/lib/push/repository";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const vapidPublicKey = getVapidPublicKey();

    if (!user) {
      return NextResponse.json({
        ok: true,
        authenticated: false,
        vapidPublicKey,
        isSubscribed: false,
      });
    }

    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get("endpoint");

    let isSubscribed = false;
    if (endpoint) {
      isSubscribed = await isSubscriptionActive(user.id, endpoint);
    } else {
      const existing = await getUserSubscriptions(user.id);
      isSubscribed = existing.length > 0;
    }

    return NextResponse.json({
      ok: true,
      authenticated: true,
      role: user.role,
      vapidPublicKey,
      isSubscribed,
    });
  } catch (error: any) {
    console.error("[Push Status] Error:", error);
    return NextResponse.json(
      { ok: false, message: error?.message || "Failed to check status" },
      { status: 500 },
    );
  }
}
