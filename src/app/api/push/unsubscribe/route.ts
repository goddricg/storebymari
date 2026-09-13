import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/server";
import { deletePushSubscription } from "@/lib/push/repository";

const unsubscribeSchema = z.object({
  endpoint: z.string().url("Invalid push endpoint"),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = unsubscribeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: parsed.error.issues[0]?.message || "Invalid payload" },
        { status: 400 },
      );
    }

    const { endpoint } = parsed.data;
    const removed = await deletePushSubscription(endpoint);

    return NextResponse.json({
      ok: true,
      message: removed ? "Unsubscribed successfully" : "Subscription not found",
    });
  } catch (error: any) {
    console.error("[Push Unsubscribe] Error:", error);
    return NextResponse.json(
      { ok: false, message: error?.message || "Failed to unsubscribe" },
      { status: 500 },
    );
  }
}
