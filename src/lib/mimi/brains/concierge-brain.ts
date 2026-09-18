/**
 * Mimi Concierge & Hospitality Brain (Brain C)
 * Specialized in welcoming customers, greetings, general store information, and cheerful chit-chat.
 * STRICT DATA ISOLATION:
 * - Completely stripped of complex technical repair SOPs.
 * - Stripped of massive product catalog dumps.
 * - Auto-loads only "announcement" and "general" knowledge rules.
 */

import { getKnowledgeRulesForBrain, formatKnowledgeForGeminiPrompt } from "../knowledge";
import { formatCustomerProfileForPrompt, MimiCustomerProfile, ConversationMessage } from "../memory";
import { getMimiPersonality } from "../personality";
import { callGeminiForMimi } from "./gemini-client";

export interface ConciergeBrainParams {
  userText: string;
  history?: ConversationMessage[];
  profile?: MimiCustomerProfile;
}

export async function generateConciergeReply(params: ConciergeBrainParams): Promise<string> {
  const { userText, history = [], profile } = params;

  // 1. Auto-fetch only announcements and general store knowledge rules
  const conciergeRules = await getKnowledgeRulesForBrain("concierge");
  const knowledgeBasePrompt = formatKnowledgeForGeminiPrompt(conciergeRules);

  // 2. Format context
  const conversationContextStr =
    history.length > 0
      ? history
          .slice(-4)
          .map((m) => `${m.role === "user" ? "ลูกค้า" : "มิมิ"}: ${m.text}`)
          .join("\n")
      : "เพิ่งเริ่มต้นการทักทาย";

  const customerProfileStr = profile
    ? formatCustomerProfileForPrompt(profile)
    : "• สถานะลูกค้า: ลูกค้าทั่วไป";

  // 3. Situational Personality for Concierge
  const personalityPrompt = getMimiPersonality("concierge");

  // 4. Dedicated Concierge Prompt
  const prompt = `You are "มิมิ" (Mimi) greeting or chatting with a customer on LINE OA.

${personalityPrompt}


### 📚 ประกาศและข้อมูลทั่วไปของร้าน (Knowledge Base):
${knowledgeBasePrompt}

### 🧠 ข้อมูลลูกค้า:
${customerProfileStr}

### 💬 บทสนทนาล่าสุด:
${conversationContextStr}

### 👤 ข้อความของลูกค้า:
"${userText}"

### กฎการตอบ (สนทนาเป็นธรรมชาติ น่ารัก ตรงประเด็น):
1. 🎯 **ตอบตามสถานการณ์จริงของลูกค้า:**
   - **หากเป็นการทักทายแรกเริ่ม (เช่น "สวัสดีครับ", "มิมิอยู่ไหม"):** ทักทายอย่างสดใส อบอุ่น 1 ประโยค และถามว่าสนใจดูแอปพรีเมียมตัวไหน หรือมีเรื่องไหนให้มิมิช่วยดูแลนะคะ
   - **หากเป็นคำถามทั่วไป หรือคุยต่อเนื่อง:** ตอบคำถามของลูกค้าให้ตรงประเด็นตามบริบทบทสนทนาทันที ไม่ทักทายซ้ำ และห้ามถามหาเลขออเดอร์หรือปัญหาแจ้งซ่อมหากลูกค้าไม่ได้แจ้งว่าสินค้ามีปัญหา
2. 🎯 **บุคลิกภาพมิมิ:** อบอุ่น เป็นมิตร สดใส น่ารัก คล่องแคล่ว มีชีวิตชีวา เหมือนพี่ส้มผู้ช่วยแอดมินใจดี
3. 🚫 **คำต้องห้าม:** ห้ามใช้คำว่า "คนดี", "งื้อออ", "ใจจะขาด", "รับน้องไปดูแล", "คนดีของมิมิ" เด็ดขาด
4. 🎯 **ความยาวทั้งสิ้น: สบายตา 1–2 บรรทัด (ไม่เกิน 25–40 คำ)**`;

  const reply = await callGeminiForMimi({
    prompt,
    temperature: 0.2,
    maxOutputTokens: 140,
    timeoutMs: 12000,
  });

  return (
    reply ||
    "มิมิอยู่นี่แล้วค่าเตง! ยินดีต้อนรับสู่ Store By Mari น้าา วันนี้สนใจแอปพรีเมียมตัวไหน หรือมีอะไรให้มิมิช่วยดูแล บอกได้เยยงับ 🐰✨"
  );
}
