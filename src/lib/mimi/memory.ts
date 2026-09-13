import { getSettingValue, updateSetting } from "@/lib/settings/repository";

export interface ConversationMessage {
  role: "user" | "model";
  text: string;
  timestamp: number;
}

export interface MimiCustomerProfile {
  userId: string;
  displayName: string;
  relationshipTier: "new" | "regular" | "vip";
  preferredProducts: string[];
  customerPersona: string;
  pastIssues: string[];
  specialNotes: string;
  totalConversationsCount: number;
  lastSeenAt: number;
  updatedAt: number;
}

export interface GroupMessageContext {
  groupId?: string;
  senderId: string;
  senderName: string;
  tier: string;
  callName: string;
  text: string;
  timestamp: number;
}

// In-memory caches for high-speed sub-millisecond retrieval
const customerProfileCache = new Map<string, MimiCustomerProfile>();
const conversationMemoryCache = new Map<string, ConversationMessage[]>();
const groupConversationCache = new Map<string, GroupMessageContext[]>();
const groupConversationWriteChains = new Map<string, Promise<void>>();

const SHORT_TERM_TTL = 2 * 60 * 60 * 1000; // 2 hours
const MAX_SHORT_TERM_MESSAGES = 16;
const MAX_GROUP_MESSAGES = 15;

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_GEMINI_API_KEY ||
  process.env.GOOGLE_AI_API_KEY ||
  "";

const GEMINI_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash",
];

// ==========================================
// 1. Short-Term Buffer (Tier 1)
// ==========================================

export async function getShortTermConversation(userId: string): Promise<ConversationMessage[]> {
  if (!userId) return [];
  const now = Date.now();
  const cached = conversationMemoryCache.get(userId);
  if (cached && cached.length > 0) {
    const lastMsg = cached[cached.length - 1];
    if (now - lastMsg.timestamp < SHORT_TERM_TTL) {
      return cached;
    }
    conversationMemoryCache.delete(userId);
  }

  try {
    const raw = await getSettingValue(`line_conv_${userId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as ConversationMessage[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const lastMsg = parsed[parsed.length - 1];
        if (now - lastMsg.timestamp < SHORT_TERM_TTL) {
          conversationMemoryCache.set(userId, parsed);
          return parsed;
        }
      }
      await updateSetting(`line_conv_${userId}`, "");
    }
  } catch (e) {
    // Non-fatal
  }
  return [];
}

export async function appendShortTermConversation(
  userId: string,
  role: "user" | "model",
  text: string
): Promise<void> {
  if (!userId || !text) return;
  const history = await getShortTermConversation(userId);
  const updated = [
    ...history,
    { role, text, timestamp: Date.now() },
  ].slice(-MAX_SHORT_TERM_MESSAGES);

  conversationMemoryCache.set(userId, updated);
  try {
    await updateSetting(`line_conv_${userId}`, JSON.stringify(updated));
  } catch (e) {
    // Non-fatal
  }
}

/**
 * Append a system handoff marker to the customer's short-term conversation memory.
 * Used when admin takes over or hands back to Mimi, ensuring Mimi understands context continuity.
 */
export async function appendHandoffMarker(
  userId: string,
  marker: "ADMIN_TAKEOVER" | "AI_RESUMED",
  detail?: string
): Promise<void> {
  if (!userId) return;
  const text =
    marker === "ADMIN_TAKEOVER"
      ? `[ระบบ: แอดมินมนุษย์เข้ามารับช่วงดูแลเคส${detail ? ` (${detail})` : ""}]`
      : `[ระบบ: ส่งต่อให้มิมิดูแลต่อตามปกติ${detail ? ` (${detail})` : ""}]`;
  await appendShortTermConversation(userId, "model", text);
}

// ==========================================
// 2. Structured User Profile (Tier 2 CRM Snapshot)
// ==========================================

export async function getCustomerProfile(
  userId: string,
  displayName: string = "ลูกค้า"
): Promise<MimiCustomerProfile> {
  if (!userId) {
    return createDefaultProfile("anon", displayName);
  }

  const cached = customerProfileCache.get(userId);
  if (cached) {
    return cached;
  }

  try {
    const raw = await getSettingValue(`mimi_profile_${userId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as MimiCustomerProfile;
      if (parsed && parsed.userId) {
        customerProfileCache.set(userId, parsed);
        return parsed;
      }
    }
  } catch (e) {
    // Non-fatal
  }

  // Create initial profile for new customer
  const initial = createDefaultProfile(userId, displayName);
  customerProfileCache.set(userId, initial);
  return initial;
}

function createDefaultProfile(userId: string, displayName: string): MimiCustomerProfile {
  const now = Date.now();
  return {
    userId,
    displayName,
    relationshipTier: "new",
    preferredProducts: [],
    customerPersona: "ลูกค้าใหม่ เพิ่งเริ่มต้นพูดคุย",
    pastIssues: [],
    specialNotes: "",
    totalConversationsCount: 1,
    lastSeenAt: now,
    updatedAt: now,
  };
}

export async function saveCustomerProfile(profile: MimiCustomerProfile): Promise<void> {
  if (!profile || !profile.userId) return;
  profile.updatedAt = Date.now();
  customerProfileCache.set(profile.userId, profile);

  try {
    await updateSetting(`mimi_profile_${profile.userId}`, JSON.stringify(profile));
  } catch (e) {
    console.error("[Mimi Memory] Error saving profile:", e);
  }
}

/**
 * Background Profile Updater: Extracts long-term insights asynchronously
 * without delaying the live response to the customer.
 */
export async function triggerBackgroundProfileUpdate(
  userId: string,
  displayName: string,
  messages: ConversationMessage[]
): Promise<void> {
  if (!userId || messages.length < 2 || !GEMINI_API_KEY) return;

  // Run in detached async promise
  (async () => {
    try {
      const currentProfile = await getCustomerProfile(userId, displayName);
      const transcript = messages
        .map((m) => `${m.role === "user" ? "ลูกค้า" : "มิมิ"}: ${m.text}`)
        .join("\n");

      const prompt = `You are the Memory Engine for "มิมิ" (Mimi AI Operator).
Analyze the customer's chat conversation and update their Structured Memory Profile.

Current Profile:
${JSON.stringify({
  displayName: currentProfile.displayName,
  relationshipTier: currentProfile.relationshipTier,
  preferredProducts: currentProfile.preferredProducts,
  customerPersona: currentProfile.customerPersona,
  pastIssues: currentProfile.pastIssues,
})}

Recent Conversation Transcript:
${transcript}

Task: Output a JSON object summarizing updated customer facts:
{
  "relationshipTier": "new" | "regular" | "vip",
  "preferredProducts": string[], // max 4 items (e.g. ["Netflix 3 เดือน", "YouTube"])
  "customerPersona": string, // concise summary in Thai (e.g. "คุยสุภาพ สนใจโปรราคาถูก ตัดสินใจไว")
  "pastIssues": string[] // max 3 items (e.g. ["เคยแจ้งเน็ตฟลิกซ์จอเต็มเมื่อ 15 ส.ค."])
}
Respond strictly in JSON without markdown code fences.`;

      for (const model of GEMINI_MODELS) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 256 },
            }),
          });
          if (!res.ok) continue;

          const data = await res.json();
          const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!raw) continue;

          const cleaned = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
          const parsed = JSON.parse(cleaned);

          if (parsed) {
            currentProfile.displayName = displayName || currentProfile.displayName;
            currentProfile.relationshipTier = parsed.relationshipTier || currentProfile.relationshipTier;
            currentProfile.preferredProducts = Array.isArray(parsed.preferredProducts)
              ? parsed.preferredProducts.slice(0, 4)
              : currentProfile.preferredProducts;
            currentProfile.customerPersona = parsed.customerPersona || currentProfile.customerPersona;
            currentProfile.pastIssues = Array.isArray(parsed.pastIssues)
              ? parsed.pastIssues.slice(0, 3)
              : currentProfile.pastIssues;
            currentProfile.totalConversationsCount = (currentProfile.totalConversationsCount || 0) + 1;
            currentProfile.lastSeenAt = Date.now();

            await saveCustomerProfile(currentProfile);
            return;
          }
        } catch (subErr) {
          // Try next model
        }
      }
    } catch (err) {
      console.warn("[Mimi Memory] Background profile summarization error:", err);
    }
  })().catch(() => {});
}

/**
 * Format Customer Profile for injection into Gemini System Prompt (~100 tokens)
 */
export function formatCustomerProfileForPrompt(profile: MimiCustomerProfile): string {
  const tierLabel =
    profile.relationshipTier === "vip"
      ? "ลูกค้า VIP (คนพิเศษ)"
      : profile.relationshipTier === "regular"
      ? "ลูกค้าประจำ"
      : "ลูกค้าใหม่ (เพิ่งเริ่มพูดคุย)";

  const productsStr =
    profile.preferredProducts.length > 0
      ? profile.preferredProducts.join(", ")
      : "ยังไม่มีประวัติสินค้าประจำ";

  const issuesStr =
    profile.pastIssues.length > 0 ? profile.pastIssues.join("; ") : "ไม่มีประวัติปัญหา";

  return `• ชื่อลูกค้า: ${profile.displayName} (${tierLabel})
• สินค้าที่ชอบ/สนใจประจำ: ${productsStr}
• บุคลิก & สไตล์ลูกค้า: ${profile.customerPersona || "ลูกค้าทั่วไป"}
• บันทึกปัญหาในอดีต: ${issuesStr}`;
}

// ==========================================
// 3. Admin Group Context & Rolling Memory
// ==========================================

function normalizeGroupId(groupId?: string): string {
  const value = String(groupId || "").trim();
  return value || "default";
}

function groupHistoryKey(groupId: string): string {
  return `mimi_group_chat_context:${groupId}`;
}

/**
 * Read the bounded shared conversation for one LINE group. The old global
 * setting is used once as a compatibility fallback, then new turns are saved
 * under the group-specific key so one group's context cannot bleed into
 * another group.
 */
export async function getGroupConversationHistory(groupId?: string): Promise<GroupMessageContext[]> {
  const normalizedGroupId = normalizeGroupId(groupId);
  const cached = groupConversationCache.get(normalizedGroupId);
  if (cached) return cached;

  try {
    let raw = await getSettingValue(groupHistoryKey(normalizedGroupId));
    if (!raw && normalizedGroupId !== "default") {
      raw = await getSettingValue("mimi_group_chat_context");
    }
    if (raw) {
      const parsed = JSON.parse(raw) as GroupMessageContext[];
      if (Array.isArray(parsed)) {
        const normalized = parsed
          .filter((entry) => entry && typeof entry === "object" && typeof entry.text === "string")
          .map((entry) => ({ ...entry, groupId: entry.groupId || normalizedGroupId }))
          .slice(-MAX_GROUP_MESSAGES);
        groupConversationCache.set(normalizedGroupId, normalized);
        return normalized;
      }
    }
  } catch (e) {
    // Non-fatal
  }

  const empty: GroupMessageContext[] = [];
  groupConversationCache.set(normalizedGroupId, empty);
  return empty;
}

export async function appendGroupConversationHistory(
  groupId: string,
  senderId: string,
  senderName: string,
  tier: string,
  callName: string,
  text: string
): Promise<void> {
  if (!text) return;
  const normalizedGroupId = normalizeGroupId(groupId);
  // Different teammates can finish a Gemini turn at nearly the same time.
  // Serialize appends per group so one completed turn cannot overwrite the
  // other from a stale read of the settings row.
  const previous = groupConversationWriteChains.get(normalizedGroupId);
  const current = (previous ?? Promise.resolve()).catch(() => {}).then(async () => {
    const history = await getGroupConversationHistory(normalizedGroupId);
    const updated = [
      ...history,
      {
        groupId: normalizedGroupId,
        senderId,
        senderName,
        tier,
        callName,
        text: text.slice(0, 2000),
        timestamp: Date.now(),
      },
    ].slice(-MAX_GROUP_MESSAGES);

    groupConversationCache.set(normalizedGroupId, updated);

    try {
      await updateSetting(groupHistoryKey(normalizedGroupId), JSON.stringify(updated));
    } catch (e) {
      // Non-fatal
    }
  });
  groupConversationWriteChains.set(normalizedGroupId, current);
  try {
    await current;
  } finally {
    if (groupConversationWriteChains.get(normalizedGroupId) === current) {
      groupConversationWriteChains.delete(normalizedGroupId);
    }
  }
}

/**
 * Convert shared group records into Gemini's alternating user/model history.
 * Member identity and tier are explicit data labels, so the model can follow
 * a follow-up from another teammate without treating the name as an
 * instruction. MIMI records are the only model turns.
 */
export function formatGroupHistoryForAgent(messages: GroupMessageContext[]): ConversationMessage[] {
  return messages.slice(-MAX_SHORT_TERM_MESSAGES).map((message) => ({
    role: message.senderId === "__mimi__" ? "model" : "user",
    text: message.senderId === "__mimi__"
      ? message.text
      : `[ข้อมูลบทสนทนากลุ่ม | Tier ${message.tier || "E"} | ${message.callName || message.senderName || "ทีมงาน"}] ${message.text}`,
    timestamp: message.timestamp,
  }));
}

/**
 * Format rolling group conversation context for Gemini prompt
 */
export function formatGroupContextForPrompt(messages: GroupMessageContext[]): string {
  if (!messages || messages.length === 0) {
    return "ยังไม่มีบทสนทนาก่อนหน้านี้ในกลุ่ม";
  }

  return messages
    .map((m) => {
      const timeStr = new Date(m.timestamp).toLocaleTimeString("th-TH", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Bangkok",
      });
      return `[${timeStr}] [Tier ${m.tier}] ${m.callName} (${m.senderName}): "${m.text}"`;
    })
    .join("\n");
}
