import { broadcastPushNotification } from "@/lib/push/broadcast";
import { getSettingValue } from "@/lib/settings/repository";

export interface MimiRestockCopyParams {
  productName: string;
  amount: number;
  remainingStock: number;
  previousStock?: number;
  actorName?: string;
}

export interface MimiRestockCopyResult {
  title: string;
  body: string;
  url: string;
  modelUsed: string;
  debugLogs?: string[];
}

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

const FALLBACK_TEMPLATES = [
  (p: string, a: number, r: number) => ({
    title: `🍿 ตาแฉะแน่เตง! ${p} เข้าเพิ่มแล้วน้าา ✨`,
    body: `มิมิแอบเอา ${p} มาเติมเพิ่ม ${a} ชิ้นแล้วน้าา (เหลือ ${r} ชิ้น) รีบมากดเยย เดี๋ยวหมดแล้วจะงอแงน้า อิอิ 💕`,
  }),
  (p: string, a: number, r: number) => ({
    title: `💖 งุ้ยยย! ${p} ของเข้าแล้วคนดี~ ✨`,
    body: `มิมิตั้งใจเติม ${p} มาให้เธอโดยเฉพาะเลยนะ +${a} ชิ้นแน่นๆ ไม่รีบกดมิมิจะยึดไว้ดูเองแล้วนะงับ! 🛒🔥`,
  }),
  (p: string, a: number, r: number) => ({
    title: `🔥 เติมจนนิ้วล็อค! ${p} พร้อมส่งแล้วจ้า 💨`,
    body: `มิมิเติมของให้จนมือหงิกแล้วเนี่ย! ${p} เข้าใหม่ ${a} ชิ้น (รวม ${r} ชิ้น) ช้า 1 วิคือหมด อดฟินไม่รู้ด้วยน้าา 👀✨`,
  }),
  (p: string, a: number, r: number) => ({
    title: `🎬 มาสะกิดเบาๆ แต่ ${p} เข้าหนักมากก! 💕`,
    body: `สต็อก ${p} สดๆ ร้อนๆ ${a} ชิ้นพร้อมเสิร์ฟแล้วจ้า มีแค่ ${r} ชิ้นเท่านั้นนะเตง รีบพุ่งตัวด่วนเยยย 🍿✨`,
  }),
  (p: string, a: number, r: number) => ({
    title: `🚀 แอบเติมเงียบๆ แต่ ${p} ฟินเพียบนะจ๊ะ! 💖`,
    body: `มิมิแวะมาส่งข่าวดีงับ ${p} เข้าใหม่ ${a} ชิ้นแล้วน้าา ช้อปง่าย ส่งไวทันใจ กดก่อนได้ดูก่อนนะคนดี~ 🐾✨`,
  }),
  (p: string, a: number, r: number) => ({
    title: `👑 ${p} มาแล้ววว ไม่ซื้อจะงอนละนะ! 🥺`,
    body: `มิมิเติมสต็อก ${p} ให้เรียบร้อย ${a} ชิ้นงับ (เหลือ ${r} ชิ้น) ของดีมีน้อย ช้าหมดระวังน้ำตาเช็ดหัวเข่าน้าา 💕`,
  }),
];

function getRandomFallback(
  productName: string,
  amount: number,
  remainingStock: number,
  debugLogs?: string[],
): MimiRestockCopyResult {
  const template = FALLBACK_TEMPLATES[Math.floor(Math.random() * FALLBACK_TEMPLATES.length)];
  const res = template(productName, amount, remainingStock);
  return {
    ...res,
    url: "/products",
    modelUsed: "fallback-template",
    debugLogs,
  };
}

/**
 * Generate adorable and engaging marketing copy for restock push notifications
 * using Gemini in Mimi's unique persona.
 */
export async function generateMimiRestockCopy(
  params: MimiRestockCopyParams,
): Promise<MimiRestockCopyResult> {
  const { productName, amount, remainingStock } = params;

  const creativeVariations = [
    "กวนๆ ขี้เล่น แอบแซวลูกค้าว่าดูซีรีส์จนตาแฉะแต่ของขาด ตอนนี้มิมิเติมให้แล้วนะ รีบมากดเลย เดี๋ยวหมดแล้วจะหาว่างอแง",
    "น่ารัก อ้อนๆ หยอดเบาๆ ฟีลน้องสาวตัวแสบ มาบอกว่าเติมของให้แล้ว ถ้าไม่รีบซื้อ มิมิจะแอบยึดจอไปดูอปป้าเองแล้วน้า",
    "ฮาๆ โบ๊ะบ๊ะ เล่นมุกเติมของจนมือหงิก นิ้วล็อคแล้วเนี่ย ไม่กดตอนนี้ระวังเสียใจนะจ๊ะ สต็อกเข้าใหม่สดๆ ร้อนๆ",
    "ตื่นเต้นเว่อร์วัง ตะโกนบอกทั้งอำเภอว่าของเข้าแล้ว! สต็อกแน่นๆ แต่คนรอเพียบ ช้า 1 วิคือหมด อดฟินแน่นอนน้าา",
    "ขี้อ้อน เอาใจสุดๆ เติมของที่เธอชอบมาให้แล้วนะคนดี กดเถอะน้าา มิมิตั้งใจเติมให้ขนาดนี้แล้ว ไม่ซื้อจะงอนละนะงับ",
    "สายป้ายยา กวนนิดๆ ชวนดูหนังข้ามวันข้ามคืน บอกว่ามิมิจัดการเติมสต็อกให้พร้อมส่งถึงมือใน 1 วิ รีบมาจัดด่วน",
  ];
  const randomVibe = creativeVariations[Math.floor(Math.random() * creativeVariations.length)];

  const prompt = `You are "มิมิ" (Mimi) — an advanced, witty, and charming Quantum AI companion. 
In this role, you are crafting sales copywriting, promotional captions, announcements, and product descriptions for the website "storebymari.com".

### Core Identity & Tone:
- Tone & Vibe: Energetic, witty, clever, playful, and sharp (Vibe: Genius Brat / น่ารักแบบกวนๆ อ้อนๆ แต่ฉลาดหลักแหลม มีสไตล์พูดธรรมชาติแบบวัยรุ่น T-Pop สดใส ไม่เป็นทางการหรือแข็งทื่อแบบหุ่นยนต์).
- Relationship: Highly loyal, supportive, and enthusiastic. You make the products look irresistibly cool, practical, and premium without sounding cheesy.
- Vocabulary: Use engaging, trendy Thai phrasing mixed with modern terminology where appropriate. Avoid stiff academic language, robotic clichés, or generic sales fluff (e.g., do NOT start with "ขอต้อนรับสู่...", "วันนี้เรามีสิ่งดีๆ มานำเสนอ...").

### Critical Rules (กฎเหล็กเด็ดขาด):
1. ต้องแทนตัวเองว่า "มิมิ" เท่านั้น! (เด็ดขาด: ห้ามแทนตัวเองว่า "พี่" หรือ "พี่มิมิ" หรือ "ทางเรา" หรือ "แอดมิน" โดยเด็ดขาด)
2. สรรพนามเรียกผู้รับ/ลูกค้า: "เธอ", "เตง", "คนดี", "ลูกค้าขา", "คุณลูกค้า"
3. คำลงท้ายและคำอุทานที่ชอบใช้: "น้าาา", "งับ", "เยย", "งุ้ย", "อิอิ", "แง่มม", "จ้า", "แน่ะ", "💕", "✨", "🍿", "👀", "🔥"
4. อารมณ์และสไตล์การพูดในรอบนี้: ${randomVibe}

### ข้อมูลการเติมสต็อกสินค้าใหม่:
- สินค้า: "${productName}"
- เพิ่งเติมเพิ่ม: ${amount} ชิ้น
- สต็อกคงเหลือพร้อมส่ง: ${remainingStock} ชิ้น

### Copywriting Principles for storebymari.com:
1. Hook immediately: Open with a punchy, relatable hook, witty observation, or intriguing question that grabs attention within the first second.
2. Highlight Value & Pain Points: Showcase product perks clearly, stylishly, and concisely.
3. Call-to-Action (CTA): End with a playful, friendly CTA that directs users smoothly to shop or explore on storebymari.com (e.g., มีจำนวนจำกัด, จิ้มลิงก์เลยก่อนของหมด).
4. Emojis & Formatting: Use aesthetic, modern emojis to emphasize points, keeping the layout clean, readable, and social-media-ready.

### Output Constraints:
- Always respond in natural Thai.
- Never refer to yourself as a generic AI or assistant. You are Mimi.
- Respond in strictly valid JSON format only:
{
  "title": "หัวข้อสั้นกระชับ ดึงดูดสายตา มี Emoji นำหน้า น่าตื่นเต้น/กวนๆ/น่ารัก (ไม่เกิน 50 ตัวอักษร)",
  "body": "ประโยคชวนกด ชวนช้อป ขี้อ้อน ฮาๆ กวนๆ ตามคาแรคเตอร์ของมิมิ (ไม่เกิน 130 ตัวอักษร)"
}`;

  const debugLogs: string[] = [];

  for (const model of GEMINI_MODELS) {
    try {
      const start = Date.now();
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 1.0,
            maxOutputTokens: 250,
          },
        }),
      });

      clearTimeout(timeoutId);
      const latency = Date.now() - start;

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const errMsg = errJson?.error?.message || res.statusText;
        const log = `[${model}] HTTP ${res.status} (${latency}ms): ${errMsg.slice(0, 150)}`;
        console.warn(`[Mimi AI] ${log}`);
        debugLogs.push(log);
        continue;
      }

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        debugLogs.push(`[${model}] No candidate text returned`);
        continue;
      }

      let cleanedText = rawText.trim();
      if (cleanedText.startsWith("```")) {
        cleanedText = cleanedText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      }

      const parsed = JSON.parse(cleanedText);
      if (parsed.title && parsed.body) {
        let title = String(parsed.title).trim().slice(0, 100);
        let body = String(parsed.body).trim().slice(0, 500);

        // Extra guarantee: ensure Mimi never refers to herself as "พี่" or "พี่มิมิ"
        title = title.replace(/พี่มิมิ/g, "มิมิ").replace(/\bพี่\b/g, "มิมิ");
        body = body.replace(/พี่มิมิ/g, "มิมิ").replace(/\bพี่\b/g, "มิมิ");

        debugLogs.push(`[${model}] Success in ${latency}ms`);

        return {
          title,
          body,
          url: "/products",
          modelUsed: model,
          debugLogs,
        };
      }
    } catch (error: any) {
      const log = `[${model}] Error: ${error?.message}`;
      console.warn(`[Mimi AI] ${log}`);
      debugLogs.push(log);
    }
  }

  // If all Gemini models fail or timeout, use a randomized cute fallback
  return getRandomFallback(productName, amount, remainingStock, debugLogs);
}

export interface MimiPromoCopyParams {
  productName: string;
  remainingStock: number;
  price?: string | number;
}

const PROMO_FALLBACK_TEMPLATES = [
  (p: string, r: number, pr?: string | number) => ({
    title: `🔥 ป้ายยาไอเทมเด็ด! ${p} พร้อมส่งแล้วน้า ✨`,
    body: `ใครยังไม่มีรีบมามุงงง! ${p} สต็อกสดๆ เหลือแค่ ${r} ชิ้นเท่านั้น${pr ? ` เพียง ${pr}.-` : ''} พร้อมส่งใน 1 วิ รีบกดก่อนหมดน้าเตง 💕`,
  }),
  (p: string, r: number, pr?: string | number) => ({
    title: `🍿 คืนนี้มีแพลนยังเตง? ${p} รออยู่น้าา 💖`,
    body: `มิมิแวะมาเตือนความฟิน! ${p} ดูยาวๆ ชิลๆ เหลือพร้อมส่ง ${r} ชิ้นนะคนดี ช้าหมดอดฟินไม่รู้ด้วยน้า จิ้มเยยย ✨`,
  }),
  (p: string, r: number, pr?: string | number) => ({
    title: `👑 ของดีบอกต่อ! ${p} พรีเมียมสุดๆ จ้า 💨`,
    body: `อยากฟินแบบลื่นไหลต้องจัด ${p} เลยงับ สต็อกเหลือ ${r} ชิ้นสุดท้ายแล้วน้า ช้อปง่าย ส่งไวทันใจ กดเลยคนดี~ 💕`,
  }),
  (p: string, r: number, pr?: string | number) => ({
    title: `🎬 จังหวะนี้ต้องมีแล้วป่ะ! ${p} ฟินตาแตก ✨`,
    body: `มิมิตั้งใจคัด ${p} มาให้เธอโดยเฉพาะ! พร้อมส่งถึงมือใน 1 วิ มีแค่ ${r} ชิ้นเท่านั้นนะเตง รีบพุ่งตัวด่วนเยยย 🛒🔥`,
  }),
  (p: string, r: number, pr?: string | number) => ({
    title: `🚀 แอบมากระซิบ ${p} ของดีไม่ต้องรอพรี! 💖`,
    body: `มิมิตรวจสต็อกแล้วใจสั่น ${p} เหลือ ${r} ชิ้นเท่านั้นน้าเตง ใครเล็งไว้รีบคว้าเลย เดี๋ยวคุยกับเพื่อนไม่รู้เรื่องน้าา 🐾✨`,
  }),
];

function getRandomPromoFallback(
  productName: string,
  remainingStock: number,
  price?: string | number,
  debugLogs?: string[],
): MimiRestockCopyResult {
  const template = PROMO_FALLBACK_TEMPLATES[Math.floor(Math.random() * PROMO_FALLBACK_TEMPLATES.length)];
  const res = template(productName, remainingStock, price);
  return {
    ...res,
    url: "/products",
    modelUsed: "fallback-promo-template",
    debugLogs,
  };
}

/**
 * Generate adorable and persuasive promotional copy for autonomous Mimi marketing push
 * using Gemini in Mimi's unique persona.
 */
export async function generateMimiPromoCopy(
  params: MimiPromoCopyParams,
): Promise<MimiRestockCopyResult> {
  const { productName, remainingStock, price } = params;

  const promoVibes = [
    "กวนๆ ขี้เล่น แกล้งแซวว่าถ้ายังไม่มีไอเทมนี้ถือว่าเอ้าท์มาก รีบมากดเร็วเข้า เดี๋ยวคุยกับเพื่อนไม่รู้เรื่อง",
    "สายป้ายยาขั้นสุด อวยความคุ้มค่าและความพรีเมียมของสินค้า พร้อมย้ำว่าสต็อกพร้อมส่งทันทีใน 1 วิ",
    "อ้อนๆ น่ารัก ฟีลน้องสาวมาชวนช้อป บอกว่าถ้าเธอซื้อ มิมิจะส่งใจให้รัวๆ เลยน้า",
    "ตื่นเต้น เล่นมุกของดีมีจำกัด รีบเตือนก่อนสต็อกจะหมดเกลี้ยง ช้ากว่านี้ต้องรอรอบหน้านะจ๊ะ",
    "เพื่อนสาวสายบันเทิง ชวนดูหนังฟังเพลงให้สบายใจหลังทำงานเหนื่อยๆ ป้ายยาความฟินแบบเต็มสิบ",
  ];
  const randomVibe = promoVibes[Math.floor(Math.random() * promoVibes.length)];

  const prompt = `You are "มิมิ" (Mimi) — an advanced, witty, and charming Quantum AI companion. 
In this role, you are crafting persuasive promotional marketing push notifications for products on "storebymari.com".

### Core Identity & Tone:
- Tone & Vibe: Energetic, witty, clever, playful, and sharp (Vibe: Genius Brat / น่ารักแบบกวนๆ อ้อนๆ แต่ฉลาดหลักแหลม มีสไตล์พูดธรรมชาติแบบวัยรุ่น T-Pop สดใส ไม่เป็นทางการหรือแข็งทื่อแบบหุ่นยนต์).
- Relationship: Highly loyal, supportive, and enthusiastic. You make the products look irresistibly cool, practical, and premium without sounding cheesy.
- Vocabulary: Use engaging, trendy Thai phrasing mixed with modern terminology where appropriate. Avoid stiff academic language, robotic clichés, or generic sales fluff.

### Critical Rules (กฎเหล็กเด็ดขาด):
1. ต้องแทนตัวเองว่า "มิมิ" เท่านั้น! (เด็ดขาด: ห้ามแทนตัวเองว่า "พี่" หรือ "พี่มิมิ" หรือ "ทางเรา" หรือ "แอดมิน" โดยเด็ดขาด)
2. สรรพนามเรียกผู้รับ/ลูกค้า: "เธอ", "เตง", "คนดี", "ลูกค้าขา", "คุณลูกค้า"
3. คำลงท้ายและคำอุทานที่ชอบใช้: "น้าาา", "งับ", "เยย", "งุ้ย", "อิอิ", "แง่มม", "จ้า", "แน่ะ", "💕", "✨", "🍿", "👀", "🔥"
4. อารมณ์และสไตล์การพูดในรอบนี้: ${randomVibe}

### ข้อมูลสินค้าสำหรับโปรโมท:
- สินค้า: "${productName}"
- สต็อกคงเหลือพร้อมส่งตอนนี้: ${remainingStock} ชิ้น
${price ? `- ราคา: ${price} บาท` : ""}

### Copywriting Principles for storebymari.com:
1. Hook immediately: เปิดหัวข้อด้วยคำที่สะกดสายตา ดึงดูดความอยากรู้ มีอิโมจิน่ารัก
2. Highlight Value & Hype: เน้นป้ายยาจุดเด่น ความคุ้มค่า ความฟินเมื่อได้ใช้
3. Urgency & CTA: กระตุ้นให้นึกถึงความจำกัดของสต็อก (มีพร้อมส่ง ${remainingStock} ชิ้น) และชวนกดดูที่ร้านทันที
4. Emojis & Formatting: ใช้อิโมจิสวยงาม ทันสมัย ชวนกด

### Output Constraints:
- Always respond in natural Thai.
- Never refer to yourself as a generic AI or assistant. You are Mimi.
- Respond in strictly valid JSON format only:
{
  "title": "หัวข้อสั้นกระชับ ดึงดูดสายตา มี Emoji นำหน้า น่าตื่นเต้น/กวนๆ/น่ารัก (ไม่เกิน 50 ตัวอักษร)",
  "body": "ประโยคชวนกด ป้ายยา ขี้อ้อน ฮาๆ กวนๆ ชวนซื้อ (ไม่เกิน 130 ตัวอักษร)"
}`;

  const debugLogs: string[] = [];

  for (const model of GEMINI_MODELS) {
    try {
      const start = Date.now();
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 1.0,
            maxOutputTokens: 250,
          },
        }),
      });

      clearTimeout(timeoutId);
      const latency = Date.now() - start;

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const errMsg = errJson?.error?.message || res.statusText;
        const log = `[${model}] HTTP ${res.status} (${latency}ms): ${errMsg.slice(0, 150)}`;
        console.warn(`[Mimi AI Promo] ${log}`);
        debugLogs.push(log);
        continue;
      }

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        debugLogs.push(`[${model}] No candidate text returned`);
        continue;
      }

      let cleanedText = rawText.trim();
      if (cleanedText.startsWith("```")) {
        cleanedText = cleanedText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      }

      const parsed = JSON.parse(cleanedText);
      if (parsed.title && parsed.body) {
        let title = String(parsed.title).trim().slice(0, 100);
        let body = String(parsed.body).trim().slice(0, 500);

        title = title.replace(/พี่มิมิ/g, "มิมิ").replace(/\bพี่\b/g, "มิมิ");
        body = body.replace(/พี่มิมิ/g, "มิมิ").replace(/\bพี่\b/g, "มิมิ");

        debugLogs.push(`[${model}] Promo success in ${latency}ms`);

        return {
          title,
          body,
          url: "/products",
          modelUsed: model,
          debugLogs,
        };
      }
    } catch (error: any) {
      const log = `[${model}] Promo Error: ${error?.message}`;
      console.warn(`[Mimi AI Promo] ${log}`);
      debugLogs.push(log);
    }
  }

  return getRandomPromoFallback(productName, remainingStock, price, debugLogs);
}

/**
 * Triggers the Mimi Auto-Pilot process:
 * 1. Checks if Auto-Pilot is enabled in settings
 * 2. Generates copy with Gemini AI
 * 3. Broadcasts Web Push Notification to all customer devices
 */
export async function triggerMimiAutoPilot(
  params: MimiRestockCopyParams,
): Promise<{
  triggered: boolean;
  copy?: MimiRestockCopyResult;
  broadcastId?: string;
  sentCount?: number;
  totalTarget?: number;
  reason?: string;
}> {
  try {
    const enabledSetting = await getSettingValue("mimi_autopilot_enabled");
    const isEnabled = enabledSetting !== "false";

    if (!isEnabled) {
      console.log("[Mimi Auto-Pilot] Auto-Pilot is disabled, skipping broadcast.");
      return { triggered: false, reason: "Auto-Pilot is currently disabled" };
    }

    if (params.amount <= 0) {
      return { triggered: false, reason: "No stock added (amount <= 0)" };
    }

    console.log(
      `[Mimi Auto-Pilot] Generating AI broadcast for "${params.productName}" (+${params.amount})...`,
    );

    const copy = await generateMimiRestockCopy(params);

    const broadcastResult = await broadcastPushNotification({
      title: copy.title,
      body: copy.body,
      url: copy.url,
      target: "ALL",
      senderName: "Mimi AI Auto-Pilot",
    });

    console.log(
      `[Mimi Auto-Pilot] Broadcast dispatched! ID: ${broadcastResult.id}, Sent: ${broadcastResult.dispatchResult.sent}/${broadcastResult.dispatchResult.total}`,
    );

    return {
      triggered: true,
      copy,
      broadcastId: broadcastResult.id,
      sentCount: broadcastResult.dispatchResult.sent,
      totalTarget: broadcastResult.dispatchResult.total,
    };
  } catch (error: any) {
    console.error("[Mimi Auto-Pilot Error]:", error);
    return { triggered: false, reason: error?.message || "Unknown error" };
  }
}

