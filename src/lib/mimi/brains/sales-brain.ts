/**
 * Mimi Sales & Storefront Specialist Brain (Brain B)
 * Specialized in product recommendations, pricing, stock inquiries, and closing sales via website.
 * STRICT DATA ISOLATION:
 * - Completely stripped of troubleshooting SOPs and error diagnosis manuals.
 * - Filtered product catalog: Only loads products relevant to the customer's specific inquiry.
 * - Auto-loads only "sales" knowledge rules (promotions, bonus topups, auto-web purchase).
 */

import { getKnowledgeRulesForBrain, formatKnowledgeForGeminiPrompt } from "../knowledge";
import { formatCustomerProfileForPrompt, MimiCustomerProfile, ConversationMessage } from "../memory";
import { getMimiPersonality } from "../personality";
import { callGeminiForMimi } from "./gemini-client";
import { SimpleProduct } from "@/lib/line/handler";

export interface SalesBrainParams {
  userText: string;
  products: SimpleProduct[];
  matchedApps?: string[];
  excludedApps?: string[];
  isAskingAllCatalog?: boolean;
  isAskingOtherProducts?: boolean;
  history?: ConversationMessage[];
  profile?: MimiCustomerProfile;
}

// Known app categories for smart catalog grouping
export const APP_CATEGORIES: { name: string; key: string; keywords: string[] }[] = [
  { name: "Netflix", key: "netflix", keywords: ["netflix", "เน็ตฟลิก"] },
  { name: "YouTube Premium", key: "youtube", keywords: ["youtube", "ยูทูป", "ยูทูบ"] },
  { name: "Prime Video", key: "prime", keywords: ["prime", "ไพรม์"] },
  { name: "Viu Premium", key: "viu", keywords: ["viu", "วิว"] },
  { name: "Canva Pro / EDU", key: "canva", keywords: ["canva", "แคนวา"] },
  { name: "WeTV", key: "wetv", keywords: ["wetv", "วีทีวี"] },
  { name: "iQIYI VIP", key: "iqiyi", keywords: ["iqiyi", "อ้ายฉีอี้"] },
  { name: "CapCut Pro", key: "capcut", keywords: ["capcut", "แคปคัท"] },
  { name: "HBO Max", key: "hbo", keywords: ["hbo", "เอชบีโอ"] },
  { name: "Spotify", key: "spotify", keywords: ["spotify", "สปอติฟาย"] },
  { name: "ChatGPT Plus", key: "chatgpt", keywords: ["chatgpt", "chat gpt"] },
  { name: "Mono Max", key: "monomax", keywords: ["monomax", "mono max", "โมโน"] },
  { name: "Youku", key: "youku", keywords: ["youku"] },
  { name: "CH 3 Plus", key: "ch3", keywords: ["ch 3", "ch3", "ช่อง 3"] },
  { name: "Meitu", key: "meitu", keywords: ["meitu", "เหมยตู"] },
  { name: "Bilibili", key: "bilibili", keywords: ["bilibili", "บิลิบิลิ"] },
];

export async function generateSalesReply(params: SalesBrainParams): Promise<string> {
  const {
    userText,
    products,
    matchedApps = [],
    excludedApps = [],
    isAskingAllCatalog = false,
    isAskingOtherProducts = false,
    history = [],
    profile,
  } = params;

  // 1. Auto-fetch only sales knowledge rules
  const salesRules = await getKnowledgeRulesForBrain("sales");
  const knowledgeBasePrompt = formatKnowledgeForGeminiPrompt(salesRules);

  // 2. Intelligent Product Catalog Construction:
  let availableProducts = products.filter((p) => p.price > 0);

  // A. Filter out excluded apps if customer specifically said "นอกจาก [แอป]"
  if (excludedApps.length > 0) {
    availableProducts = availableProducts.filter((p) => {
      const lowerName = p.name.toLowerCase();
      for (const ex of excludedApps) {
        const cat = APP_CATEGORIES.find((c) => c.key === ex);
        const kws = cat ? cat.keywords : [ex];
        if (kws.some((kw) => lowerName.includes(kw))) return false;
      }
      return true;
    });
  }

  let catalogStr = "";
  const isGeneralOrOther =
    isAskingAllCatalog ||
    isAskingOtherProducts ||
    (matchedApps.length === 0 && excludedApps.length > 0);

  if (isGeneralOrOther || matchedApps.length === 0) {
    // Group all available products by category so Gemini has complete store awareness
    const groups: Record<string, SimpleProduct[]> = {};
    for (const p of availableProducts) {
      const lowerName = p.name.toLowerCase();
      const matchedCat = APP_CATEGORIES.find((c) =>
        c.keywords.some((kw) => lowerName.includes(kw))
      );
      const catName = matchedCat ? matchedCat.name : "แอปและบริการอื่นๆ";
      if (!groups[catName]) groups[catName] = [];
      groups[catName].push(p);
    }

    const catalogLines: string[] = [];
    for (const [catName, items] of Object.entries(groups)) {
      const inStockItems = items.filter((i) => i.stock > 0);
      const totalStock = items.reduce((acc, cur) => acc + cur.stock, 0);
      const minPrice = Math.min(...items.map((i) => i.price));
      if (inStockItems.length > 0) {
        const topItemsStr = inStockItems
          .slice(0, 3)
          .map((i) => `${i.name} (฿${i.price} | สต็อก ${i.stock} ชิ้น)`)
          .join(", ");
        catalogLines.push(
          `• **${catName}**: ราคาเริ่มต้น ฿${minPrice} (พร้อมส่งรวม ${totalStock} ชิ้น) ➔ ${topItemsStr}`
        );
      } else {
        catalogLines.push(`• **${catName}**: ราคาเริ่มต้น ฿${minPrice} (สินค้าหมดชั่วคราว/รอเติม)`);
      }
    }
    catalogStr = catalogLines.join("\n");
  } else {
    // Specific app inquiry (e.g. Netflix)
    const specificItems = availableProducts.filter((p) => {
      const name = p.name.toLowerCase();
      return matchedApps.some((app) => name.includes(app));
    });

    const specificList = (specificItems.length > 0 ? specificItems : availableProducts.slice(0, 15)).map(
      (p) =>
        `- ${p.name} | ราคา: ฿${p.price} | สต็อกคงเหลือ: ${p.stock > 0 ? `${p.stock} ชิ้น (พร้อมส่ง)` : "หมดชั่วคราว (0 ชิ้น)"}`
    );

    // Also list other available apps in store so Gemini is always aware of the store's full catalog
    const otherInStockApps = APP_CATEGORIES
      .filter((c) => !matchedApps.includes(c.key))
      .filter((c) =>
        availableProducts.some(
          (p) => p.stock > 0 && c.keywords.some((kw) => p.name.toLowerCase().includes(kw))
        )
      )
      .map((c) => c.name);

    catalogStr = specificList.join("\n");
    if (otherInStockApps.length > 0) {
      catalogStr += `\n\n💡 สินค้าหมวดอื่นๆ ที่ร้านมีพร้อมส่งเช่นกัน: ${otherInStockApps.join(", ")}`;
    }
  }

  // 3. Format context
  const conversationContextStr =
    history.length > 0
      ? history
          .slice(-4)
          .map((m) => `${m.role === "user" ? "ลูกค้า" : "มิมิ"}: ${m.text}`)
          .join("\n")
      : "เพิ่งเริ่มต้นการสอบถามสินค้า";

  const customerProfileStr = profile
    ? formatCustomerProfileForPrompt(profile)
    : "• สถานะลูกค้า: ลูกค้าทั่วไป";

  // 4. Situational Personality for Sales
  const personalityPrompt = getMimiPersonality("sales");

  // 5. Dedicated Sales Prompt
  const prompt = `You are "มิมิ" (Mimi) answering a customer about products, prices, and stock on LINE OA as a warm, attentive, helpful human admin (พี่ส้ม).

${personalityPrompt}


### 📦 ข้อมูลสินค้าและสต็อกจริงในระบบ:
${catalogStr}

### 🧠 ข้อมูลลูกค้า:
${customerProfileStr}

### 💬 บริบทบทสนทนาล่าสุด:
${conversationContextStr}

### 👤 ข้อความ/คำถามของลูกค้า:
"${userText}"

### กฎการตอบ (ตอบตรงคำถามอย่างเป็นธรรมชาติ ไม่ท่องจำ ไม่ไล่ลูกค้า):
1. 🎯 **ตอบตรงคำถามที่ลูกค้าถามก่อนเสมอ (Direct Answer First):**
   - **ถ้าลูกค้าถามถึงสินค้าหมวดอื่นๆ หรือนอกจาก [แอป] (เช่น "สินค้าอื่นๆละ นอกจาก Netflix"):**
     - แนะนำแอปพรีเมียมตัวอื่นๆ ที่มีในร้านอย่างครบถ้วนและน่าสนใจ เช่น Canva Pro, YouTube Premium, Prime Video, Viu, WeTV, iQIYI, CapCut ฯลฯ
     - **ห้ามบอกว่าร้านมีจำหน่ายเฉพาะแอปใดแอปหนึ่งเด็ดขาด 100%!** เพราะร้านมีสินค้าพร้อมส่งหลากหลายหมวดหมู่ตามรายการข้างต้น
     - บอกราคาเริ่มต้น หรือยกตัวอย่างตัวเด่นๆ พร้อมจำนวนสต็อกที่มีพร้อมส่ง
   - **ถ้าลูกค้าถามว่าร้านมีแอป/สินค้าอะไรบ้าง หรือขายอะไรบ้าง:**
     - สรุปหมวดหมู่แอปยอดนิยมทั้งหมดที่ร้านมีจำหน่ายให้เห็นภาพรวมชัดเจนครบถ้วน (ทั้งสายดูหนังซีรีส์ และสายทำงาน/ตัดต่อ)
   - **ถ้าลูกค้าถามสต็อก / จำนวนสินค้า / มีกี่ชิ้น:**
     - ให้บอกตัวเลขจำนวนชิ้นคงเหลือจริงของแต่ละแพ็กเกจที่มีในระบบอย่างชัดเจน (เช่น *"Netflix จอ TV เหลือ 12 ชิ้น, จอมือถือ 30 วัน เหลือ 24 ชิ้นค่ะ"*)
   - **ถ้าลูกค้าถามว่า "ไปตรวจสอบมาได้ไหม":**
     - ให้ตอบรับอย่างสุภาพและบอกผลการตรวจสอบสต็อกจริงทันที ไม่ถามเลขออเดอร์หรือเรื่องแจ้งซ่อม
   - **ถ้าลูกค้าถามราคา:**
     - แจ้งราคาแพ็กเกจที่ถามทันที
2. 🎯 **สนทนาอย่างเป็นมิตร อบอุ่น และใส่ใจ (Warm Persona):**
   - คุยเหมือนมนุษย์แอดมินใจดีที่พร้อมช่วยเหลือ มีหางเสียง คะ/ขา/ค่าพี่/งับบ
   - ชวนสั่งซื้ออย่างนุ่มนวล เช่น สนใจรับแพ็กเกจไหนบอกมิมิได้เลยนะคะ หรือถ้าสะดวกกดเองหน้าเว็บ https://storebymari.com ก็มีระบบส่งของออโต้ 24 ชม. ได้ของทันทีค่ะ
3. 🚫 **ห้ามไล่ลูกค้าเข้าเว็บ:** ห้ามพูดประโยคตัดบทซ้ำซากเดิมๆ ทุกข้อความ ถ้าลูกค้าคุยถามข้อมูลในแชท ให้ตอบในแชทก่อน
4. 🚫 **ข้อห้ามอื่นๆ:**
   - ห้ามใช้คำว่า "คนดี", "งื้อออ", "ใจจะขาด", "รับน้องไปดูแล", "คนดีของมิมิ" เด็ดขาด
   - ห้ามส่งเลขบัญชีส่วนตัวในแชท ทุกรายการชำระผ่านระบบเว็บ
5. 🎯 **ความยาวทั้งสิ้น: สบายตา 2–4 บรรทัด**`;

  const reply = await callGeminiForMimi({
    prompt,
    temperature: 0.2,
    maxOutputTokens: 220,
    timeoutMs: 12000,
  });

  return (
    reply ||
    "มิมิพร้อมดูแลค่าเตง! หน้าร้านเรามีแอปพรีเมียมครบทั้งสายดูหนังและสายทำงาน เช่น Netflix, YouTube, Prime Video, Viu, Canva, WeTV, CapCut แวะดูราคาและสต็อกสดๆ ได้ที่ https://storebymari.com เลยน้า หรือถามมิมิต่อได้เยยงับ 🐰🛒"
  );
}
