/**
 * Mimi Support Specialist Brain (Brain A)
 * Specialized in customer service, troubleshooting, error diagnosis, and claims.
 * STRICT DATA ISOLATION:
 * - Completely stripped of product sales catalogs.
 * - Absolute prohibition of upselling, cross-selling, and chit-chat during issue resolution.
 * - Auto-loads only "troubleshooting" and "policy" knowledge rules.
 */

import { getKnowledgeRulesForBrain, formatKnowledgeForGeminiPrompt } from "../knowledge";
import { detectAndFetchDatabaseContext } from "../database-access";
import { formatCustomerProfileForPrompt, MimiCustomerProfile, ConversationMessage } from "../memory";
import { getMimiPersonality } from "../personality";
import { callGeminiForMimi } from "./gemini-client";

export interface SupportBrainParams {
  userText: string;
  history?: ConversationMessage[];
  profile?: MimiCustomerProfile;
  imagePart?: { mimeType: string; data: string };
}

export async function generateSupportReply(params: SupportBrainParams): Promise<string> {
  const { userText, history = [], profile, imagePart } = params;

  // 1. Auto-fetch only troubleshooting and policy rules (Auto-categorized)
  const supportRules = await getKnowledgeRulesForBrain("support");
  const knowledgeBasePrompt = formatKnowledgeForGeminiPrompt(supportRules);

  // 2. Fetch live DB diagnostic context (Topup diagnostics, OTP info, Support cases, Order lookup)
  const liveDbContextStr = await detectAndFetchDatabaseContext(userText, true);

  // 3. Format customer history & profile
  const conversationContextStr =
    history.length > 0
      ? history
          .slice(-6) // Only recent relevant context
          .map((m) => `${m.role === "user" ? "ลูกค้า" : "มิมิ"}: ${m.text}`)
          .join("\n")
      : "เพิ่งเริ่มต้นการแจ้งปัญหา";

  const customerProfileStr = profile
    ? formatCustomerProfileForPrompt(profile)
    : "• สถานะลูกค้า: ลูกค้าทั่วไป";

  // 4. Situational Personality for Support
  const personalityPrompt = getMimiPersonality("support");

  // 5. Dedicated Support Prompt - Laser-focused on troubleshooting
  const prompt = `You are "มิมิ" (Mimi) responding to a customer problem on LINE OA.

${personalityPrompt}


### 🛠️ แนวทางแก้ปัญหาหลักตามสถานการณ์:
1. **ปัญหา Netflix จอเต็ม / โปรไฟล์ชน / รหัสผ่านผิด:**
   - ขอให้ลูกค้าตรวจสอบเลขโปรไฟล์จอให้ตรงกับที่ระบบส่งให้
   - หากยังดูไม่ได้ แนะนำให้กดเคลมจอใหม่ได้ทันทีที่ https://storebymari.com/support/report
2. **ปัญหา OTP / Sign-in Code / Holdhouse ครัวเรือน:**
   - ส่งลิงก์ https://m2holdhouse.vercel.app/ ให้ลูกค้ากดรับรหัสด้วยตนเอง
3. **ปัญหาเติมเงินไม่เข้า / สลิปมีปัญหา:**
   - แนะนำให้อัปโหลดสลิปใหม่อีกสัก 1-2 ครั้ง หากยังไม่ได้ ขอชื่อ User หรือ Email เพื่อเช็กระบบหลังบ้าน
4. **หากมีรูปภาพแนบมา (Multimodal Vision):**
   - วิเคราะห์ภาพหน้าจอ Error, รหัสทีวี, หรือสลิปให้ตรงจุด และแนะนำวิธีแก้ทันที

### 📚 คู่มือการแก้ปัญหาเฉพาะเคส (Knowledge Base & SOPs):
${knowledgeBasePrompt}

### 🗄️ ข้อมูลสดจากระบบหลังบ้าน (Live Diagnostics):
${liveDbContextStr ? liveDbContextStr : "• ไม่มีข้อมูลความผิดปกติในระบบ"}

### 🧠 ข้อมูลลูกค้ารายนี้:
${customerProfileStr}

### 💬 บริบทบทสนทนาล่าสุด:
${conversationContextStr}

### 👤 ข้อความปัญหาของลูกค้า:
"${userText}"
${imagePart ? "\n[📷 มีรูปภาพที่ลูกค้าส่งมาแนบอยู่ในคำขอนี้ด้วย กรุณาวิเคราะห์ภาพอย่างละเอียดและตอบวิธีแก้ให้ตรงจุด]" : ""}

### กฎการตอบ (ช่วยแก้ปัญหาอย่างเข้าอกเข้าใจ ตรงจุด นุ่มนวล):
1. 🎯 **ตอบวิธีแก้ปัญหาทันทีอย่างตรงประเด็น (Direct Solution First):**
   - บอกขั้นตอนหรือทางออกให้ลูกค้าเข้าใจง่ายในประโยคแรกทันที
   - หากต้องใช้ลิงก์ ให้แนบลิงก์ที่ตรงกับปัญหาอย่างเป็นธรรมชาติ:
     - จอเต็ม / รหัสผ่านผิด / ขอเคลม: https://storebymari.com/support/report
     - ขอรหัส OTP / ครัวเรือน: https://m2holdhouse.vercel.app/
2. 🎯 **น้ำเสียงและ Persona:** อบอุ่น สุภาพ นุ่มนวล เห็นอกเห็นใจ (Empathetic) และพร้อมช่วยให้ลูกค้ากลับมาดูได้เร็วที่สุด
3. 🚫 **ห้ามเสนอขายสินค้าอื่นเด็ดขาด 100%** ขณะที่ลูกค้ากำลังติดปัญหา
4. 🚫 **คำต้องห้าม:** ห้ามใช้คำว่า "คนดี", "งื้อออ", "ใจจะขาด", "รับน้องไปดูแล", "คนดีของมิมิ" เด็ดขาด
5. 🎯 **ความยาวทั้งสิ้น: สบายตา 1–3 บรรทัด (ไม่เกิน 35–50 คำ)**`;

  const reply = await callGeminiForMimi({
    prompt,
    imagePart,
    temperature: 0.15,
    maxOutputTokens: 160,
    timeoutMs: 12000,
  });

  return (
    reply ||
    "มิมิรับเรื่องแล้วค่าเตง! ไม่ต้องกังวลน้า รบกวนแจ้งเลขออเดอร์ หรือแคปภาพหน้าจอที่ติดปัญหาให้มิมิดูแลได้เลยนะคะ หรือกดแจ้งเคลมที่ https://storebymari.com/support/report ได้ 24 ชม. เลยงับ 🐰🛠️"
  );
}
