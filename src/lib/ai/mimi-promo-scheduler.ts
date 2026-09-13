import pool from "@/lib/mysql";
import { RowDataPacket } from "mysql2";
import { getSettingValue, updateSetting } from "@/lib/settings/repository";
import { getRecentRestockAuditEvents } from "@/lib/push/broadcast";
import { generateMimiPromoCopy } from "@/lib/ai/mimi-generator";
import { broadcastPushNotification } from "@/lib/push/broadcast";

export interface PromoScheduleSlot {
  id: string;
  productId: string;
  productName: string;
  scheduledTime: string; // ISO 8601 string
  timeFormatted: string; // HH:mm
  status: "pending" | "sent" | "skipped_out_of_stock" | "skipped_expired" | "failed";
  sentAt?: string;
  broadcastId?: string;
  liveStockAtTrigger?: number;
  error?: string;
}

export interface DailyPromoScheduleState {
  date: string; // YYYY-MM-DD
  timesPerProduct: number;
  enabled: boolean;
  totalSlots: number;
  completedSlots: number;
  pendingSlots: number;
  slots: PromoScheduleSlot[];
  lastRunAt?: string;
  generatedAt: string;
}

// Operating Window Constants (Asia/Bangkok)
export const QUIET_HOURS_START_MINUTES = 30;         // 00:30 (Midnight + 30m)
export const QUIET_HOURS_END_MINUTES = 8 * 60 + 30;  // 08:30 AM
export const PROMO_WINDOW_START_MINUTES = 8 * 60 + 30;// 08:30 AM
export const PROMO_WINDOW_END_MINUTES = 24 * 60;      // 00:00 (Midnight)
export const MAX_STALE_MS = 20 * 60 * 1000;          // 20 minutes expiration

/**
 * Returns Bangkok date and time components
 */
export function getBangkokTimeParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "0";
  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");
  const hour = parseInt(getPart("hour"), 10);
  const minute = parseInt(getPart("minute"), 10);
  return {
    dateStr: `${year}-${month}-${day}`,
    hour,
    minute,
    minutesOfDay: hour * 60 + minute,
  };
}

/**
 * Returns current date string in Asia/Bangkok timezone (YYYY-MM-DD)
 */
export function getBangkokDateString(date = new Date()): string {
  return getBangkokTimeParts(date).dateStr;
}

/**
 * Checks if current time is within Quiet Hours (00:30 - 08:30 Bangkok time)
 */
export function isQuietHours(date = new Date()): boolean {
  const { minutesOfDay } = getBangkokTimeParts(date);
  return minutesOfDay >= QUIET_HOURS_START_MINUTES && minutesOfDay < QUIET_HOURS_END_MINUTES;
}

/**
 * Determines the target schedule date.
 * If it's already late night (>= 23:30), roll over to tomorrow automatically.
 */
export function getTargetScheduleDate(date = new Date()): string {
  const { minutesOfDay } = getBangkokTimeParts(date);
  if (minutesOfDay >= 23 * 60 + 30) {
    const tomorrow = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    return getBangkokDateString(tomorrow);
  }
  return getBangkokDateString(date);
}

/**
 * Returns distinct products found in recent restock events
 */
export async function getDistinctRestockProducts(siteId = "main") {
  const events = await getRecentRestockAuditEvents(siteId, 60);
  const seen = new Map<string, {
    productId: string;
    productName: string;
    currentLiveStock: number;
    currentPrice?: string;
    isPublished?: boolean;
    lastRefilledAt: Date;
  }>();

  for (const ev of events) {
    const key = ev.productId || ev.productName;
    if (!seen.has(key)) {
      seen.set(key, {
        productId: ev.productId || key,
        productName: ev.productName,
        currentLiveStock: ev.currentLiveStock,
        currentPrice: ev.currentPrice,
        isPublished: ev.isPublished ?? true,
        lastRefilledAt: ev.occurredAt,
      });
    }
  }

  return Array.from(seen.values());
}

/**
 * Reads live stock for a product from the database
 */
export async function getLiveProductStock(productIdOrName: string, siteId = "main"): Promise<{
  id: string;
  name: string;
  stock: number;
  price: string;
  isPublished: boolean;
} | null> {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, name, stock, price, is_published 
       FROM products 
       WHERE (id = ? OR type_id = ? OR name = ?) 
         AND (site_id = ? OR site_id = 'main')
       LIMIT 1`,
      [productIdOrName, productIdOrName, productIdOrName, siteId]
    );

    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      name: r.name,
      stock: Number(r.stock || 0),
      price: String(r.price || "0"),
      isPublished: Boolean(r.is_published),
    };
  } catch (error) {
    console.error("[getLiveProductStock Error]:", error);
    return null;
  }
}

/**
 * Generates or retrieves the promotional schedule automatically.
 * Zero manual clicks required from admin.
 */
export async function getDailyPromoSchedule(siteId = "main"): Promise<DailyPromoScheduleState> {
  const targetDateStr = getTargetScheduleDate();
  const rawState = await getSettingValue("mimi_promo_schedule_state");
  const enabledVal = await getSettingValue("mimi_promo_scheduler_enabled");
  const quotaVal = await getSettingValue("mimi_promo_times_per_product");

  const isEnabled = enabledVal !== "false";
  const timesPerProduct = Math.max(1, parseInt(quotaVal || "2", 10));

  if (rawState) {
    try {
      const parsed: DailyPromoScheduleState = JSON.parse(rawState);
      if (parsed.date === targetDateStr) {
        parsed.enabled = isEnabled;
        parsed.timesPerProduct = timesPerProduct;
        parsed.completedSlots = parsed.slots.filter((s) => s.status === "sent").length;
        parsed.pendingSlots = parsed.slots.filter((s) => s.status === "pending").length;
        return parsed;
      }
    } catch (e) {
      console.warn("[mimi-promo-scheduler] Failed to parse schedule state, regenerating...");
    }
  }

  // Not generated yet or new day/night cycle: generate fresh schedule automatically!
  return generateDailyPromoSchedule({ force: true, timesPerProduct, siteId, targetDate: targetDateStr });
}

/**
 * Builds a new schedule automatically with randomized times across active hours (08:30 to 00:00 Bangkok time)
 */
export async function generateDailyPromoSchedule(options: {
  force?: boolean;
  timesPerProduct?: number;
  siteId?: string;
  targetDate?: string;
} = {}): Promise<DailyPromoScheduleState> {
  const siteId = options.siteId || "main";
  const { minutesOfDay } = getBangkokTimeParts();
  const targetDateStr = options.targetDate || getTargetScheduleDate();
  const quota = options.timesPerProduct || 2;
  const enabledVal = await getSettingValue("mimi_promo_scheduler_enabled");
  const isEnabled = enabledVal !== "false";

  const products = await getDistinctRestockProducts(siteId);
  const eligibleProducts = products.filter((p) => p.isPublished !== false);

  const slots: PromoScheduleSlot[] = [];
  const todayStr = getBangkokDateString();
  const isTargetingToday = targetDateStr === todayStr;

  // Determine active start minute:
  // If targeting today and currently in daytime, start from now + 5 mins so we never schedule in the past
  let startMinutes = PROMO_WINDOW_START_MINUTES;
  if (isTargetingToday && minutesOfDay > PROMO_WINDOW_START_MINUTES) {
    startMinutes = Math.min(PROMO_WINDOW_END_MINUTES - 30, minutesOfDay + 5);
  }
  const endMinutes = PROMO_WINDOW_END_MINUTES;
  const totalWindowMinutes = Math.max(30, endMinutes - startMinutes);

  if (eligibleProducts.length > 0) {
    const totalSlotsCount = eligibleProducts.length * quota;
    const intervalMinutes = Math.floor(totalWindowMinutes / Math.max(1, totalSlotsCount));

    let slotCounter = 1;
    for (let round = 0; round < quota; round++) {
      // Shuffle products in each round for natural variety
      const shuffled = [...eligibleProducts].sort(() => Math.random() - 0.5);

      for (let i = 0; i < shuffled.length; i++) {
        const prod = shuffled[i];
        const baseSlotIndex = round * shuffled.length + i;
        const targetBaseMinute = startMinutes + baseSlotIndex * intervalMinutes;

        // Add uniform random jitter of +/- 10 minutes (within bounds)
        const jitter = Math.floor((Math.random() - 0.5) * 20);
        const scheduledMinute = Math.min(
          endMinutes,
          Math.max(startMinutes, targetBaseMinute + jitter)
        );

        const hours = Math.floor(scheduledMinute / 60) % 24;
        const mins = scheduledMinute % 60;
        const timeFormatted = `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;

        // Create Bangkok ISO time
        const slotDate = new Date(`${targetDateStr}T${timeFormatted}:00+07:00`);

        slots.push({
          id: `slot_${targetDateStr}_${slotCounter++}_${Math.random().toString(36).substring(2, 7)}`,
          productId: prod.productId,
          productName: prod.productName,
          scheduledTime: slotDate.toISOString(),
          timeFormatted,
          status: "pending",
        });
      }
    }

    // Sort all slots chronologically
    slots.sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
  }

  const state: DailyPromoScheduleState = {
    date: targetDateStr,
    timesPerProduct: quota,
    enabled: isEnabled,
    totalSlots: slots.length,
    completedSlots: 0,
    pendingSlots: slots.length,
    slots,
    generatedAt: new Date().toISOString(),
  };

  await updateSetting("mimi_promo_schedule_state", JSON.stringify(state));
  return state;
}

/**
 * Checks for due slots and processes them.
 * - Enforces Quiet Hours (00:30 - 08:30)
 * - Automatically expires and skips stale slots older than 20 minutes
 * - Queries live product stock before firing
 */
export async function processDuePromoBroadcasts(
  siteId = "main",
  options: { allowQuietHours?: boolean } = {}
): Promise<{
  processedCount: number;
  triggeredSlot?: PromoScheduleSlot;
  reason?: string;
}> {
  const schedule = await getDailyPromoSchedule(siteId);

  if (!schedule.enabled) {
    return { processedCount: 0, reason: "Mimi Autonomous Promo is disabled" };
  }

  // 1. Quiet Hours check: 00:30 - 08:30 Bangkok time (unless manually triggered by admin)
  if (!options.allowQuietHours && isQuietHours()) {
    return {
      processedCount: 0,
      reason: "Quiet hours (00:30 - 08:30 น.). ระบบหยุดพักผ่อนไม่ส่งเสียงรบกวนลูกค้า",
    };
  }

  const now = Date.now();

  // 2. Expire stale slots: any pending slot overdue by more than 20 minutes is skipped!
  let stateModified = false;
  for (const s of schedule.slots) {
    if (s.status === "pending") {
      const slotTime = new Date(s.scheduledTime).getTime();
      if (now - slotTime > MAX_STALE_MS) {
        s.status = "skipped_expired";
        s.error = "⏰ ข้าม (เลยเวลาจริงเกิน 20 นาที)";
        stateModified = true;
      }
    }
  }

  // 3. Find the first pending slot that is due within the valid window
  const dueSlot = schedule.slots.find((s) => {
    if (s.status !== "pending") return false;
    const slotTime = new Date(s.scheduledTime).getTime();
    return slotTime <= now && (now - slotTime) <= MAX_STALE_MS;
  });

  if (!dueSlot) {
    if (stateModified) {
      schedule.lastRunAt = new Date().toISOString();
      await updateSetting("mimi_promo_schedule_state", JSON.stringify(schedule));
    }
    return { processedCount: 0, reason: "No due slots at this time" };
  }

  // 4. Pre-flight check: query live real-time stock
  const liveProduct = await getLiveProductStock(dueSlot.productId || dueSlot.productName, siteId);
  const liveStock = liveProduct ? liveProduct.stock : 0;

  dueSlot.liveStockAtTrigger = liveStock;

  if (liveStock <= 0) {
    // Sold out: mark as skipped so we don't advertise out-of-stock products
    dueSlot.status = "skipped_out_of_stock";
    dueSlot.error = "สินค้าหมดในสต็อกจริง (Real-time Stock = 0)";
    schedule.lastRunAt = new Date().toISOString();
    await updateSetting("mimi_promo_schedule_state", JSON.stringify(schedule));
    return {
      processedCount: 1,
      triggeredSlot: dueSlot,
      reason: `Skipped ${dueSlot.productName} because live stock is 0`,
    };
  }

  // 5. Generate promotional copy via Gemini & broadcast
  try {
    const copy = await generateMimiPromoCopy({
      productName: dueSlot.productName,
      remainingStock: liveStock,
      price: liveProduct?.price,
    });

    const broadcast = await broadcastPushNotification({
      title: copy.title,
      body: copy.body,
      url: copy.url || "/products",
      target: "ALL",
      senderName: "Mimi AI Auto-Pilot",
    });

    dueSlot.status = "sent";
    dueSlot.sentAt = new Date().toISOString();
    dueSlot.broadcastId = broadcast.id;
    schedule.lastRunAt = new Date().toISOString();
    await updateSetting("mimi_promo_schedule_state", JSON.stringify(schedule));

    return {
      processedCount: 1,
      triggeredSlot: dueSlot,
    };
  } catch (err: any) {
    console.error("[processDuePromoBroadcasts Error]:", err);
    dueSlot.status = "failed";
    dueSlot.error = err?.message || "Unknown broadcast error";
    schedule.lastRunAt = new Date().toISOString();
    await updateSetting("mimi_promo_schedule_state", JSON.stringify(schedule));
    return {
      processedCount: 1,
      triggeredSlot: dueSlot,
      reason: `Failed to broadcast: ${err?.message}`,
    };
  }
}

/**
 * Triggers the next pending slot immediately (for manual test by admin)
 */
export async function triggerNextPromoQueueNow(siteId = "main"): Promise<{
  success: boolean;
  slot?: PromoScheduleSlot;
  message: string;
}> {
  const schedule = await getDailyPromoSchedule(siteId);

  let targetSlot = schedule.slots.find((s) => s.status === "pending");

  if (!targetSlot) {
    const products = await getDistinctRestockProducts(siteId);
    const inStock = products.find((p) => p.currentLiveStock > 0);
    if (!inStock) {
      return {
        success: false,
        message: "ไม่พบสินค้าที่มีสต็อกพร้อมส่งในตาราง",
      };
    }
    targetSlot = {
      id: `manual_slot_${Date.now()}`,
      productId: inStock.productId,
      productName: inStock.productName,
      scheduledTime: new Date().toISOString(),
      timeFormatted: new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
      status: "pending",
    };
    schedule.slots.unshift(targetSlot);
  }

  // Set time to now so it is immediately eligible
  targetSlot.scheduledTime = new Date().toISOString();
  await updateSetting("mimi_promo_schedule_state", JSON.stringify(schedule));

  // Explicit admin test allows overriding quiet hours
  const result = await processDuePromoBroadcasts(siteId, { allowQuietHours: true });

  return {
    success: result.processedCount > 0 && result.triggeredSlot?.status === "sent",
    slot: result.triggeredSlot,
    message: result.reason || "ยิงการแจ้งเตือนโปรโมทสำเร็จแล้วค่ะ!",
  };
}
