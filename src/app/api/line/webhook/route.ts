import { after, NextRequest, NextResponse } from "next/server";
import { LINE_CHANNEL_ID, verifyLineSignature } from "@/lib/line/config";
import { handleLineWebhookEvent } from "@/lib/line/handler";

export const dynamic = "force-dynamic";

export async function GET() {
  const { resolveAdminTier, ADMIN_TIERS } = await import("@/lib/mimi/admin-tiers");
  const papaTier = resolveAdminTier("U366bbe749237c0efd4bc388958e7a299", "🦁 Zeries Sand 🦁");
  return NextResponse.json({
    status: "LINE Webhook endpoint ready for Store By Mari",
    channelId: LINE_CHANNEL_ID,
    buildId: "BUILD-2026-09-11-0130",
    papaTier: papaTier.tier,
    configuredPapaUid: ADMIN_TIERS.PAPA?.userId,
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-line-signature");

    // Verify HMAC-SHA256 signature
    if (!verifyLineSignature(rawBody, signature)) {
      console.warn("[LINE Webhook] Invalid signature received");
      return NextResponse.json(
        { success: false, error: "Invalid signature" },
        { status: 401 }
      );
    }

    const payload = JSON.parse(rawBody);
    const events = payload.events || [];

    // A LINE webhook should be acknowledged before the model/database work
    // finishes. `after` keeps the work alive after the 2xx response, avoiding
    // LINE retries and duplicate replies while MIMI performs a live read and
    // Gemini generation.
    after(async () => {
      for (const event of events) {
        try {
          await handleLineWebhookEvent(event);
        } catch (err) {
          console.error("[LINE Webhook Event Error]:", err);
        }
      }
    });

    return NextResponse.json({ success: true, processed: events.length }, { status: 200 });
  } catch (error: any) {
    console.error("[LINE Webhook Error]:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
