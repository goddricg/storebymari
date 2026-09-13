import { NextResponse } from "next/server";
import { processDuePromoBroadcasts, getDailyPromoSchedule } from "@/lib/ai/mimi-promo-scheduler";

// Cron credentials stay server-only. Reuse the private MCP secret only as a
// deployment fallback; never accept the public client variable or a default.
const CRON_SECRET = process.env.CRON_SECRET?.trim() || process.env.MCP_SECRET_KEY?.trim() || "";

function isAuthorized(request: Request): boolean {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token") || searchParams.get("key");
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7).trim() : null;

  if (token && token === CRON_SECRET) return true;
  if (bearerToken && bearerToken === CRON_SECRET) return true;
  return false;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processDuePromoBroadcasts();
    const schedule = await getDailyPromoSchedule();

    return NextResponse.json({
      success: true,
      processedCount: result.processedCount,
      triggeredSlot: result.triggeredSlot,
      reason: result.reason,
      totalSlots: schedule.totalSlots,
      pendingSlots: schedule.pendingSlots,
      completedSlots: schedule.completedSlots,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[Cron Mimi Autopilot Error]:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
