import { NextResponse } from "next/server";

import {
  isTopupBonusSchemaUnavailable,
  listTopupBonusRules,
} from "@/lib/topup/bonus-repository";
import { roundTopupPoints } from "@/lib/topup/bonus";
import { getSiteId } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rules = await listTopupBonusRules(getSiteId(), { activeOnly: true });
    const response = NextResponse.json({
      rules: rules.map((rule) => ({
        id: rule.id,
        triggerAmount: rule.triggerAmount,
        bonusPoints: rule.bonusPoints,
        creditedPoints: roundTopupPoints(rule.triggerAmount + rule.bonusPoints),
      })),
    });
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  } catch (error) {
    // Keep the customer top-up page usable during a staged migration. The
    // central credit path still requires the new columns before bonuses work.
    if (isTopupBonusSchemaUnavailable(error)) {
      return NextResponse.json(
        { rules: [] },
        { headers: { "Cache-Control": "private, no-store, max-age=0" } }
      );
    }
    console.error("Error loading public top-up bonus rules:", error);
    return NextResponse.json({ message: "ไม่สามารถโหลดโบนัสเติมเงินได้" }, { status: 500 });
  }
}
