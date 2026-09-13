import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { getSettingValue, updateSetting } from "@/lib/settings/repository";
import { generateMimiRestockCopy, generateMimiPromoCopy } from "@/lib/ai/mimi-generator";
import {
  getDailyPromoSchedule,
  generateDailyPromoSchedule,
  triggerNextPromoQueueNow,
  processDuePromoBroadcasts,
} from "@/lib/ai/mimi-promo-scheduler";

export async function GET() {
  const me = await getCurrentUser();
  const isAdmin = me?.role === "superadmin" || me?.role === "admin" || me?.isAdmin;
  if (!me || !isAdmin) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const enabledVal = await getSettingValue("mimi_autopilot_enabled");
  const promoEnabledVal = await getSettingValue("mimi_promo_scheduler_enabled");
  const quotaVal = await getSettingValue("mimi_promo_times_per_product");

  const enabled = enabledVal !== "false";
  const promoEnabled = promoEnabledVal !== "false";
  const timesPerProduct = Math.max(1, parseInt(quotaVal || "2", 10));

  const schedule = await getDailyPromoSchedule();

  return NextResponse.json({
    enabled,
    promoEnabled,
    timesPerProduct,
    model: "gemini-3.6-flash",
    schedule,
  });
}

export async function POST(request: Request) {
  const me = await getCurrentUser();
  const isAdmin = me?.role === "superadmin" || me?.role === "admin" || me?.isAdmin;
  if (!me || !isAdmin) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();

    // Handle test generation (Refill style)
    if (body.action === "test_generate") {
      const productName = body.productName || "Netflix 4K Ultra HD (30 วัน)";
      const amount = Number(body.amount) || 20;
      const remainingStock = Number(body.remainingStock) || 25;

      const copy = await generateMimiRestockCopy({
        productName,
        amount,
        remainingStock,
      });

      return NextResponse.json({
        success: true,
        copy,
      });
    }

    // Handle test promo generation (Promotional & sales hype style)
    if (body.action === "test_promo_generate") {
      const productName = body.productName || "Netflix 4K Ultra HD (30 วัน)";
      const remainingStock = Number(body.remainingStock) || 19;
      const price = body.price || 115;

      const copy = await generateMimiPromoCopy({
        productName,
        remainingStock,
        price,
      });

      return NextResponse.json({
        success: true,
        copy,
      });
    }

    // Handle toggle instant autopilot status
    if (typeof body.enabled === "boolean" && !body.action) {
      await updateSetting("mimi_autopilot_enabled", body.enabled ? "true" : "false");
      return NextResponse.json({
        success: true,
        enabled: body.enabled,
      });
    }

    // Handle toggle autonomous promo scheduler
    if (body.action === "toggle_promo") {
      const isEnabled = Boolean(body.enabled);
      await updateSetting("mimi_promo_scheduler_enabled", isEnabled ? "true" : "false");
      const schedule = await getDailyPromoSchedule();
      return NextResponse.json({
        success: true,
        promoEnabled: isEnabled,
        schedule,
      });
    }

    // Handle setting quota per product per day
    if (body.action === "set_quota") {
      const quota = Math.max(1, Math.min(5, parseInt(body.quota || "2", 10)));
      await updateSetting("mimi_promo_times_per_product", String(quota));
      const schedule = await generateDailyPromoSchedule({ force: true, timesPerProduct: quota });
      return NextResponse.json({
        success: true,
        timesPerProduct: quota,
        schedule,
      });
    }

    // Handle regenerating schedule
    if (body.action === "regenerate_schedule") {
      const quotaVal = await getSettingValue("mimi_promo_times_per_product");
      const quota = Math.max(1, parseInt(quotaVal || "2", 10));
      const schedule = await generateDailyPromoSchedule({ force: true, timesPerProduct: quota });
      return NextResponse.json({
        success: true,
        schedule,
      });
    }

    // Handle trigger next queue item now
    if (body.action === "trigger_next") {
      const result = await triggerNextPromoQueueNow();
      const schedule = await getDailyPromoSchedule();
      return NextResponse.json({
        success: result.success,
        message: result.message,
        slot: result.slot,
        schedule,
      });
    }

    // Handle process due
    if (body.action === "process_due") {
      const result = await processDuePromoBroadcasts();
      const schedule = await getDailyPromoSchedule();
      return NextResponse.json({
        success: true,
        processedCount: result.processedCount,
        schedule,
      });
    }

    return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
  } catch (error: any) {
    console.error("[Mimi Autopilot API Error]:", error);
    return NextResponse.json(
      { message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

