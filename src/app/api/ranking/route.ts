import { NextResponse } from "next/server";

import { getRankingSnapshot } from "@/lib/ranking/repository";
import { getSiteId } from "@/lib/site";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  if (getSiteId() !== "main") {
    return NextResponse.json(
      { success: false, message: "Ranking is not enabled for this site" },
      { status: 404, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  try {
    const snapshot = await getRankingSnapshot();
    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Ranking API error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { message: "Ranking is temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
