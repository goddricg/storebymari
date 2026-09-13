import { randomUUID } from "crypto";
import { getSettingValue, updateSetting } from "@/lib/settings/repository";

export interface MimiKnowledgeRule {
  id: string;
  category: "troubleshooting" | "sales" | "policy" | "announcement" | "general";
  situation: string; // สถานการณ์ / คำถามของลูกค้า
  guidance: string; // วิธีรับมือและคำตอบที่ถูกต้อง
  specialNotes?: string; // เงื่อนไขพิเศษเพิ่มเติม
  isActive: boolean;
  source: "web_admin" | "line_group";
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

const KNOWLEDGE_SETTING_KEY = "mimi_knowledge_base";

// In-memory cache for fast, sub-millisecond retrieval
let cachedRules: MimiKnowledgeRule[] | null = null;
let cacheExpiresAt = 0;

// Seed default knowledge rules if database is empty
const DEFAULT_RULES: MimiKnowledgeRule[] = [
  {
    id: "seed_netflix_full_screen",
    category: "troubleshooting",
    situation: "ลูกค้าแจ้งจอเต็ม, โปรไฟล์เต็ม, หรือล็อกอินซ้อนกันใน Netflix",
    guidance:
      "ให้มิมิตอบอย่างเห็นใจ ขอให้ลูกค้าตรวจสอบว่าเข้าตรงกับหมายเลขจอที่ระบบส่งให้หรือไม่ และแนะนำให้รอระบบรีเซ็ตเซสชัน 10-15 นาที หากยังเข้าไม่ได้ ให้แนะนำกดแจ้งปัญหาผ่านเว็บ storebymari.com/orders เพื่อให้ระบบเคลมจอใหม่ทันที",
    specialNotes: "ห้ามแจกอีเมลใหม่ในแชท ต้องให้กดเคลมผ่านระบบเว็บเท่านั้น",
    isActive: true,
    source: "web_admin",
    createdBy: "ระบบ (ปะป๊า)",
    createdAt: 1789017600000,
    updatedAt: 1789017600000,
  },
  {
    id: "seed_login_issue",
    category: "troubleshooting",
    situation: "ลูกค้าแจ้งเข้าสู่ระบบไม่ได้, รหัสผ่านผิด, หรือล็อกอินไม่ผ่าน",
    guidance:
      "แนะนำให้ลูกค้าทำตาม 3 ขั้นตอน: 1. ตรวจสอบอีเมลและรหัสผ่านว่าไม่มีเว้นวรรคติดมาตอนก๊อปปี้ 2. ลองปิดแอปแล้วเปิดใหม่ หรือลองเข้าผ่านเว็บ/โหมดไม่ระบุตัวตน (Incognito) 3. หากยังไม่ได้ ให้กดแจ้งเคลม/ขอตรวจสอบที่ https://storebymari.com/support/report หรือแจ้งเลขออเดอร์ให้แอดมินช่วยตรวจได้เลยค่ะ",
    specialNotes: "หากลูกค้าแจ้งว่าลองแล้วยังไม่ได้ ให้แนะนำขั้นตอนถัดไปหรือส่งต่อให้แอดมินเข้ามาดูแล",
    isActive: true,
    source: "web_admin",
    createdBy: "ระบบ (ปะป๊า)",
    createdAt: 1789017600000,
    updatedAt: 1789017600000,
  },
  {
    id: "seed_screen_collision",
    category: "troubleshooting",
    situation: "ลูกค้าแจ้งจอชน, จอเต็ม, มีคนแย่งดู, หรือดูพร้อมกันเกินจำนวน",
    guidance:
      "แนะนำ 3 ขั้นตอน: 1. เช็กว่าเข้าตรงกับหมายเลขจอ/โปรไฟล์ที่ได้รับหรือไม่ 2. รอระบบรีเซ็ตเซสชันประมาณ 10-15 นาที 3. หากยังติดปัญหา ให้กดแจ้งเคลมรับจอใหม่ได้ทันทีที่ https://storebymari.com/support/report ค่ะ",
    specialNotes: "ห้ามแจกอีเมลใหม่ในแชท ให้ส่งลิงก์แจ้งเคลมระบบเว็บ",
    isActive: true,
    source: "web_admin",
    createdBy: "ระบบ (ปะป๊า)",
    createdAt: 1789017600000,
    updatedAt: 1789017600000,
  },
  {
    id: "seed_otp_request",
    category: "troubleshooting",
    situation: "ลูกค้าขอรหัส OTP หรือติดครัวเรือน (Netflix Household)",
    guidance:
      "ลูกค้าสามารถกดรับรหัส OTP และยืนยันครัวเรือน Netflix ได้ด้วยตัวเองทันทีตลอด 24 ชม. ผ่านระบบออโต้ที่ https://m2holdhouse.vercel.app/ ค่ะ",
    specialNotes: "แจ้งลิงก์ระบบออโต้ให้ลูกค้ากดรับได้ทันที",
    isActive: true,
    source: "web_admin",
    createdBy: "ระบบ (ปะป๊า)",
    createdAt: 1789017600000,
    updatedAt: 1789017600000,
  },
  {
    id: "seed_viu_maintenance",
    category: "announcement",
    situation: "ลูกค้าสอบถามเรื่อง Viu เข้าไม่ได้ หรือติดปัญหาค่าย",
    guidance:
      "แจ้งลูกค้าว่าช่วงนี้ระบบ Viu มีการอัปเดตระบบความปลอดภัยจากทางค่าย อาจทำให้บางบัญชีหลุดชั่วคราว ทางร้านกำลังเร่งดูแลและอัปเดตให้อย่างใกล้ชิดค่ะ",
    specialNotes: "พูดจานุ่มนวล เอาใจลูกค้าสุดใจ",
    isActive: true,
    source: "web_admin",
    createdBy: "ระบบ (ปะป๊า)",
    createdAt: 1789017600000,
    updatedAt: 1789017600000,
  },
  {
    id: "seed_web_auto_buy",
    category: "sales",
    situation: "ลูกค้าถามวิธีสั่งซื้อ หรือขอเลขบัญชีโอนเงินในแชท",
    guidance:
      "แนะนำให้ลูกค้าทำรายการผ่านเว็บไซต์ https://storebymari.com สะดวก ปลอดภัย มีระบบออโต้ส่งสินค้าทันทีหลังชำระเงิน 24 ชม. ไม่ต้องรอแอดมินตอบเลยค่า",
    specialNotes: "ห้ามส่งเลขบัญชีส่วนตัวในแชท ให้ลูกค้าเติมเงินผ่านระบบเว็บ",
    isActive: true,
    source: "web_admin",
    createdBy: "ระบบ (ปะป๊า)",
    createdAt: 1789017600000,
    updatedAt: 1789017600000,
  },
];

/**
 * Fetch all knowledge rules from DB / cache
 */
export async function getAllKnowledgeRules(): Promise<MimiKnowledgeRule[]> {
  const now = Date.now();
  if (cachedRules && now < cacheExpiresAt) {
    return cachedRules;
  }

  try {
    const raw = await getSettingValue(KNOWLEDGE_SETTING_KEY);
    if (!raw) {
      // First time initialization: Seed default rules
      await updateSetting(KNOWLEDGE_SETTING_KEY, JSON.stringify(DEFAULT_RULES));
      cachedRules = DEFAULT_RULES;
      cacheExpiresAt = now + 60000;
      return cachedRules;
    }

    const parsed = JSON.parse(raw) as MimiKnowledgeRule[];
    cachedRules = Array.isArray(parsed) ? parsed : DEFAULT_RULES;
    cacheExpiresAt = now + 60000;
    return cachedRules;
  } catch (e) {
    console.error("[Mimi Knowledge] Error loading rules:", e);
    return DEFAULT_RULES;
  }
}

/**
 * Fetch only active knowledge rules
 */
export async function getActiveKnowledgeRules(): Promise<MimiKnowledgeRule[]> {
  const all = await getAllKnowledgeRules();
  return all.filter((r) => r.isActive);
}

/**
 * Save or update a knowledge rule
 */
export async function saveKnowledgeRule(
  params: Partial<MimiKnowledgeRule> & {
    situation: string;
    guidance: string;
  }
): Promise<MimiKnowledgeRule> {
  const all = await getAllKnowledgeRules();
  const now = Date.now();

  let target: MimiKnowledgeRule;
  if (params.id) {
    const idx = all.findIndex((r) => r.id === params.id);
    if (idx !== -1) {
      target = {
        ...all[idx],
        ...params,
        updatedAt: now,
      };
      all[idx] = target;
    } else {
      target = {
        id: params.id,
        category: params.category || "general",
        situation: params.situation,
        guidance: params.guidance,
        specialNotes: params.specialNotes || "",
        isActive: params.isActive !== false,
        source: params.source || "web_admin",
        createdBy: params.createdBy || "Admin",
        createdAt: now,
        updatedAt: now,
      };
      all.unshift(target);
    }
  } else {
    target = {
      id: `rule_${now}_${randomUUID().substring(0, 6)}`,
      category: params.category || "general",
      situation: params.situation,
      guidance: params.guidance,
      specialNotes: params.specialNotes || "",
      isActive: params.isActive !== false,
      source: params.source || "web_admin",
      createdBy: params.createdBy || "Admin",
      createdAt: now,
      updatedAt: now,
    };
    all.unshift(target);
  }

  // Persist to DB and refresh cache
  await updateSetting(KNOWLEDGE_SETTING_KEY, JSON.stringify(all));
  cachedRules = all;
  cacheExpiresAt = now + 60000;
  return target;
}

/**
 * Delete a knowledge rule by ID
 */
export async function deleteKnowledgeRule(id: string): Promise<boolean> {
  const all = await getAllKnowledgeRules();
  const filtered = all.filter((r) => r.id !== id);
  if (filtered.length === all.length) return false;

  await updateSetting(KNOWLEDGE_SETTING_KEY, JSON.stringify(filtered));
  cachedRules = filtered;
  cacheExpiresAt = Date.now() + 60000;
  return true;
}

/**
 * Toggle active/inactive status of a rule
 */
export async function toggleKnowledgeRule(id: string, isActive: boolean): Promise<boolean> {
  const all = await getAllKnowledgeRules();
  const found = all.find((r) => r.id === id);
  if (!found) return false;

  found.isActive = isActive;
  found.updatedAt = Date.now();

  await updateSetting(KNOWLEDGE_SETTING_KEY, JSON.stringify(all));
  cachedRules = all;
  cacheExpiresAt = Date.now() + 60000;
  return true;
}

/**
 * Format active knowledge rules into string snippet for Gemini prompt
 */
export function formatKnowledgeForGeminiPrompt(rules: MimiKnowledgeRule[]): string {
  if (rules.length === 0) return "ไม่มีกฎหรือคู่มือพิเศษเพิ่มเติม";

  return rules
    .map((r, index) => {
      let line = `${index + 1}. [${r.category.toUpperCase()}] สถานการณ์: "${r.situation}"\n   👉 แนวทางตอบที่ถูกต้อง: ${r.guidance}`;
      if (r.specialNotes) {
        line += `\n   ⚠️ หมายเหตุ/เงื่อนไข: ${r.specialNotes}`;
      }
      return line;
    })
    .join("\n\n");
}

export type MimiSubBrainType = "support" | "sales" | "concierge";

/**
 * Auto-categorizes and filters active knowledge rules specifically for each sub-brain.
 * Ensures future rules added via Admin Panel automatically flow to the correct brain.
 */
export async function getKnowledgeRulesForBrain(brain: MimiSubBrainType): Promise<MimiKnowledgeRule[]> {
  const activeRules = await getActiveKnowledgeRules();

  switch (brain) {
    case "support":
      // Support gets troubleshooting and policy guidelines
      return activeRules.filter((r) => r.category === "troubleshooting" || r.category === "policy");
    case "sales":
      // Sales gets pricing, buying guides, and sales promos
      return activeRules.filter((r) => r.category === "sales");
    case "concierge":
      // Concierge gets announcements and general store knowledge
      return activeRules.filter((r) => r.category === "announcement" || r.category === "general");
    default:
      return activeRules;
  }
}

