import { deliverAgentReply } from "./agent-delivery";
import { runMimiAgent } from "@/lib/mimi/agent";
import { isAuthorizedAdminSource, isExplicitAdminOperation, isExplicitHumanRequest } from "./agent-routing";
import { randomUUID } from "crypto";
import pool from "@/lib/mysql";
import { getSiteId } from "@/lib/site";
import { getLineChannelAccessToken } from "./config";
import {
  buildStockConfirmFlex,
  buildStockSuccessFlex,
  buildStockSummaryFlex,
  buildCustomerCatalogFlex,
  buildCustomerSupportFlex,
  buildEscalateToAdminFlex,
  buildHelpFlex,
  buildAdminEscalationAlertFlex,
  buildActiveCasesFlex,
  buildMimiControlPanelFlex,
} from "./flex-templates";
import {
  previewStockAppend,
  appendProductAccounts,
} from "@/lib/products/stock-append";
import {
  prepareStockBatch,
  type ExtractedStockItem,
} from "@/lib/products/stock-template-engine";
import { getStockDeliveryTypeLabel } from "@/lib/products/stock-delivery-type";
import { safeParseJson } from "@/lib/products/account-parser";
import type { ProductAccount } from "@/lib/products/types";
import { getEffectiveStockFromRecord } from "@/lib/products/stock-utils";
import { triggerMimiAutoPilot } from "@/lib/ai/mimi-generator";
import { getSettingValue, updateSetting } from "@/lib/settings/repository";
import {
  getActiveKnowledgeRules,
  saveKnowledgeRule,
} from "@/lib/mimi/knowledge";
import { getCustomerQuickReply } from "./quick-reply";
import { getCustomerRichMenuMessage } from "./rich-menu";
import {
  resolveAdminTier,
  AdminTierProfile,
  ADMIN_TIERS,
  loadDynamicAdminUids,
  saveDynamicAdminUid,
  getRegisteredAdminList,
} from "@/lib/mimi/admin-tiers";
import {
  getShortTermConversation,
  appendShortTermConversation,
  appendHandoffMarker,
  ConversationMessage,
  GroupMessageContext,
  getGroupConversationHistory,
  appendGroupConversationHistory,
  formatGroupHistoryForAgent,
} from "@/lib/mimi/memory";
import {
  getConversationState,
  setConversationMode,
  acquireProcessingLock,
  releaseProcessingLock,
  verifyFinalSendGuard,
  recordCustomerMessageActivity,
  recordAiMessageSent,
  listActiveConversations,
  clearAllConversationLocks,
  getMimiGlobalState,
  setMimiGlobalPause,
  setMimiGlobalResume,
  type MimiGlobalState,
  type ConversationState,
  type ConversationMode,
} from "@/lib/mimi/control/conversation-controller";
import {
  parseAdminMessageWithGemini as parseAdminWithMimiBrain,
  AdminBrainParseResult,
} from "@/lib/mimi";

export const ADMIN_GROUP_ID = "Ca5b13b6ca04784c98b910cb9a8610527";
export const DEFAULT_ADMIN_LOCK_DURATION_MS = 30 * 60 * 1000; // 30 minutes

let dynamicAdminGroupId: string = ADMIN_GROUP_ID;

export async function getAdminGroupId(): Promise<string> {
  if (dynamicAdminGroupId && dynamicAdminGroupId !== ADMIN_GROUP_ID) {
    return dynamicAdminGroupId;
  }
  try {
    const saved = await getSettingValue("line_admin_group_id");
    if (saved) {
      dynamicAdminGroupId = saved;
      return saved;
    }
  } catch (e) {
    // Non-fatal
  }
  return dynamicAdminGroupId;
}

export async function setAdminGroupId(groupId: string): Promise<void> {
  if (!groupId) return;
  dynamicAdminGroupId = groupId;
  try {
    await updateSetting("line_admin_group_id", groupId);
  } catch (e) {
    // Non-fatal
  }
}

export interface PendingStockBatch {
  batchId: string;
  productId: string;
  productName: string;
  typeId: string;
  stockDeliveryType: any;
  currentStock: number;
  newStock: number;
  accounts: string[];
  rawInput: string;
  previewForm?: string;
  duplicateCount?: number;
  createdAt: number;
  actorName: string;
}

export interface ChatLockState {
  userId: string;
  customerName: string;
  lockedUntil: number;
  reason: string;
  lastActivityAt: number;
}

// In-memory cache for fast lookup
const chatLockMap = new Map<string, ChatLockState>();
const recentCustomerMap = new Map<
  string,
  { userId: string; customerName: string; lastSeenAt: number }
>();
const pendingBatches = new Map<string, PendingStockBatch>();

// Re-export conversation history methods pointing to centralized memory engine
export async function getConversationHistory(userId: string): Promise<ConversationMessage[]> {
  return getShortTermConversation(userId);
}

export async function appendConversationHistory(
  userId: string,
  role: "user" | "model",
  text: string
): Promise<void> {
  return appendShortTermConversation(userId, role, text);
}

// Cache active products list for fast matching
export interface SimpleProduct {
  id: string;
  typeId: string;
  name: string;
  price: number;
  stock: number;
  details: string;
  typeMenu: string;
  stockDeliveryType: string;
  accountData?: ProductAccount[] | null;
}
let cachedProducts: SimpleProduct[] = [];
let cachedProductsExpiry = 0;

export async function getAvailableProducts(forceRefresh = true): Promise<SimpleProduct[]> {
  const now = Date.now();
  if (!forceRefresh && cachedProducts.length > 0 && now < cachedProductsExpiry) {
    return cachedProducts;
  }

  try {
    const siteId = getSiteId();
    const [rows] = await pool.execute(
      `SELECT p.id, p.type_id, p.name, p.details, p.type_menu, p.badge,
              p.account_data, p.account_email, p.account_password, p.api_provider_id, p.stock as raw_stock,
              COALESCE(spp.retail_price, p.price, 0) as sale_price,
              COALESCE(JSON_LENGTH(p.account_data), p.stock, 0) as effective_stock,
              p.stock_delivery_type
       FROM products p
       LEFT JOIN site_product_prices spp ON p.id = spp.product_id AND spp.site_id = ?
       WHERE p.is_published = 1 AND (p.is_local = 0 OR (p.is_local = 1 AND p.site_id = ?))
       ORDER BY effective_stock DESC,
                CASE WHEN p.badge = 'hot_sale' THEN 3 WHEN p.badge = 'recommended' THEN 2 ELSE 1 END DESC,
                p.name ASC`,
      [siteId, siteId]
    );

    const products = (rows as any[]).map((r) => {
      const computedStock = getEffectiveStockFromRecord({
        stock: r.raw_stock,
        account_data: r.account_data,
        account_email: r.account_email,
        account_password: r.account_password,
        api_provider_id: r.api_provider_id,
      });

      return {
        id: String(r.id),
        typeId: String(r.type_id),
        name: String(r.name),
        price: Number(r.sale_price) || 0,
        stock: computedStock,
        details: String(r.details || ""),
        typeMenu: String(r.type_menu || ""),
        stockDeliveryType: String(r.stock_delivery_type || "account-pool"),
        accountData: safeParseJson<ProductAccount[]>(r.account_data) || [],
      };
    });

    cachedProducts = products;
    cachedProductsExpiry = now + 60000; // cache 1 minute for general queries
    return products;
  } catch (error) {
    console.error("[LINE handler] getAvailableProducts error:", error);
    // A requested fresh read must never silently degrade to stale product
    // prices/stock. Non-fresh legacy callers may still use the last cache.
    return forceRefresh ? [] : cachedProducts;
  }
}

/**
 * Identify if sender is Papa (Owner สูงสุดผู้ทำระบบ)
 * Matches "🦁 Zeries Sand 🦁", "🐰 Zeries Sand 🐰", or any form of "Zeries Sand"
 */
export function isPapaUser(senderName: string): boolean {
  const normalized = (senderName || "").trim().toLowerCase();
  return (
    normalized.includes("zeries") ||
    normalized.includes("🦁") ||
    normalized.includes("🐰 zeries sand 🐰")
  );
}

/**
 * Detect if customer in 1:1 chat is asking to speak with an Admin/Human
 * Or reporting complex issues that require human admin intervention (e.g. swap email, OTP stuck)
 */
export function isCustomerAskingForAdmin(text: string): boolean {
  const lower = (text || "").toLowerCase();
  return (
    lower.includes("คุยกับแอดมิน") ||
    lower.includes("ติดต่อแอดมิน") ||
    lower.includes("ขอคุยกับคน") ||
    lower.includes("คุยกับคน") ||
    lower.includes("ขอแอดมิน") ||
    lower.includes("เรียกแอดมิน") ||
    lower.includes("มีคนอยู่ไหม") ||
    lower.includes("เจ้าหน้าที่") ||
    lower.includes("ติดต่อคน") ||
    lower.includes("แอดมินอยู่ไหม") ||
    lower.includes("ขอคนตอบ") ||
    lower.includes("ขอคุยกับเจ้าหน้าที่") ||
    lower.includes("ขอเบอร์") ||
    lower.includes("ขอเงินคืน") ||
    lower.includes("คืนเงิน") ||
    lower.includes("เคลมเงิน") ||
    // Problem keywords requiring human admin:
    lower.includes("สลับเมล") ||
    lower.includes("ขอเมลเก่า") ||
    lower.includes("เปลี่ยนเมล") ||
    lower.includes("ขอเปลี่ยนเมล") ||
    lower.includes("ขอเปลี่ยนแอค") ||
    lower.includes("ขอเปลี่ยนบัญชี") ||
    lower.includes("เปลี่ยน account") ||
    lower.includes("สลับบัญชี") ||
    lower.includes("เปลี่ยนจอ") ||
    lower.includes("สลับจอ") ||
    lower.includes("ย้ายจอ") ||
    lower.includes("ขอคนช่วย") ||
    lower.includes("มีคนตอบไหม")
  );
}

/**
 * Detect if Mimi's generated response indicates an escalation to a human admin
 */
export function isMimiEscalatingToAdmin(replyText: string): boolean {
  const lower = (replyText || "").toLowerCase();
  return (
    lower.includes("ส่งต่อให้พี่") ||
    lower.includes("ส่งต่อพี่") ||
    lower.includes("ส่งเรื่องต่อให้พี่") ||
    lower.includes("ส่งเรื่องต่อให้แอดมิน") ||
    lower.includes("แอดมินมนุษย์") ||
    lower.includes("ส่งต่อเคส") ||
    lower.includes("ส่งเรื่องต่อให้") ||
    lower.includes("ให้พี่ๆ แอดมิน") ||
    lower.includes("ให้พี่แอดมิน") ||
    lower.includes("พี่แอดมินมาถึงแล้วจะรีบเช็ก") ||
    lower.includes("พี่แอดมินเข้ามาดูแลรับช่วงต่อ") ||
    lower.includes("พี่แอดมินเข้ามาช่วย") ||
    lower.includes("ส่งไม้ต่อให้พี่แอดมิน") ||
    lower.includes("ส่งต่อให้เจ้าหน้าที่") ||
    lower.includes("สะกิดแอดมิน") ||
    lower.includes("สะกิดพี่แอดมิน") ||
    lower.includes("แอดมินร่างมนุษย์") ||
    lower.includes("สะกิดแอดมินร่างมนุษย์")
  );
}

/**
 * Persist pending batch in memory and DB
 */
async function savePendingBatch(batch: PendingStockBatch) {
  pendingBatches.set(batch.batchId, batch);
  try {
    const key = `line_pending_batch_${batch.batchId}`;
    await updateSetting(key, JSON.stringify(batch));
  } catch (e) {
    console.error("[LINE handler] savePendingBatch DB error:", e);
  }
}

/**
 * Retrieve pending batch from memory or DB
 */
async function getPendingBatch(batchId: string): Promise<PendingStockBatch | null> {
  const mem = pendingBatches.get(batchId);
  if (mem) {
    if (Date.now() - mem.createdAt > 15 * 60 * 1000) {
      pendingBatches.delete(batchId);
      return null;
    }
    return mem;
  }

  try {
    const key = `line_pending_batch_${batchId}`;
    const raw = await getSettingValue(key);
    if (!raw) return null;
    const batch = JSON.parse(raw) as PendingStockBatch;
    if (Date.now() - batch.createdAt > 15 * 60 * 1000) {
      return null;
    }
    pendingBatches.set(batchId, batch);
    return batch;
  } catch (e) {
    return null;
  }
}

/**
 * Remove pending batch after execution or cancellation
 */
async function removePendingBatch(batchId: string) {
  pendingBatches.delete(batchId);
  try {
    const key = `line_pending_batch_${batchId}`;
    await updateSetting(key, "");
  } catch (e) {
    // Non-fatal
  }
}

/**
 * Reply to LINE message
 */
export async function replyLineMessage(replyToken: string, messages: any | any[]) {
  if (!replyToken || replyToken === "00000000000000000000000000000000") return;

  const started = Date.now();
  const token = await getLineChannelAccessToken();
  const payload = {
    replyToken,
    messages: Array.isArray(messages) ? messages : [messages],
  };

  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  console.info("[MIMI LINE reply]", { status: res.status, elapsedMs: Date.now() - started });

  if (!res.ok) {
    console.error("[LINE replyLineMessage error]:", res.status);
    throw new Error("LINE reply failed");
  }
}

/**
 * Get sender display name
 */
const senderNameCache = new Map<string, { name: string; expiresAt: number }>();
export async function getLineSenderName(source: any): Promise<string> {
  if (!source?.userId) return "พี่";
  const key = `${source.groupId || "oa"}:${source.userId}`;
  const cached = senderNameCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.name;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fetchLineSenderName(source).then(name => {
        if (senderNameCache.size >= 1000) senderNameCache.delete(senderNameCache.keys().next().value!);
        senderNameCache.set(key, { name, expiresAt: Date.now() + 5 * 60_000 });
        return name;
      }),
      new Promise<string>(resolve => { timer = setTimeout(() => resolve("พี่"), 1500); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

async function fetchLineSenderName(source: any): Promise<string> {
  try {
    const token = await getLineChannelAccessToken();
    if (source.type === "group" && source.groupId && source.userId) {
      const res = await fetch(
        `https://api.line.me/v2/bot/group/${source.groupId}/member/${source.userId}`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(1500) }
      );
      if (res.ok) {
        const data = await res.json();
        return data.displayName || "Admin";
      }
    } else if (source.userId) {
      const res = await fetch(
        `https://api.line.me/v2/bot/profile/${source.userId}`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(1500) }
      );
      if (res.ok) {
        const data = await res.json();
        return data.displayName || "User";
      }
    }
  } catch (e) {
    // Fallback
  }
  return "Admin";
}

/**
 * Push message to a user or group via LINE Messaging API
 */
export async function pushLineMessage(to: string, messages: any | any[]): Promise<boolean> {
  if (!to) return false;
  try {
    const token = await getLineChannelAccessToken();
    const payload = {
      to,
      messages: Array.isArray(messages) ? messages : [messages],
    };

    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[LINE pushLineMessage error]:", res.status, text);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[LINE pushLineMessage network error]:", e);
    return false;
  }
}

/**
 * Check if a customer's chat is currently locked by an Admin (Human Handover)
 */
export async function getChatLock(userId: string): Promise<ChatLockState | null> {
  if (!userId) return null;
  const now = Date.now();
  const mem = chatLockMap.get(userId);
  if (mem) {
    if (now < mem.lockedUntil) {
      return mem;
    }
    chatLockMap.delete(userId);
  }

  try {
    const conv = await getConversationState(userId);
    if (conv.mode === "HUMAN" || conv.mode === "PAUSED") {
      const lockedUntil = conv.lockedUntil || now + DEFAULT_ADMIN_LOCK_DURATION_MS;
      if (now < lockedUntil) {
        const state: ChatLockState = {
          userId: conv.userId,
          customerName: conv.customerName,
          lockedUntil,
          reason: conv.reason || "แอดมินรับช่วงดูแลเคส",
          lastActivityAt: conv.lastCustomerMessageAt || conv.updatedAt,
        };
        chatLockMap.set(userId, state);
        return state;
      }
    }
  } catch (e) {
    // Non-fatal
  }
  return null;
}

/**
 * Lock a customer's chat for an Admin (Mimi will stop auto-replying)
 */
export async function setChatLock(
  userId: string,
  durationMs: number = DEFAULT_ADMIN_LOCK_DURATION_MS,
  customerName?: string,
  reason: string = "แอดมินรับช่วงดูแลเคส"
): Promise<ChatLockState> {
  const now = Date.now();
  const existing = chatLockMap.get(userId);
  const name = customerName || existing?.customerName || "ลูกค้า";
  const state: ChatLockState = {
    userId,
    customerName: name,
    lockedUntil: now + durationMs,
    reason,
    lastActivityAt: now,
  };

  chatLockMap.set(userId, state);
  recentCustomerMap.set(userId, { userId, customerName: name, lastSeenAt: now });

  try {
    await setConversationMode(userId, "HUMAN", {
      customerName: name,
      durationMs,
      reason,
    });
    await appendHandoffMarker(userId, "ADMIN_TAKEOVER", reason).catch(() => {});
  } catch (e) {
    // Non-fatal
  }
  return state;
}

/**
 * Remove chat lock (Mimi resumes taking over)
 */
export async function removeChatLock(userId: string): Promise<void> {
  if (!userId) return;
  chatLockMap.delete(userId);
  try {
    await setConversationMode(userId, "AI");
    await appendHandoffMarker(userId, "AI_RESUMED").catch(() => {});
  } catch (e) {
    // Non-fatal
  }
}

/**
 * List all recent and locked customer cases
 */
export async function listActiveChatLocks(): Promise<
  Array<ChatLockState & { remainingMinutes: number; isLocked: boolean }>
> {
  const now = Date.now();
  const result: Array<ChatLockState & { remainingMinutes: number; isLocked: boolean }> = [];

  try {
    const convs = await listActiveConversations();
    const allIds = new Set<string>([...chatLockMap.keys(), ...recentCustomerMap.keys(), ...convs.map((c) => c.userId)]);

    for (const uid of allIds) {
      const lock = await getChatLock(uid);
      const recent = recentCustomerMap.get(uid);
      const conv = convs.find((c) => c.userId === uid);
      const name = lock?.customerName || recent?.customerName || conv?.customerName || "ลูกค้า";
      if (lock && now < lock.lockedUntil) {
        const remainingMs = Math.max(0, lock.lockedUntil - now);
        result.push({
          ...lock,
          customerName: name,
          remainingMinutes: Math.ceil(remainingMs / 60000),
          isLocked: true,
        });
      } else if (recent || conv) {
        result.push({
          userId: uid,
          customerName: name,
          lockedUntil: 0,
          reason: "มิมิดูแลอัตโนมัติ",
          lastActivityAt: recent?.lastSeenAt || conv?.lastCustomerMessageAt || now,
          remainingMinutes: 0,
          isLocked: false,
        });
      }
    }
  } catch (e) {
    // Non-fatal fallback to in-memory maps
    const allIds = new Set<string>([...chatLockMap.keys(), ...recentCustomerMap.keys()]);
    for (const uid of allIds) {
      const lock = chatLockMap.get(uid);
      const recent = recentCustomerMap.get(uid);
      const name = lock?.customerName || recent?.customerName || "ลูกค้า";
      if (lock && now < lock.lockedUntil) {
        result.push({
          ...lock,
          customerName: name,
          remainingMinutes: Math.ceil((lock.lockedUntil - now) / 60000),
          isLocked: true,
        });
      } else if (recent) {
        result.push({
          userId: uid,
          customerName: name,
          lockedUntil: 0,
          reason: "มิมิดูแลอัตโนมัติ",
          lastActivityAt: recent.lastSeenAt,
          remainingMinutes: 0,
          isLocked: false,
        });
      }
    }
  }

  return result.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}

export {
  getMimiGlobalState,
  setMimiGlobalPause,
  setMimiGlobalResume,
  type MimiGlobalState,
};

export async function clearAllChatLocks(): Promise<number> {
  const count = chatLockMap.size;
  chatLockMap.clear();
  await clearAllConversationLocks().catch(() => {});
  try {
    await pool.execute("DELETE FROM settings WHERE key_name LIKE 'line_lock_%' OR key_name LIKE 'line_conv_state_%'");
  } catch (e) {}
  return count;
}

/**
 * Fallback regex to extract account lines for stock filling
 */
function extractAccountsFallback(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const accounts: string[] = [];

  for (const line of lines) {
    if (
      (line.includes(":") || line.includes("|") || line.includes("\t")) &&
      !line.startsWith("@") &&
      !line.startsWith("http")
    ) {
      const cleaned = line.replace(/^[-*•\d+.\s]+/, "").trim();
      if (cleaned.length >= 5) {
        accounts.push(cleaned);
      }
    }
  }

  return accounts;
}

/**
 * Call Gemini Flash for Admin Group messages ("Store By Mari หลังบ้าน")
 * Uses 4-Tier Hierarchy (SSS: Papa, S: Mami, B: Som/Por, E: Guest)
 * Delegates to Mimi Admin Brain module.
 */
async function parseAdminMessageWithGemini(
  userText: string,
  products: SimpleProduct[],
  senderName: string,
  tierProfile: AdminTierProfile,
  groupContext: GroupMessageContext[] = []
): Promise<AdminBrainParseResult> {
  return parseAdminWithMimiBrain(userText, products, senderName, tierProfile, groupContext);
}

async function finishCustomerAgentReply(
  userText: string, replyToken: string, userId: string, customerName: string,
  imagePart?: { mimeType: string; data: string },
) {
  const memoryKey = `agent-v2:${getSiteId()}:customer:${userId}`;
  const history = userId ? await getShortTermConversation(memoryKey) : [];
  const agentStarted = Date.now();
  const result = await runMimiAgent({
    userText, audience: "customer", siteId: getSiteId(), history,
    imagePart, speakerName: customerName,
  });
  console.info("[MIMI agent]", { audience: "customer", status: result.status, elapsedMs: Date.now() - agentStarted, tools: result.toolNames });
  await deliverAgentReply(result.replyText, Boolean(userId && (result.handoffRequested || isExplicitHumanRequest(userText))), {
    canSend: async () => !userId || (await verifyFinalSendGuard(userId)).canSend,
    notify: async () => {
      const adminGroup = await getAdminGroupId();
      return Boolean(adminGroup) && await pushLineMessage(adminGroup, buildAdminEscalationAlertFlex({
        userId, userName: customerName,
        userMessage: (result.handoffSummary || "ลูกค้าขอให้ทีมแอดมินเข้ามาช่วยดูแล กรุณาตรวจบทสนทนาใน LINE OA").slice(0, 1000),
        lockedMinutes: 30, reason: "ลูกค้าหรือ AI ขอให้แอดมินช่วยดูแลต่อ",
      }));
    },
    reply: async text => {
      const messages: any[] = [{ type: "text", text, quickReply: getCustomerQuickReply() }];
      if (result.handoffRequested) {
        messages.push(buildEscalateToAdminFlex());
      } else if (result.productCards?.length) {
        messages.push(buildCustomerCatalogFlex(result.productCards));
      } else if (/(?:แจ้งปัญหา|มีปัญหาการใช้งาน|เคลม|แจ้งซ่อม|เข้าไม่ได้|จอเต็ม|หลุด)/iu.test(userText)) {
        messages.push(buildCustomerSupportFlex());
      }
      await replyLineMessage(replyToken, messages);
    },
    pause: async () => { if (userId) await setChatLock(userId, DEFAULT_ADMIN_LOCK_DURATION_MS, customerName, "ส่งต่อแอดมินแล้ว"); },
    remember: async text => {
      if (!userId) return;
      await appendShortTermConversation(memoryKey, "user", userText);
      await appendShortTermConversation(memoryKey, "model", text);
      await recordAiMessageSent(userId);
    },
  });
}

async function handleCustomerMessage(
  userText: string, _products: SimpleProduct[], replyToken: string, source: any,
) {
  const userId = source?.userId || "";
  const [customerName, globalState] = await Promise.all([getLineSenderName(source), getMimiGlobalState()]);
  if (globalState.isPaused) return;
  if (userId) {
    recentCustomerMap.set(userId, { userId, customerName, lastSeenAt: Date.now() });
    const conv = await recordCustomerMessageActivity(userId, customerName);
    if (conv.mode === "HUMAN" || conv.mode === "PAUSED" || !conv.aiEnabled) return;
    if (!acquireProcessingLock(userId)) return;
  }
  try {
    await finishCustomerAgentReply(userText, replyToken, userId, customerName);
  } finally {
    if (userId) releaseProcessingLock(userId);
  }
}

/**
 * Handle Customer sending an Image (Screenshots, Error screens, Slips, TV screens, etc.)
 * Uses Gemini Vision Multimodal to analyze image, diagnose issues, and provide troubleshooting
 */
async function handleCustomerImageMessage(
  messageId: string,
  products: SimpleProduct[],
  replyToken: string,
  source: any
) {
  const userId = source?.userId || "";
  const customerName = await getLineSenderName(source);

  // 0. Check Global Mimi Status (Emergency Stop / Master Mute)
  const globalState = await getMimiGlobalState();
  if (globalState.isPaused) {
    console.log(
      `[LINE handler] Customer "${customerName}" (${userId}) sent an image while Mimi is globally paused by ${globalState.pausedBy}. Mimi remains silent.`
    );
    return;
  }

  // 1. Check conversation state & record message activity
  if (userId) {
    const conv = await recordCustomerMessageActivity(userId, customerName);
    if (conv.mode === "HUMAN" || conv.mode === "PAUSED" || !conv.aiEnabled) {
      console.log(
        `[LINE handler] Customer "${customerName}" (${userId}) sent an image while in ${conv.mode} mode. Mimi remains silent (sliding idle reset).`
      );
      return;
    }
  }

  // 2. Concurrency Processing Lock (Zero-Delay In-Memory Mutex)
  if (userId && !acquireProcessingLock(userId)) {
    console.log(
      `[LINE handler] Customer "${customerName}" (${userId}) image message dropped: AI already processing.`
    );
    return;
  }

  try {

  // 2. Download the image binary from LINE Content API
  let imageBase64 = "";
  let mimeType = "image/jpeg";
  try {
    const channelToken = await getLineChannelAccessToken();
    const contentUrl = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
    const res = await fetch(contentUrl, {
      headers: {
        Authorization: `Bearer ${channelToken}`,
      },
    });

    if (res.ok) {
      const buffer = await res.arrayBuffer();
      imageBase64 = Buffer.from(buffer).toString("base64");
      mimeType = res.headers.get("content-type") || "image/jpeg";
    } else {
      console.error(`[LINE handler] Failed to fetch image content ${messageId}: status ${res.status}`);
    }
  } catch (err) {
    console.error("[LINE handler] Error downloading image from LINE:", err);
  }

  if (!imageBase64) {
    await replyLineMessage(replyToken, {
      type: "text",
      text: "มิมิดูรูปภาพไม่ได้เลยค่าเตง 🥺 อาจจะเกิดจากสัญญาณเน็ตขัดข้อง รบกวนส่งรูปใหม่อีกรอบ หรือพิมพ์บอกอาการให้มิมิฟังหน่อยน้าา 🐰💕",
      quickReply: getCustomerQuickReply(),
    });
    return;
  }

  await finishCustomerAgentReply(
    "[ลูกค้าส่งภาพ โปรดอ่านภาพและช่วยตามบริบทการสนทนา ถ้าอ่านไม่ชัดให้ถามเพิ่มเติม]",
    replyToken, userId, customerName, { mimeType, data: imageBase64 },
  );
  } finally {
    if (userId) {
      releaseProcessingLock(userId);
    }
  }
}

/**
 * Handle Admin Group Messages ("Store By Mari หลังบ้าน")
 * Respects hierarchy: "🦁 Zeries Sand 🦁" is ปะป๊า (Owner สูงสุด)
 * Other members are Admins
 */
/**
 * Handle Admin Group Messages ("Store By Mari หลังบ้าน")
 * Respects 4-tier hierarchy (SSS: Papa, S: Mami, B: Som/Por, E: Guest)
 * Incorporates rolling group context and permissions
 */
/**
 * Clean and normalize text from LINE messages:
 * 1. Removes text corresponding to LINE mention entities if provided.
 * 2. Strips zero-width & non-printable unicode characters (\u200B-\u200D, \uFEFF).
 * 3. Normalizes unicode whitespace characters to standard space.
 * 4. Strips bot mention prefixes (@มิมิ, @mimi, legacy store aliases, @all).
 * 5. Strips redundant leading/trailing bot names.
 */
export function cleanAdminCommandText(
  rawText: string,
  mention?: { mentionees?: Array<{ index: number; length: number }> }
): string {
  let text = rawText || "";

  if (mention?.mentionees && Array.isArray(mention.mentionees)) {
    const sorted = [...mention.mentionees]
      .filter((m) => typeof m.index === "number" && typeof m.length === "number")
      .sort((a, b) => b.index - a.index);

    for (const m of sorted) {
      text = text.slice(0, m.index) + text.slice(m.index + m.length);
    }
  }

  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, " ")
    .replace(/([\u0E31\u0E34-\u0E3A\u0E47-\u0E4E])\1+/g, "$1")
    .replace(/@\s*(?:มิมิ|mimi|app\s*by\s*mari(?:\.com)?|appbymari(?:\.com)?|all)/gi, "")
    .replace(/^(?:มิมิ|mimi)\s*/i, "")
    .trim();
}

/**
 * Handle Admin Group Messages ("Store By Mari หลังบ้าน")
 * Respects 4-tier hierarchy (SSS: Papa, S: Mami, B: Som/Por, E: Guest)
 * Incorporates rolling group context and permissions
 */
async function handleAdminGroupMessage(
  rawText: string,
  products: SimpleProduct[],
  replyToken: string,
  source: any,
  mentionData?: any
) {
  await loadDynamicAdminUids().catch(() => {});
  const senderName = await getLineSenderName(source);
  const senderUserId = source?.userId || "";
  const senderTier = resolveAdminTier(senderUserId, senderName);
  const isPapa = senderTier.tier === "SSS";

  const cleanedText = cleanAdminCommandText(rawText, mentionData);
  const lowerCleaned = cleanedText.toLowerCase();

  if (!isExplicitAdminOperation(cleanedText)) {
    const memoryKey = `agent-v2:${getSiteId()}:group:${source.groupId}:${senderUserId}`;
    if (!acquireProcessingLock(memoryKey)) return;
    try {
      const groupHistory = await getGroupConversationHistory(source.groupId);
      const history = formatGroupHistoryForAgent(groupHistory);
      const agentStarted = Date.now();
      const result = await runMimiAgent({
        userText: rawText, audience: "admin", siteId: getSiteId(), history,
        speakerName: senderTier.callName, speakerTier: senderTier.tier,
        speakerProfile: senderTier.userId ? { callName: senderTier.callName, conversationStyle: senderTier.conversationStyle } : undefined,
      });
      console.info("[MIMI agent]", { audience: "admin", status: result.status, elapsedMs: Date.now() - agentStarted, tools: result.toolNames });
      const messages: any[] = [{ type: "text", text: result.replyText }];
      if (result.productCards?.length) {
        messages.push(buildStockSummaryFlex(result.productCards.map((item) => ({ name: item.name, stock: item.stock, price: `฿${item.price}` }))));
      }
      await replyLineMessage(replyToken, messages);
      await appendGroupConversationHistory(source.groupId, senderUserId, senderName, senderTier.tier, senderTier.callName, rawText);
      await appendGroupConversationHistory(source.groupId, "__mimi__", "มิมิ", "MIMI", "มิมิ", result.replyText);
    } finally { releaseProcessingLock(memoryKey); }
    return;
  }

  // A. UID Check / whoami command (Accessible to ALL group members, even Tier E, before permission gating)
  if (
    /^(?:เช็คไอดี|เช็กไอดี|ดูไอดี|ไอดีฉัน|ไอดีผม|uid|my id|whoami)$/iu.test(cleanedText.trim()) ||
    lowerCleaned === "id"
  ) {
    const isRegistered = senderTier.tier !== "E";
    const statusText = isRegistered
      ? `✅ บัญชีนี้ลงทะเบียนสิทธิ์แล้ว: Tier ${senderTier.tier} (${senderTier.callName})`
      : `⚠️ บัญชีนี้ยังไม่ได้ผูกสิทธิ์ (สถานะ: บุคคลทั่วไป / Tier E)`;

    const instructionText = isRegistered
      ? `ท่านสามารถสั่งงานมิมิและดูแลระบบได้ตามระดับสิทธิ์ของ ${senderTier.callName} ค่ะ 🐰💖`
      : `หากเป็นทีมงาน Store By Mari กรุณาส่ง UID ด้านล่างนี้ให้ปะป๊า (🦁 Zeries Sand 🦁)\nเพื่อให้ปะป๊าพิมพ์สั่งในกลุ่ม:\n👉 @มิมิ ตั้งสิทธิ์ [หม่ามี้/พี่ปอ/พี่ส้ม] ${senderUserId || "(ไม่พบ UID)"}`;

    await replyLineMessage(replyToken, {
      type: "text",
      text: `🆔 ข้อมูลบัญชี LINE ของคุณ\n━━━━━━━━━━━━━━\n👤 ชื่อแสดง: ${senderName}\n🔑 LINE UID: ${senderUserId || "ไม่พบ LINE User ID"}\n🏷️ ระดับสิทธิ์: ${statusText}\n\n${instructionText}`,
    });
    return;
  }

  // B. Set Admin Permission Command (Restricted to Tier SSS - Papa only)
  const setTierMatch = cleanedText.match(/^(?:ตั้งสิทธิ์|ผูกสิทธิ์)(?:\s+(.+))?$/iu);
  if (setTierMatch) {
    if (!isPapa) {
      await replyLineMessage(replyToken, {
        type: "text",
        text: `👑 คำสั่งตั้งสิทธิ์และผูกสิทธิ์แอดมิน สงวนสิทธิ์เฉพาะปะป๊า (🦁 Zeries Sand 🦁 - Tier SSS) สูงสุดคนเดียวน้าา 🐰🔒`,
      });
      return;
    }

    const rest = (setTierMatch[1] || "").trim();
    if (!rest) {
      await replyLineMessage(replyToken, {
        type: "text",
        text: `💡 วิธีการตั้งสิทธิ์แอดมินโดยปะป๊า:\n━━━━━━━━━━━━━━\nพิมพ์:\n👉 @มิมิ ตั้งสิทธิ์ [ตำแหน่ง] [LINE UID]\n\nตัวอย่าง:\n• @มิมิ ตั้งสิทธิ์ หม่ามี้ U1234567890...\n• @มิมิ ตั้งสิทธิ์ พี่ปอ U1234567890...\n• @มิมิ ตั้งสิทธิ์ พี่ส้ม U1234567890...\n\n(ให้แอดมินพิมพ์ "@มิมิ เช็คไอดี" ในกลุ่มเพื่อคัดลอก UID ส่งให้ป๊าน้าา) 🐰💖`,
      });
      return;
    }

    const parts = rest.split(/\s+/);
    if (parts.length < 2) {
      await replyLineMessage(replyToken, {
        type: "text",
        text: `⚠️ รูปแบบคำสั่งไม่ครบถ้วนค่ะปะป๊า!\nพิมพ์แบบนี้น้า: 👉 @มิมิ ตั้งสิทธิ์ [หม่ามี้/พี่ปอ/พี่ส้ม] [LINE UID]`,
      });
      return;
    }

    const roleInput = parts[0].toLowerCase();
    const targetUid = parts[1].trim();

    if (!targetUid.startsWith("U") || targetUid.length < 25) {
      await replyLineMessage(replyToken, {
        type: "text",
        text: `❌ รูปแบบ LINE UID ไม่ถูกต้องค่ะ (ต้องขึ้นต้นด้วย 'U' และมีความยาวมาตรฐาน เช่น U366bbe749237c...)`,
      });
      return;
    }

    let tierKey: "MAMI" | "POR" | "SOM" | null = null;
    if (/^(?:หม่ามี้|มาร์|มาริ|mari|mami)$/i.test(roleInput)) {
      tierKey = "MAMI";
    } else if (/^(?:พี่ปอ|ปอ|por|raya)$/i.test(roleInput)) {
      tierKey = "POR";
    } else if (/^(?:พี่ส้ม|ส้ม|som)$/i.test(roleInput)) {
      tierKey = "SOM";
    }

    if (!tierKey) {
      await replyLineMessage(replyToken, {
        type: "text",
        text: `⚠️ ไม่พบตำแหน่ง "${parts[0]}" ค่ะปะป๊า\nตำแหน่งที่สามารถตั้งสิทธิ์ได้:\n• หม่ามี้ (Tier S)\n• พี่ปอ (Tier B)\n• พี่ส้ม (Tier B)`,
      });
      return;
    }

    const assignedProfile = await saveDynamicAdminUid(targetUid, tierKey);

    await replyLineMessage(replyToken, {
      type: "text",
      text: `👑 บันทึกสิทธิ์สำเร็จเรียบร้อยแล้วค่ะปะป๊า!\n━━━━━━━━━━━━━━\n👤 ตำแหน่ง: ${assignedProfile.callName} (Tier ${assignedProfile.tier})\n🔑 LINE UID: ${targetUid}\n\nนับจากนี้ ${assignedProfile.callName} สามารถคุยงานและสั่งงานมิมิในกลุ่มหลังบ้านตามสิทธิ์ได้ทันทีค่ะ 🐰💖✨`,
    });
    return;
  }

  // C. View All Registered Admins & Status
  if (/^(?:สิทธิ์แอดมิน|เช็คสิทธิ์|เช็กสิทธิ์|ดูสิทธิ์|รายชื่อแอดมิน|แอดมินทั้งหมด)$/iu.test(cleanedText.trim())) {
    const list = getRegisteredAdminList();
    const rows = list.map((item) => {
      const uidsDisplay = item.uids.length > 0
        ? item.uids.map((u) => `• ${u}`).join("\n  ")
        : "• (ยังไม่มี UID)";
      return `👤 ${item.callName} (${item.displayName})\n  ระดับ: Tier ${item.tier} - ${item.roleDescription}\n  LINE UID:\n  ${uidsDisplay}`;
    }).join("\n\n");

    await replyLineMessage(replyToken, {
      type: "text",
      text: `📋 สิทธิ์ทีมงาน Store By Mari ในระบบ\n━━━━━━━━━━━━━━\n${rows}\n\n💡 ดู UID ของตนเอง: พิมพ์ "@มิมิ เช็คไอดี"\n💡 ปะป๊าตั้งสิทธิ์: พิมพ์ "@มิมิ ตั้งสิทธิ์ [ชื่อ] [UID]" 🐰✨`,
    });
    return;
  }

  // Existing mutation/control commands are restricted to registered operators.
  if (senderTier.tier === "E") {
    await replyLineMessage(replyToken, {
      type: "text",
      text: `คำสั่งเปลี่ยนแปลงระบบใช้ได้เฉพาะทีมงานที่ลงทะเบียนสิทธิ์ไว้ค่ะ\n(ตรวจพบชื่อ: ${senderName || "-"}\nUID: ${senderUserId || "ไม่พบ UID"})`,
    });
    return;
  }


  products = await getAvailableProducts(true);

  // Fast-path: Confidential finance protection for regular Admins (Shield cost and profit)
  if (!senderTier.canAccessDeepFinance) {
    if (
      lowerCleaned.includes("ต้นทุน") ||
      lowerCleaned.includes("กำไร") ||
      lowerCleaned.includes("มาร์จิ้น") ||
      lowerCleaned.includes("margin") ||
      lowerCleaned.includes("cost") ||
      lowerCleaned.includes("profit")
    ) {
      await replyLineMessage(replyToken, {
        type: "text",
        text: `🔒 ข้อมูลเรื่องการเงินเบื้องลึก ต้นทุน และกำไรของร้าน ${senderTier.callName} จ๋า มิมิต้องขออนุญาตจากปะป๊า (🦁 Zeries Sand 🦁) ก่อนน้าา ถึงจะเปิดเผยได้งับ ลองสะกิดถามปะป๊าดูน้า 🐰✨`,
      });
      return;
    }
  }

  // 1. Control Panel Command (Flex Master Switch)
  const isControlPanelCommand =
    cleanedText === "แผงควบคุม" ||
    cleanedText === "สวิตช์" ||
    cleanedText === "สวิตช์มิมิ" ||
    cleanedText === "dashboard" ||
    cleanedText === "control" ||
    cleanedText === "control panel" ||
    cleanedText === "ปุ่มมิมิ" ||
    lowerCleaned.includes("แผงควบคุม") ||
    lowerCleaned.includes("control panel") ||
    lowerCleaned.includes("สวิตช์") ||
    /^(เปิด|ขอ|ดู)?\s*(แผงควบคุม|สวิตช์|dashboard|control\s*panel|ปุ่มมิมิ)/i.test(lowerCleaned);

  if (isControlPanelCommand) {
    const globalState = await getMimiGlobalState();
    const activeCases = await listActiveChatLocks();
    const panelMsg = buildMimiControlPanelFlex({
      isPaused: globalState.isPaused,
      pausedBy: globalState.pausedBy,
      remainingMinutes: globalState.remainingMinutes,
      activeCasesCount: activeCases.filter((c) => c.isLocked).length,
    });
    await replyLineMessage(replyToken, panelMsg);
    return;
  }

  // 2. System Status Command
  const isSystemStatusCommand =
    cleanedText === "สถานะระบบ" ||
    cleanedText === "เช็กสถานะ" ||
    cleanedText === "สถานะ" ||
    cleanedText === "status" ||
    lowerCleaned.includes("สถานะระบบ") ||
    lowerCleaned.includes("system status") ||
    /^(เช็ก|ดู|ขอ)?\s*สถานะ(ระบบ)?/i.test(lowerCleaned);

  if (isSystemStatusCommand) {
    const globalState = await getMimiGlobalState();
    const activeCases = await listActiveChatLocks();
    const lockedCount = activeCases.filter((c) => c.isLocked).length;

    if (globalState.isPaused) {
      const timeInfo =
        globalState.remainingMinutes && globalState.remainingMinutes > 0
          ? `(เหลือเวลาพักอีก ~${globalState.remainingMinutes} นาที)`
          : "(ปิดแบบไม่มีกำหนด จนกว่าจะมีคำสั่งเปิด)";
      await replyLineMessage(replyToken, {
        type: "text",
        text: `🛑 สถานะระบบมิมิ: [หยุดตอบชั่วคราว / Paused]\n• สั่งพักโดย: ${globalState.pausedBy || "แอดมิน"}\n• เงื่อนไข: ${timeInfo}\n• เคสที่แอดมินคุยอยู่: ${lockedCount} เคส\n\n(พิมพ์ "@มิมิ เปิดระบบ" เพื่อเปิดมิมิกลับมาทำงานได้ทันทีค่า 🐰✨)`,
      });
    } else {
      await replyLineMessage(replyToken, {
        type: "text",
        text: `🟢 สถานะระบบมิมิ: [ทำงานปกติ / Active 24 ชม.]\n• สแตนด์บายตอบแชทและตรวจสลิป/รูปภาพลูกค้าใน LINE OA 100%\n• เคสที่แอดมินคุยอยู่: ${lockedCount} เคส\n\n(หากต้องการให้มิมิหยุดตอบเพื่อแอดมินคุยเอง พิมพ์ "@มิมิ แผงควบคุม" หรือ "@มิมิ หยุดตอบ" ได้เลยงับ 🐰🔒)`,
      });
    }
    return;
  }

  // 3. Global Pause / Emergency Stop Command
  const isGlobalPauseCommand =
    cleanedText.startsWith("หยุดตอบ") ||
    cleanedText.startsWith("ปิดระบบ") ||
    cleanedText.startsWith("พักมิมิ") ||
    cleanedText.startsWith("เงียบก่อน") ||
    cleanedText.startsWith("ปิดมิมิ") ||
    cleanedText === "emergency stop" ||
    cleanedText === "หยุด" ||
    lowerCleaned.includes("หยุดตอบ") ||
    lowerCleaned.includes("ปิดระบบ") ||
    lowerCleaned.includes("พักมิมิ") ||
    lowerCleaned.includes("ปิดมิมิ") ||
    lowerCleaned.includes("emergency stop") ||
    /^(สั่ง)?(หยุดตอบ|ปิดระบบ|พักมิมิ|ปิดมิมิ)/i.test(lowerCleaned);

  if (isGlobalPauseCommand) {
    let durationMinutes = 0; // 0 = indefinite
    const timeMatch = cleanedText.match(/(\d+(?:\.\d+)?)\s*(ชม|ชั่วโมง|hr|h|นาที|min|m)/i);
    if (timeMatch) {
      const val = parseFloat(timeMatch[1]);
      const unit = timeMatch[2].toLowerCase();
      if (unit.startsWith("ชม") || unit.startsWith("ชั่วโมง") || unit === "hr" || unit === "h") {
        durationMinutes = Math.round(val * 60);
      } else {
        durationMinutes = Math.round(val);
      }
    }

    if (senderTier.tier === "B" && durationMinutes === 0) {
      await replyLineMessage(replyToken, {
        type: "text",
        text: `⚠️ ${senderTier.callName} จ๋า การสั่งปิดมิมิทั้งร้านแบบไม่มีกำหนด ต้องได้รับอนุญาตจากปะป๊า (Tier SSS) หรือหม่ามี้ (Tier S) ก่อนน้าา 🐰🔒\n\n💡 แต่${senderTier.callName}สามารถสั่งพักมิมิชั่วคราวได้นะงับ เช่น:\n• @มิมิ พักมิมิ 30 นาที\n• @มิมิ พักมิมิ 1 ชม.\nหรือสั่งพักเฉพาะลูกค้าที่กำลังคุยด้วยคำสั่ง "@มิมิ รับเคส [ชื่อ]" ได้เลยค่า 💕`,
      });
      return;
    }


    const actorLabel = `${senderTier.callName} (${senderName})`;
    await setMimiGlobalPause(
      durationMinutes,
      actorLabel,
      `คำสั่งจากกลุ่มหลังบ้าน: "${cleanedText}"`
    );

    if (durationMinutes > 0) {
      await replyLineMessage(replyToken, {
        type: "text",
        text: `🛑 มิมิหยุดตอบลูกค้าใน LINE OA ทุกคนเป็นเวลา ${durationMinutes} นาที ให้เรียบร้อยแล้วค่า ${senderTier.callName}! 🐰🔒\n\nพี่ๆ แอดมินลุยคุยได้เต็มที่เลยนะงับ มิมิจะไม่แย่งตอบแน่นอนค่ะ (เมื่อครบเวลาจะกลับมาเองอัตโนมัติ หรือพิมพ์ "@มิมิ เปิดระบบ" เพื่อเปิดก่อนเวลาได้ตลอดเยยงับ) 💕`,
      });
    } else {
      await replyLineMessage(replyToken, {
        type: "text",
        text: `🛑 [Emergency Stop] มิมิปิดระบบการตอบกลับอัตโนมัติใน LINE OA ทั้งหมดเรียบร้อยแล้วค่า ${senderTier.callName}! 🐰🔒\n\nพี่ๆ แอดมินเข้าดูแลลูกค้าได้ 100% เลยน้าา สบายใจได้เยยงับ มิมิจะไม่แย่งตอบแม้แต่ข้อความเดียวค่าา ✨\n\n(เมื่อพร้อมให้มิมิกลับมาช่วยงาน พิมพ์ "@มิมิ เปิดระบบ" หรือกดเปิดที่ "@มิมิ แผงควบคุม" ได้ตลอดเลยน้าา) 💕`,
      });
    }
    return;
  }

  // 4. Global Resume Command
  const isGlobalResumeCommand =
    cleanedText === "เปิดระบบ" ||
    cleanedText === "ลุยต่อ" ||
    cleanedText === "กลับมาทำงาน" ||
    cleanedText === "เริ่มงาน" ||
    cleanedText === "เปิดมิมิ" ||
    cleanedText === "resume" ||
    lowerCleaned.includes("เปิดระบบ") ||
    lowerCleaned.includes("เปิดมิมิ") ||
    lowerCleaned.includes("กลับมาทำงาน") ||
    /^(เปิดระบบ|เปิดมิมิ|เริ่มงาน|ลุยต่อ|กลับมาทำงาน|resume)/i.test(lowerCleaned);

  if (isGlobalResumeCommand) {

    const actorLabel = `${senderTier.callName} (${senderName})`;
    await setMimiGlobalResume(actorLabel);
    await replyLineMessage(replyToken, {
      type: "text",
      text: `🟢 มิมิเปิดระบบตอบกลับอัตโนมัติใน LINE OA เรียบร้อยแล้วค่า ${senderTier.callName}! 🐰💖✨\n\nมิมิพร้อมสแตนด์บายช่วยดูแลและตอบลูกค้าตลอด 24 ชม. แล้วงับบ ปะป๊าและพี่ๆ สบายใจได้เยย ลุยยยย! 🚀`,
    });
    return;
  }

  // 5. Override All Cases (Tier SSS only)
  const isUnlockAllCommand =
    cleanedText === "ปลดล็อกทุกเคส" ||
    cleanedText === "เคลียร์ทุกเคส" ||
    cleanedText === "ปลดทุกเคส" ||
    cleanedText === "unlock all" ||
    lowerCleaned.includes("ปลดล็อกทุกเคส") ||
    lowerCleaned.includes("เคลียร์ทุกเคส") ||
    lowerCleaned.includes("unlock all") ||
    /^(ปลดล็อก|เคลียร์|ปลด)(ทุกเคส|เคสทั้งหมด)/i.test(lowerCleaned);

  if (isUnlockAllCommand) {
    if (senderTier.tier !== "SSS") {
      await replyLineMessage(replyToken, {
        type: "text",
        text: `👑 คำสั่งปลดล็อกเคสทั้งหมดพร้อมกัน สงวนสิทธิ์เฉพาะปะป๊า (Tier SSS) สูงสุดคนเดียวน้าา หากต้องการปลดเฉพาะเคส พิมพ์ "@มิมิ ปลดเคส [ชื่อ]" ได้เยยงับบ 🐰✨`,
      });
      return;
    }

    const count = await clearAllChatLocks();
    await replyLineMessage(replyToken, {
      type: "text",
      text: `👑 ปะป๊าสั่งปลดล็อกเคสทั้งหมด (${count} เคส) เรียบร้อยแล้วค่า! มิมิกลับมาดูแลลูกค้าทุกคนในระบบทันทีงับบ 🐰💖✨`,
    });
    return;
  }

  // Help command
  const isHelpCommand =
    cleanedText === "" ||
    cleanedText === "คำสั่ง" ||
    cleanedText === "เมนู" ||
    cleanedText === "help" ||
    /^(ดู)?คำสั่ง/i.test(lowerCleaned) ||
    lowerCleaned.includes("ช่วยอะไรได้บ้าง") ||
    lowerCleaned.includes("ทำอะไรได้บ้าง");

  if (isHelpCommand) {
    await replyLineMessage(replyToken, buildHelpFlex());
    return;
  }

  // Show active customer cases
  const isShowCasesCommand =
    cleanedText === "ดูเคส" ||
    cleanedText === "เคสทั้งหมด" ||
    cleanedText === "รายการเคส" ||
    cleanedText === "สถานะเคส" ||
    cleanedText === "เคสลูกค้า" ||
    lowerCleaned.includes("ดูเคส") ||
    lowerCleaned.includes("เคสทั้งหมด") ||
    lowerCleaned.includes("รายการเคส") ||
    /^(ดู|เช็ก|รายการ|สถานะ)?\s*(เคสทั้งหมด|เคสลูกค้า|รายการเคส)/i.test(lowerCleaned);

  if (isShowCasesCommand) {
    const cases = await listActiveChatLocks();
    await replyLineMessage(replyToken, buildActiveCasesFlex(cases));
    return;
  }

  // Show active knowledge rules: "@มิมิ ดูคู่มือ" / "@มิมิ ดูกฎ" / "@มิมิ ห้องสอนงาน"
  const isShowRulesCommand =
    cleanedText === "ดูคู่มือ" ||
    cleanedText === "ดูกฎ" ||
    cleanedText === "คู่มือ" ||
    cleanedText === "กฎทั้งหมด" ||
    cleanedText === "ห้องสอนงาน" ||
    cleanedText === "สอนอะไรบ้าง" ||
    lowerCleaned.includes("ดูคู่มือ") ||
    lowerCleaned.includes("ห้องสอนงาน") ||
    /^(ดู)?(คู่มือ|กฎทั้งหมด|ห้องสอนงาน)/i.test(lowerCleaned);

  if (isShowRulesCommand) {
    const rules = await getActiveKnowledgeRules();
    const list = rules
      .slice(0, 8)
      .map((r, i) => `${i + 1}. [${r.category}] "${r.situation}"\n   👉 ${r.guidance}`)
      .join("\n\n");
    await replyLineMessage(replyToken, {
      type: "text",
      text: `🧠 คลังความรู้ & คู่มือการตอบของมิมิ (เปิดใช้งาน ${rules.length} ข้อ):\n\n${list}\n\n💡 ${senderTier.callName} สามารถสอนเพิ่มได้ด้วยคำสั่ง:\n@มิมิ จำไว้นะ [สถานการณ์] ให้ตอบว่า [คำตอบ]\nหรือเข้าไปจัดการแบบละเอียดได้ที่หน้าเว็บแอดมิน "ห้องสอนงานมิมิ" ค่า 🐰✨`,
    });
    return;
  }

  // Live Teaching / Feedback Loop from Admin Group:
  const isTeaching =
    cleanedText.startsWith("จำไว้นะ") ||
    cleanedText.startsWith("สอนงาน") ||
    cleanedText.startsWith("กฎใหม่") ||
    cleanedText.startsWith("เรียนรู้นะ");

  if (isTeaching) {
    const content = cleanedText
      .replace(/^(จำไว้นะ|สอนงาน|กฎใหม่|เรียนรู้นะ)/i, "")
      .trim();

    const splitRegex = /(?:ให้ตอบว่า|ให้ตอบ|ตอบว่า|แนวทางตอบ|คำตอบคือ)\s+/i;
    const parts = content.split(splitRegex);

    if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
      const situation = parts[0]
        .replace(/^(ถ้า|กรณี|เมื่อ|หาก)/i, "")
        .trim();
      const guidance = parts.slice(1).join(" ").trim();

      const creator = `${senderTier.callName} (${senderName})`;
      const saved = await saveKnowledgeRule({
        category: "general",
        situation,
        guidance,
        source: "line_group",
        createdBy: creator,
      });

      await replyLineMessage(replyToken, {
        type: "text",
        text: `📝 มิมิบันทึกเข้าสมองเรียบร้อยแล้วค่า ${senderTier.callName}! 🐰🧠✨\n\n📌 สถานการณ์: "${saved.situation}"\n👉 แนวทางตอบ: "${saved.guidance}"\n\n(บันทึกโดย: ${creator} | ซิงก์ขึ้นเว็บแอดมินทันที มิมิพร้อมตอบลูกค้าตามนี้เลยงับ! 💕)`,
      });
      return;
    } else {
      await replyLineMessage(replyToken, {
        type: "text",
        text: `⚠️ ${senderTier.callName} พิมพ์รูปแบบนี้เพื่อสอนมิมิน้าา:\n\n@มิมิ จำไว้นะ [สถานการณ์] ให้ตอบว่า [คำตอบ]\n\nตัวอย่างเช่น:\n@มิมิ จำไว้นะ ลูกค้าบอกเน็ตฟลิกซ์จอเต็ม ให้ตอบว่า ขอเลขจอแล้วรอรีเซ็ต 15 นาที\n\nลองใหม่อีกทีนะงับบ 🐰✨`,
      });
      return;
    }
  }

  // Admin takes over / pauses Mimi: "@มิมิ รับเคส [ชื่อ]" or "@มิมิ พักเคส [ชื่อ]"
  if (
    cleanedText.startsWith("รับเคส") ||
    cleanedText.startsWith("พักเคส") ||
    cleanedText.startsWith("ล็อกเคส")
  ) {
    const query = cleanedText
      .replace(/^รับเคส/i, "")
      .replace(/^พักเคส/i, "")
      .replace(/^ล็อกเคส/i, "")
      .trim();

    if (!query) {
      await replyLineMessage(replyToken, {
        type: "text",
        text: `⚠️ ${senderTier.callName} ช่วยระบุชื่อลูกค้าหรือรหัสเคสที่ต้องการรับช่วงต่อด้วยน้า เช่น:\n@มิมิ รับเคส Somchai\nหรือพิมพ์ "@มิมิ ดูเคส" เพื่อดูรายชื่อลูกค้าที่คุยอยู่ได้เลยค่า 🐰✨`,
      });
      return;
    }

    const allCases = await listActiveChatLocks();
    const match = allCases.find(
      (c) =>
        c.customerName.toLowerCase().includes(query.toLowerCase()) ||
        c.userId.toLowerCase().includes(query.toLowerCase())
    );

    if (match) {
      await setChatLock(
        match.userId,
        DEFAULT_ADMIN_LOCK_DURATION_MS,
        match.customerName,
        `${senderTier.callName} (${senderName}) รับเคสจากกลุ่มหลังบ้าน`
      );
      await replyLineMessage(replyToken, {
        type: "text",
        text: `มิมิพักการตอบกลับคุณ "${match.customerName}" 30 นาทีให้เรียบร้อยแล้วค่า! ${senderTier.callName} ลุยคุยได้เต็มที่เลยน้าา 🐰🔒`,
      });
      return;
    }

    if (query.startsWith("U") && query.length > 20) {
      await setChatLock(
        query,
        DEFAULT_ADMIN_LOCK_DURATION_MS,
        "ลูกค้า",
        `${senderTier.callName} (${senderName}) รับเคสจากกลุ่มหลังบ้าน`
      );
      await replyLineMessage(replyToken, {
        type: "text",
        text: `มิมิพักการตอบกลับ User ID "${query}" 30 นาทีให้เรียบร้อยแล้วค่า! 🐰🔒`,
      });
      return;
    }

    await replyLineMessage(replyToken, {
      type: "text",
      text: `🥺 มิมิไม่พบชื่อลูกค้าหรือเคสที่ตรงกับ "${query}" ในรายการล่าสุดเลยค่ะ ลองพิมพ์ "@มิมิ ดูเคส" เพื่อดูรายชื่อทั้งหมดและกดปุ่มพักได้เลยน้าา 💕`,
    });
    return;
  }

  // Admin releases customer back to Mimi: "@มิมิ ปลดเคส [ชื่อ]" or "@มิมิ ดูแลต่อ [ชื่อ]"
  if (
    cleanedText.startsWith("ปลดเคส") ||
    cleanedText.startsWith("ดูแลต่อ") ||
    cleanedText.startsWith("ปลดล็อก")
  ) {
    const query = cleanedText
      .replace(/^ปลดเคส/i, "")
      .replace(/^ดูแลต่อ/i, "")
      .replace(/^ปลดล็อก/i, "")
      .trim();

    if (!query) {
      await replyLineMessage(replyToken, {
        type: "text",
        text: `⚠️ ช่วยระบุชื่อลูกค้าที่ต้องการให้มิมิดูแลต่อด้วยน้า เช่น:\n@มิมิ ปลดเคส Somchai\nหรือพิมพ์ "@มิมิ ดูเคส" เพื่อกดปุ่มปลดล็อกได้เลยค่า 🐰✨`,
      });
      return;
    }

    const allCases = await listActiveChatLocks();
    const match = allCases.find(
      (c) =>
        c.customerName.toLowerCase().includes(query.toLowerCase()) ||
        c.userId.toLowerCase().includes(query.toLowerCase())
    );

    if (match) {
      await removeChatLock(match.userId);
      await replyLineMessage(replyToken, {
        type: "text",
        text: `มิมิปลดล็อกคุณ "${match.customerName}" ให้เรียบร้อยแล้วค่า พร้อมกลับมาดูแลลูกค้าต่อทันทีงับ! 🐰💖`,
      });
      return;
    }

    if (query.startsWith("U") && query.length > 20) {
      await removeChatLock(query);
      await replyLineMessage(replyToken, {
        type: "text",
        text: `มิมิปลดล็อก User ID "${query}" เรียบร้อยแล้วค่า! 🐰💖`,
      });
      return;
    }

    await replyLineMessage(replyToken, {
      type: "text",
      text: `🥺 ไม่พบเคสที่ตรงกับ "${query}" เลยค่ะเตง ลองพิมพ์ "@มิมิ ดูเคส" ดูน้าา 💕`,
    });
    return;
  }

  // Check stock summary
  const isCheckStockCommand =
    cleanedText === "เช็กสต็อก" ||
    cleanedText === "ดูสต็อก" ||
    cleanedText === "สต็อก" ||
    cleanedText === "stock" ||
    lowerCleaned === "check stock" ||
    /^(เช็ก|ดู)?\s*(สต็อก|stock)$/i.test(lowerCleaned);

  if (isCheckStockCommand) {
    const freshProducts = await getAvailableProducts(true);
    await replyLineMessage(
      replyToken,
      buildStockSummaryFlex(
        freshProducts.map((p) => ({
          name: p.name,
          stock: p.stock,
          price: `฿${p.price}`,
        }))
      )
    );
    return;
  }

  // Retrieve rolling group chat context (Tier 3)
  const groupContext: GroupMessageContext[] = [];

  // Parse admin message using Gemini with speaker identity, tier matrix, and rolling group context
  const parsed = await parseAdminMessageWithGemini(rawText, products, senderName, senderTier, groupContext);

  if (parsed.intent === "CONTROL_PANEL") {
    const globalState = await getMimiGlobalState();
    const activeCases = await listActiveChatLocks();
    const panelMsg = buildMimiControlPanelFlex({
      isPaused: globalState.isPaused,
      pausedBy: globalState.pausedBy,
      remainingMinutes: globalState.remainingMinutes,
      activeCasesCount: activeCases.filter((c) => c.isLocked).length,
    });
    await replyLineMessage(replyToken, panelMsg);
    return;
  }

  if (parsed.intent === "SYSTEM_STATUS") {
    const globalState = await getMimiGlobalState();
    const activeCases = await listActiveChatLocks();
    const lockedCount = activeCases.filter((c) => c.isLocked).length;

    if (globalState.isPaused) {
      const timeInfo =
        globalState.remainingMinutes && globalState.remainingMinutes > 0
          ? `(เหลือเวลาพักอีก ~${globalState.remainingMinutes} นาที)`
          : "(ปิดแบบไม่มีกำหนด จนกว่าจะมีคำสั่งเปิด)";
      await replyLineMessage(replyToken, {
        type: "text",
        text: `🛑 สถานะระบบมิมิ: [หยุดตอบชั่วคราว / Paused]\n• สั่งพักโดย: ${globalState.pausedBy || "แอดมิน"}\n• เงื่อนไข: ${timeInfo}\n• เคสที่แอดมินคุยอยู่: ${lockedCount} เคส\n\n(พิมพ์ "@มิมิ เปิดระบบ" เพื่อเปิดมิมิกลับมาทำงานได้ทันทีค่า 🐰✨)`,
      });
    } else {
      await replyLineMessage(replyToken, {
        type: "text",
        text: `🟢 สถานะระบบมิมิ: [ทำงานปกติ / Active 24 ชม.]\n• สแตนด์บายตอบแชทและตรวจสลิป/รูปภาพลูกค้าใน LINE OA 100%\n• เคสที่แอดมินคุยอยู่: ${lockedCount} เคส\n\n(หากต้องการให้มิมิหยุดตอบเพื่อแอดมินคุยเอง พิมพ์ "@มิมิ แผงควบคุม" หรือ "@มิมิ หยุดตอบ" ได้เลยงับ 🐰🔒)`,
      });
    }
    return;
  }

  if (parsed.intent === "GLOBAL_PAUSE") {
    const durationMinutes = parsed.durationMinutes || 0;
    if (senderTier.tier === "B" && durationMinutes === 0) {
      await replyLineMessage(replyToken, {
        type: "text",
        text: `⚠️ ${senderTier.callName} จ๋า การสั่งปิดมิมิทั้งร้านแบบไม่มีกำหนด ต้องได้รับอนุญาตจากปะป๊า (Tier SSS) หรือหม่ามี้ (Tier S) ก่อนน้าา 🐰🔒\n\n💡 แต่${senderTier.callName}สามารถสั่งพักมิมิชั่วคราวได้นะงับ เช่น:\n• @มิมิ พักมิมิ 30 นาที\n• @มิมิ พักมิมิ 1 ชม.\nหรือสั่งพักเฉพาะลูกค้าที่กำลังคุยด้วยคำสั่ง "@มิมิ รับเคส [ชื่อ]" ได้เลยค่า 💕`,
      });
      return;
    }


    const actorLabel = `${senderTier.callName} (${senderName})`;
    await setMimiGlobalPause(
      durationMinutes,
      actorLabel,
      `คำสั่งจากกลุ่มหลังบ้าน (AI Intent): "${cleanedText}"`
    );

    if (durationMinutes > 0) {
      await replyLineMessage(replyToken, {
        type: "text",
        text: `🛑 มิมิหยุดตอบลูกค้าใน LINE OA ทุกคนเป็นเวลา ${durationMinutes} นาที ให้เรียบร้อยแล้วค่า ${senderTier.callName}! 🐰🔒\n\nพี่ๆ แอดมินลุยคุยได้เต็มที่เลยนะงับ มิมิจะไม่แย่งตอบแน่นอนค่ะ (เมื่อครบเวลาจะกลับมาเองอัตโนมัติ หรือพิมพ์ "@มิมิ เปิดระบบ" เพื่อเปิดก่อนเวลาได้ตลอดเยยงับ) 💕`,
      });
    } else {
      await replyLineMessage(replyToken, {
        type: "text",
        text: `🛑 [Emergency Stop] มิมิปิดระบบการตอบกลับอัตโนมัติใน LINE OA ทั้งหมดเรียบร้อยแล้วค่า ${senderTier.callName}! 🐰🔒\n\nพี่ๆ แอดมินเข้าดูแลลูกค้าได้ 100% เลยน้าา สบายใจได้เยยงับ มิมิจะไม่แย่งตอบแม้แต่ข้อความเดียวค่าา ✨\n\n(เมื่อพร้อมให้มิมิกลับมาช่วยงาน พิมพ์ "@มิมิ เปิดระบบ" หรือกดเปิดที่ "@มิมิ แผงควบคุม" ได้ตลอดเลยน้าา) 💕`,
      });
    }
    return;
  }

  if (parsed.intent === "GLOBAL_RESUME") {
    const actorLabel = `${senderTier.callName} (${senderName})`;
    await setMimiGlobalResume(actorLabel);
    await replyLineMessage(replyToken, {
      type: "text",
      text: `🟢 มิมิเปิดระบบตอบกลับอัตโนมัติใน LINE OA เรียบร้อยแล้วค่า ${senderTier.callName}! 🐰💖✨\n\nมิมิพร้อมสแตนด์บายช่วยดูแลและตอบลูกค้าตลอด 24 ชม. แล้วงับบ ปะป๊าและพี่ๆ สบายใจได้เยย ลุยยยย! 🚀`,
    });
    return;
  }

  if (parsed.intent === "UNLOCK_ALL") {
    if (senderTier.tier !== "SSS") {
      await replyLineMessage(replyToken, {
        type: "text",
        text: `👑 คำสั่งปลดล็อกเคสทั้งหมดพร้อมกัน สงวนสิทธิ์เฉพาะปะป๊า (Tier SSS) สูงสุดคนเดียวน้าา หากต้องการปลดเฉพาะเคส พิมพ์ "@มิมิ ปลดเคส [ชื่อ]" ได้เยยงับบ 🐰✨`,
      });
      return;
    }
    const count = await clearAllChatLocks();
    await replyLineMessage(replyToken, {
      type: "text",
      text: `👑 ปะป๊าสั่งปลดล็อกเคสทั้งหมด (${count} เคส) เรียบร้อยแล้วค่า! มิมิกลับมาดูแลลูกค้าทุกคนในระบบทันทีงับบ 🐰💖✨`,
    });
    return;
  }

  if (parsed.intent === "HELP") {
    await replyLineMessage(replyToken, buildHelpFlex());
    return;
  }

  if (parsed.intent === "CHECK_STOCK") {
    const freshProducts = await getAvailableProducts(true);
    if (parsed.productId) {
      const found = freshProducts.find((p) => p.id === parsed.productId);
      if (found) {
        await replyLineMessage(replyToken, {
          type: "text",
          text: `📦 ข้อมูลสินค้าภายในร้าน: "${found.name}"\n• สถานะ: ${found.stock > 0 ? "มีของพร้อมส่ง 🟢" : "สินค้าหมดชั่วคราว 🔴"}\n• จำนวนสต็อกคงเหลือ: ${found.stock} ชิ้น\n• ราคาขายหน้าร้าน: ฿${found.price}\n\nรายงานให้${senderTier.callName}ทราบเรียบร้อยแล้วค่า! 🐰✨`,
        });
        return;
      }
    }
    if (parsed.productName) {
      const searchKey = parsed.productName.toLowerCase().trim();
      const matched = freshProducts.filter((p) =>
        p.name.toLowerCase().includes(searchKey)
      );
      if (matched.length > 0) {
        await replyLineMessage(
          replyToken,
          buildStockSummaryFlex(
            matched.map((p) => ({
              name: p.name,
              stock: p.stock,
              price: `฿${p.price}`,
            }))
          )
        );
        return;
      }
    }
    await replyLineMessage(
      replyToken,
      buildStockSummaryFlex(
        freshProducts.map((p) => ({
          name: p.name,
          stock: p.stock,
          price: `฿${p.price}`,
        }))
      )
    );
    return;
  }

  if (parsed.intent === "STOCK_FILL") {
    // 1. Fetch fresh products with live account_data
    const freshProducts = await getAvailableProducts(true);

    let product = freshProducts.find((p) => p.id === parsed.productId);
    if (!product && parsed.productName) {
      const search = parsed.productName.toLowerCase().trim();
      product = freshProducts.find((p) =>
        p.name.toLowerCase().includes(search)
      );
    }

    // Smart Fallback Matching by keywords if still not found
    if (!product) {
      const textLower = rawText.toLowerCase();
      const candidates = freshProducts.filter((p) => {
        const pLower = p.name.toLowerCase();
        const services = ["netflix", "youtube", "viu", "prime", "wetv", "canva", "iqiyi", "capcut", "spotify"];
        const matchedService = services.find((s) => textLower.includes(s) && pLower.includes(s));
        if (!matchedService) return false;

        if (textLower.includes("7 วัน") || textLower.includes("7 day")) {
          if (!pLower.includes("7")) return false;
        } else if (textLower.includes("30 วัน") || textLower.includes("30 day") || textLower.includes("1 เดือน")) {
          if (!pLower.includes("30")) return false;
        }

        if (textLower.includes("มือถือ") || textLower.includes("mobile")) {
          if (!pLower.includes("มือถือ") && !pLower.includes("mobile")) return false;
        } else if (textLower.includes("ทีวี") || textLower.includes("tv") || textLower.includes("ทุกอุปกรณ์")) {
          if (!pLower.includes("ทุกอุปกรณ์") && !pLower.includes("tv")) return false;
        }

        return true;
      });

      if (candidates.length === 1) {
        product = candidates[0];
      }
    }

    if (!product) {
      await replyLineMessage(replyToken, {
        type: "text",
        text: `🥺 มิมิหาสินค้าที่บอกไม่เจอเลยงับ ช่วยระบุชื่อสินค้าหรือแพ็กเกจให้ชัดเจนอีกนิดนึงได้มั้ยคะ (เช่น Netflix 7 วัน ทุกอุปกรณ์, Viu 7 วัน, Canva EDU) น้าา 💕`,
      });
      return;
    }

    // 2. Extract Stock Items
    let items: ExtractedStockItem[] = parsed.stockItems || [];
    if (items.length === 0 && parsed.accounts && parsed.accounts.length > 0) {
      items = parsed.accounts.map((line) => {
        const parts = line.split(/[:|\t]+/).map((s) => s.trim());
        if (parts.length >= 2) {
          return {
            email: parts[0],
            password: parts[1],
            screen: parts[2] || undefined,
            raw: line,
          };
        }
        if (/^https?:\/\//i.test(line)) {
          return { inviteLink: line, raw: line };
        }
        return { email: line, raw: line };
      });
    }

    if (items.length === 0) {
      const fallbackLines = extractAccountsFallback(rawText);
      items = fallbackLines.map((line) => {
        const parts = line.split(/[:|\t]+/).map((s) => s.trim());
        if (parts.length >= 2) {
          return { email: parts[0], password: parts[1], screen: parts[2], raw: line };
        }
        if (/^https?:\/\//i.test(line)) {
          return { inviteLink: line, raw: line };
        }
        return { email: line, raw: line };
      });
    }

    if (items.length === 0) {
      await replyLineMessage(replyToken, {
        type: "text",
        text: `⚠️ มิมิตรวจไม่พบรายการบัญชีหรือลิงก์เลยค่ะเตง ลองส่งมาเป็น เช่น:\nuser1@gmail.com:pass123 จอ 1\nuser2@gmail.com:pass456 จอ 2\nหรือแนบข้อความส่งมอบของซัพพลายเออร์มาได้เยยงับ 🐰✨`,
      });
      return;
    }

    // 3. Prepare Batch with Template Form Injection and Deduplication
    const batchPrep = prepareStockBatch({
      product: {
        id: product.id,
        typeId: product.typeId,
        name: product.name,
        stockDeliveryType: product.stockDeliveryType as any,
        accountData: product.accountData,
      },
      items,
    });

    if (batchPrep.validAccounts.length === 0) {
      if (batchPrep.duplicateCount > 0) {
        await replyLineMessage(replyToken, {
          type: "text",
          text: `⚠️ ข้อมูลบัญชีทั้งหมด (${batchPrep.duplicateCount} รายการ) ซ้ำกับที่มีอยู่ในสต็อกของร้านแล้วค่า มิมิข้ามการบันทึกเพื่อป้องกันข้อมูลซ้ำน้าา 🐰🔒`,
        });
        return;
      }

      await replyLineMessage(replyToken, {
        type: "text",
        text: `⚠️ ข้อมูล Account ที่ตรวจพบไม่ถูกต้องหรือไม่สามารถสร้างฟอร์มส่งมอบได้ รบกวนตรวจเช็กข้อความแล้วลองใหม่อีกครั้งน้า 🥺`,
      });
      return;
    }

    // 4. Validate preview through stock append rules
    const preview = previewStockAppend({
      rawInput: batchPrep.rawInput,
      dataFormat: "long",
      separator: ",",
    });

    if (preview.validAccounts.length === 0) {
      await replyLineMessage(replyToken, {
        type: "text",
        text: `⚠️ ข้อมูล Account ไม่ถูกต้องค่ะ:\n${(preview.invalidReasons || []).slice(0, 3).join("\n")}\nรบกวนตรวจสอบข้อมูลแล้วลองใหม่อีกครั้งน้า 🥺`,
      });
      return;
    }

    const batchId = randomUUID();
    const currentStock = product.stock;
    const newStock = currentStock + batchPrep.validCount;
    const displayActor = `${senderTier.callName} (${senderName})`;

    const batch: PendingStockBatch = {
      batchId,
      productId: product.id,
      productName: product.name,
      typeId: product.typeId,
      stockDeliveryType: product.stockDeliveryType,
      currentStock,
      newStock,
      accounts: batchPrep.validAccounts.map((a) =>
        a.email ? `${a.email}:${a.password}` : a.details.substring(0, 30)
      ),
      rawInput: batchPrep.rawInput,
      previewForm: batchPrep.previewDeliveryForm,
      duplicateCount: batchPrep.duplicateCount,
      createdAt: Date.now(),
      actorName: displayActor,
    };

    await savePendingBatch(batch);

    // Format human-readable preview list
    const previewDisplayList = batchPrep.validAccounts.map((a) => {
      const screenMatch = a.details.match(/(?:📺|screen|จอ)\s*[:#-]?\s*([a-z0-9\u0e00-\u0e7f]+)/i);
      const screenTag = screenMatch ? ` (${screenMatch[0]})` : "";
      return a.email ? `${a.email}${screenTag}` : (a.details.length > 35 ? a.details.substring(0, 32) + "..." : a.details);
    });

    // 5. Send upgraded Flex confirmation card with full preview form
    await replyLineMessage(
      replyToken,
      buildStockConfirmFlex({
        batchId,
        productId: product.id,
        productName: product.name,
        accountCount: batchPrep.validCount,
        currentStock,
        newStock,
        previewAccounts: previewDisplayList,
        previewDeliveryText: batchPrep.previewDeliveryForm,
        duplicateCount: batchPrep.duplicateCount,
        stockDeliveryTypeLabel: getStockDeliveryTypeLabel(product.stockDeliveryType),
      })
    );
    return;
  }

  // Default: General query in admin group tailored by tier
  const defaultReply =
    senderTier.tier === "SSS"
      ? "มิมิรับทราบแล้วค่าา ปะป๊ามีอะไรให้มิมิรับใช้บอกได้ตลอดเลยนะงับ 🐰💖"
      : senderTier.tier === "S"
      ? "มิมิรับทราบแล้วค่าหม่ามี้ มีอะไรให้มิมิช่วยจัดการบอกได้เลยน้า 🐰🌸"
      : senderTier.tier === "B"
      ? `มิมิรับทราบแล้วค่า${senderTier.callName} มีเรื่องสต็อกหรือข้อมูลตรงไหนให้ช่วยเช็ก บอกได้เลยน้า 🐰✨`
      : "มิมิรับทราบแล้วค่า! ยินดีที่ได้ร่วมงานน้า มีอะไรให้ช่วยบอกได้เลยงับ 🐰✨";

  const reply = parsed.replyText || defaultReply;
  await replyLineMessage(replyToken, {
    type: "text",
    text: reply,
  });
}

/**
 * Handle incoming LINE webhook events
 */
export async function handleLineWebhookEvent(event: any) {
  const started = Date.now();
  try {
    await processLineWebhookEvent(event);
  } finally {
    console.info("[MIMI webhook timing]", { channel: event?.source?.type === "group" ? "group" : "oa", elapsedMs: Date.now() - started });
  }
}

async function processLineWebhookEvent(event: any) {
  await loadDynamicAdminUids().catch(() => {});
  const replyToken = event.replyToken;
  const source = event.source || {};

  // 1. Handle Bot Join Event (Added to group)
  if (event.type === "join") {
    await replyLineMessage(replyToken, buildHelpFlex());
    return;
  }

  // 2. Handle Postback Event (Buttons clicked on Flex Messages)
  if (event.type === "postback") {
    const data = event.postback?.data || "";
    const params = new URLSearchParams(data);
    const action = params.get("action");
    const isAdminPostback = isAuthorizedAdminSource(source, await getAdminGroupId());
    if (!isAdminPostback) {
      // Public Rich Menu postbacks arrive from a 1:1 user source. They must
      // follow the same customer AI/realtime-data path as typed messages, but
      // can never enter the admin mutation branch.
      if (source.type === "user") {
        const customerMessage = getCustomerRichMenuMessage(data);
        if (customerMessage) {
          await handleCustomerMessage(customerMessage, [], replyToken, source);
        } else {
          console.info("[LINE Rich Menu] ignored unknown public postback", { action: String(action || "").slice(0, 80) });
        }
      }
      return;
    }
    const operatorName = await getLineSenderName(source);
    if (resolveAdminTier(source.userId, operatorName).tier === "E") return;


    // A. Handle Chat Lock / Unlock Actions from Flex Cards
    if (action === "lock_chat") {
      const targetUserId = params.get("userId");
      const targetName = decodeURIComponent(params.get("userName") || "ลูกค้า");
      if (targetUserId) {
        await setChatLock(
          targetUserId,
          DEFAULT_ADMIN_LOCK_DURATION_MS,
          targetName,
          "แอดมินกดต่อเวลาพักจาก Flex Card"
        );
        await replyLineMessage(replyToken, {
          type: "text",
          text: `มิมิพักการตอบกลับคุณ "${targetName}" เพิ่มอีก 30 นาทีให้พี่แอดมินเรียบร้อยแล้วค่า! คุยต่อได้สบายใจเยยงับ 🐰🔒`,
        });
      }
      return;
    }

    if (action === "unlock_chat") {
      const targetUserId = params.get("userId");
      const targetName = decodeURIComponent(params.get("userName") || "ลูกค้า");
      if (targetUserId) {
        await removeChatLock(targetUserId);
        await replyLineMessage(replyToken, {
          type: "text",
          text: `มิมิปลดล็อกคุณ "${targetName}" ให้เรียบร้อยแล้วค่า พร้อมกลับมาดูแลลูกค้าต่อทันทีงับ! 🐰✨`,
        });
      }
      return;
    }

    // B. Handle Mimi Global Pause / Resume from Control Panel
    if (action === "mimi_global_pause") {
      const durationStr = params.get("duration") || "0";
      const duration = parseInt(durationStr, 10);
      const senderName = await getLineSenderName(source);
      const senderTier = resolveAdminTier(source.userId, senderName);

      if (senderTier.tier === "B" && duration === 0) {
        await replyLineMessage(replyToken, {
          type: "text",
          text: `⚠️ ${senderTier.callName} จ๋า การปิดมิมิทั้งร้านแบบไม่มีกำหนด ต้องให้ปะป๊า (Tier SSS) หรือหม่ามี้ (Tier S) กดน้าา แต่${senderTier.callName}สามารถกดปุ่ม "พัก 1 ชม." หรือ "พัก 2 ชม." ได้เยยงับบ 🐰🔒`,
        });
        return;
      }
      if (senderTier.tier === "E") return;

      const actorLabel = `${senderTier.callName} (${senderName})`;
      await setMimiGlobalPause(duration, actorLabel, "กดปุ่มจากแผงควบคุม Flex");

      if (duration > 0) {
        await replyLineMessage(replyToken, {
          type: "text",
          text: `🛑 ${actorLabel} กดพักมิมิใน LINE OA ${duration} นาที เรียบร้อยแล้วค่า! พี่ๆ คุยกับลูกค้าได้เต็มที่เลยน้าา 🐰🔒`,
        });
      } else {
        await replyLineMessage(replyToken, {
          type: "text",
          text: `🛑 [Emergency Mute] ${actorLabel} กดปิดมิมิทั้งร้านเรียบร้อยแล้วค่ะ! แอดมินเข้าดูแลลูกค้าได้ 100% เลยน้าา (กดเปิดคืนได้ที่แผงควบคุมเสมอค่า) 🐰🔒`,
        });
      }
      return;
    }

    if (action === "mimi_global_resume") {
      const senderName = await getLineSenderName(source);
      const senderTier = resolveAdminTier(source.userId, senderName);
      if (senderTier.tier === "E") return;

      const actorLabel = `${senderTier.callName} (${senderName})`;
      await setMimiGlobalResume(actorLabel);
      await replyLineMessage(replyToken, {
        type: "text",
        text: `🟢 ${actorLabel} กดเปิดระบบให้มิมิลุยต่อเรียบร้อยแล้วค่า! มิมิพร้อมตอบลูกค้าทันที 24 ชม. งับบ 🐰💖✨`,
      });
      return;
    }

    if (action === "view_active_cases") {
      const cases = await listActiveChatLocks();
      await replyLineMessage(replyToken, buildActiveCasesFlex(cases));
      return;
    }

    if (action === "unlock_all_cases") {
      const senderName = await getLineSenderName(source);
      const senderTier = resolveAdminTier(source.userId, senderName);
      if (senderTier.tier !== "SSS") {
        await replyLineMessage(replyToken, {
          type: "text",
          text: `👑 คำสั่งปลดล็อกเคสทั้งหมดพร้อมกัน สงวนสิทธิ์เฉพาะปะป๊า (Tier SSS) สูงสุดคนเดียวน้าา หากต้องการปลดเฉพาะเคส พิมพ์ "@มิมิ ปลดเคส [ชื่อ]" ได้เยยงับบ 🐰✨`,
        });
        return;
      }
      const count = await clearAllChatLocks();
      await replyLineMessage(replyToken, {
        type: "text",
        text: `👑 ปะป๊าสั่งปลดล็อกเคสทั้งหมด (${count} เคส) เรียบร้อยแล้วค่า! มิมิกลับมาดูแลลูกค้าทุกคนในระบบทันทีงับบ 🐰💖✨`,
      });
      return;
    }

    if (action === "show_control_panel") {
      const globalState = await getMimiGlobalState();
      const activeCases = await listActiveChatLocks();
      const panelMsg = buildMimiControlPanelFlex({
        isPaused: globalState.isPaused,
        pausedBy: globalState.pausedBy,
        remainingMinutes: globalState.remainingMinutes,
        activeCasesCount: activeCases.filter((c) => c.isLocked).length,
      });
      await replyLineMessage(replyToken, panelMsg);
      return;
    }

    const batchId = params.get("batchId");

    if (!batchId) return;

    if (action === "cancel_stock_fill") {
      await removePendingBatch(batchId);
      await replyLineMessage(replyToken, {
        type: "text",
        text: "มิมิยกเลิกการเติมสต็อกรอบนี้ให้เรียบร้อยแล้วค่ะ สบายใจได้น้า ไม่มีการเปลี่ยนแปลงข้อมูลใดๆ งับ 🐰✨",
      });
      return;
    }

    if (action === "confirm_stock_fill") {
      const batch = await getPendingBatch(batchId);
      if (!batch) {
        await replyLineMessage(replyToken, {
          type: "text",
          text: "⚠️ คำขอนี้หมดอายุหรือถูกทำรายการไปแล้วค่ะ (อายุคำขอ 15 นาที) รบกวนส่งรายการใหม่อีกครั้งน้า 🥺",
        });
        return;
      }

      const senderName = await getLineSenderName(source);
      const senderTier = resolveAdminTier(source.userId, senderName);
      const actorLabel = `${senderTier.callName} (${senderName})`;

      // Execute stock append using the core backend pipeline
      try {
        const outcome = await appendProductAccounts({
          productId: batch.productId,
          typeId: batch.typeId,
          rawInput: batch.rawInput,
          dataFormat: "long",
          separator: ",",
          stockDeliveryType: batch.stockDeliveryType,
          actorId: `LINE:${actorLabel}`,
          idempotencyKey: `line_batch_${batch.batchId}`,
        });

        if (outcome.kind === "success") {
          const body = outcome.body;
          await removePendingBatch(batchId);

          // Reply with success card
          await replyLineMessage(
            replyToken,
            buildStockSuccessFlex({
              productName: body.productName,
              addedCount: body.addedCount,
              newStock: body.remainingStock,
              actorName: actorLabel,
            })
          );

          // Trigger Auto-Pilot restock marketing push to website customers
          triggerMimiAutoPilot({
            productName: body.productName,
            amount: body.addedCount,
            remainingStock: body.remainingStock,
            previousStock: body.previousStock,
            actorName: actorLabel,
          }).catch((err) => {
            console.error("[LINE auto-pilot trigger error]:", err);
          });
        } else {
          await replyLineMessage(replyToken, {
            type: "text",
            text: `❌ ไม่สามารถเติมสต็อกได้: ${(outcome as any).body?.message || "เกิดข้อผิดพลาด"}`,
          });
        }
      } catch (err: any) {
        console.error("[LINE appendProductAccounts error]:", err);
        await replyLineMessage(replyToken, {
          type: "text",
          text: `❌ เกิดข้อผิดพลาดในการเติมสต็อก: ${err?.message || "ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง"}`,
        });
      }
      return;
    }
  }

  // 3. Handle Message Event (Text & Image)
  if (event.type === "message") {
    const isGroup = source.type === "group" || source.type === "room";
    if (isGroup && !isAuthorizedAdminSource(source, await getAdminGroupId())) return;
    const products: SimpleProduct[] = [];

    if (event.message?.type === "text") {
      const rawText = (event.message.text || "").trim();

      if (isGroup) {
        if (!isAuthorizedAdminSource(source, await getAdminGroupId())) return;
        // The configured staff group is conversational: no wake word is required.
        await handleAdminGroupMessage(rawText, products, replyToken, source, event.message?.mention);
      } else {
        // In 1:1 chat: This is a customer chatting with LINE OA
        await handleCustomerMessage(rawText, products, replyToken, source);
      }
    } else if (event.message?.type === "image") {
      if (!isGroup && event.message.id) {
        // In 1:1 chat: Customer sent a screenshot or photo for troubleshooting
        await handleCustomerImageMessage(event.message.id, products, replyToken, source);
      }
    }
  }
}
