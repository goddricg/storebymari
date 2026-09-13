/**
 * Mimi High-Speed Intent Router
 * Classifies customer queries in < 2ms without LLM latency.
 * Routes messages to the optimal specialized sub-brain: Support, Sales, Concierge, or Reflex.
 */

import { matchMicroReflex } from "./micro-reflex";

export type MimiCustomerIntent = "MICRO_REFLEX" | "SUPPORT" | "SALES" | "CONCIERGE";

export interface IntentRoutingResult {
  intent: MimiCustomerIntent;
  matchedApps: string[]; // List of specific apps detected (e.g. ['netflix', 'spotify'])
  excludedApps?: string[]; // Apps customer explicitly excluded (e.g. ['netflix'])
  isAskingAllCatalog?: boolean;
  isAskingOtherProducts?: boolean;
  reflexResponse?: string;
  hasUserIdentifier: boolean; // mentions email / username / order ID
  isImageAttached?: boolean;
}

// Known app keywords to filter relevant catalog items
export const APP_KEYWORD_MAP: Record<string, string[]> = {
  netflix: ["netflix", "เน็ตฟลิก", "เน็ตฟลิกซ์", "เนตฟลิก", "nf"],
  youtube: ["youtube", "ยูทูป", "ยูทูบ", "yt"],
  spotify: ["spotify", "สปอติฟาย", "สปอ", "spot"],
  disney: ["disney", "ดิสนีย์", "ดิสนี่", "disney+"],
  viu: ["viu", "วิว"],
  canva: ["canva", "แคนวา"],
  wetv: ["wetv", "วีทีวี"],
  iqiyi: ["iqiyi", "อ้ายฉีอี้", "iq"],
  prime: ["prime", "ไพรม์", "amazon"],
  bilibili: ["bilibili", "บิลิบิลิ"],
  hbo: ["hbo", "hbo go", "เอชบีโอ"],
  apple: ["apple", "แอปเปิ้ล", "apple music", "apple tv"],
  capcut: ["capcut", "แคปคัท", "แคปคัด"],
  chatgpt: ["chatgpt", "chat gpt", "gpt", "แชทจีพีที"],
  monomax: ["monomax", "mono max", "โมโนแมกซ์", "โมโน"],
  youku: ["youku", "โยวคู่", "โหยวคู่"],
  ch3: ["ch3", "ch 3", "ช่อง 3", "ช่อง3"],
  meitu: ["meitu", "เหมยตู"],
};

// Keywords that indicate problem reporting (Support Brain)
const SUPPORT_PATTERNS = [
  /เข้าไม่ได้|ดูไม่ได้|ฟังไม่ได้|เล่นไม่ได้|ใช้ไม่ได้/i,
  /จอเต็ม|จอชน|เด้ง|รหัสผิด|รหัสไม่ตรง|รหัสผ่านผิด/i,
  /otp|sign\s*in\s*code|signin\s*code|holdhouse|household|ครัวเรือน|บ้านเดี่ยว|รหัสทีวี/i,
  /เติมไม่เข้า|เติมไม่ได้|เงินไม่เข้า|ยอดไม่เข้า|สลิปมีปัญหา|อัปสลิป|อัพสลิป/i,
  /เคลม|แจ้งเคลม|เคลมจอ|ขอเคลม|หมดอายุ|ก่อนกำหนด|โดนตัด/i,
  /error|พัง|ช่วยด้วย|มีปัญหา|แก้ยังไง|ทำไมดูไม่ได้/i,
  /sup-[a-zA-Z0-9_-]+/i,
];

// Keywords that indicate shopping / purchasing / catalog inquiries (Sales Brain)
const SALES_PATTERNS = [
  /ราคา|กี่บาท|เท่าไหร่|เท่าไร|แพงไหม/i,
  /มีของไหม|มีไหม|สต็อก|สต๊อก|พร้อมส่ง|หมดหรือยัง|เหลือไหม/i,
  /ซื้อ|สนใจ|สั่งซื้อ|สั่งของ|ขอซื้อ|อยากได้|ขอรับ|รับสินค้า|รับของ/i,
  /โปร|โปรโมชั่น|ส่วนลด|ลดราคา|ของแถม|โบนัส/i,
  /ขายดี|ฮิต|แนะนำหน่อย|ตัวไหนดี/i,
  /หมวด|ประเภท|มีแอปอะไรบ้าง|มีแอพอะไรบ้าง|มีสินค้าอะไรบ้าง|ขายอะไรบ้าง|มีอะไรขายบ้าง|สินค้าทั้งหมด|แอปทั้งหมด|ขายอะไร|มีอะไรบ้าง|รายการสินค้า|สินค้าอื่น|แอปอื่น|นอกจาก/i,
  /เติมเงิน|จ่ายเงิน|ชำระเงิน|โอนเงิน|promptpay|พร้อมเพย์|truemoney/i,
];

// Keywords that indicate greeting / general concierge
const CONCIERGE_PATTERNS = [
  /สวัสดี|หวัดดี|ดีครับ|ดีค่ะ|ดีจ้า|ฮัลโหล|hello|hi|hey/i,
  /มิมิ|แอดมิน|มีใครอยู่ไหม|อยู่ไหม|ร้านเปิด/i,
  /ประกันยังไง|รับประกันไหม|โกงไหม|ปลอดภัยไหม/i,
];

/**
 * Extract mentioned apps from user message to filter the catalog
 */
export function extractMentionedApps(text: string): string[] {
  const lower = text.toLowerCase();
  const matched: string[] = [];

  for (const [appKey, keywords] of Object.entries(APP_KEYWORD_MAP)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      matched.push(appKey);
    }
  }

  return matched;
}

export interface CatalogQueryScope {
  isAskingAllCatalog: boolean;
  isAskingOtherProducts: boolean;
  excludedApps: string[];
}

/**
 * Detect if user is asking for other products, all products, or excluding certain apps (e.g. "สินค้าอื่นๆ นอกจาก Netflix")
 */
export function extractCatalogQueryScope(text: string): CatalogQueryScope {
  const lower = text.toLowerCase();
  const hasExclusionWord = /นอกจาก|ไม่เอา|ไม่รวม|เว้น|นอกจากนี้|นอกจากนั้น|ไม่อยากได้|ไม่ใช่/i.test(lower);
  const hasOtherWord = /สินค้าอื่น|แอปอื่น|แอพอื่น|ตัวอื่น|หมวดอื่น|อย่างอื่น|อื่นๆ|มีอะไรอีก|มีตัวไหนอีก/i.test(lower);
  const hasAllCatalogWord =
    /มีสินค้า|มีแอป|มีแอพ|ขายอะไร|มีอะไรขาย|สินค้าทั้งหมด|แอปทั้งหมด|ขายอะไรบ้าง|มีอะไรบ้าง|มีบริการอะไรบ้าง|รายการสินค้า|แอปที่มี|สินค้าที่มี/i.test(
      lower
    );

  const excludedApps: string[] = [];

  if (hasExclusionWord || (hasOtherWord && lower.includes("นอกจาก"))) {
    for (const [appKey, keywords] of Object.entries(APP_KEYWORD_MAP)) {
      for (const kw of keywords) {
        if (
          lower.includes(`นอกจาก ${kw}`) ||
          lower.includes(`นอกจาก${kw}`) ||
          lower.includes(`ไม่เอา ${kw}`) ||
          lower.includes(`ไม่เอา${kw}`) ||
          lower.includes(`เว้น ${kw}`) ||
          lower.includes(`เว้น${kw}`)
        ) {
          if (!excludedApps.includes(appKey)) excludedApps.push(appKey);
        }
      }
    }

    if (excludedApps.length === 0 && hasExclusionWord) {
      for (const [appKey, keywords] of Object.entries(APP_KEYWORD_MAP)) {
        if (keywords.some((kw) => lower.includes(kw))) {
          if (!excludedApps.includes(appKey)) excludedApps.push(appKey);
        }
      }
    }
  }

  const isAskingOtherProducts = hasOtherWord || excludedApps.length > 0;
  const isAskingAllCatalog = hasAllCatalogWord || (isAskingOtherProducts && excludedApps.length === 0);

  return {
    isAskingAllCatalog,
    isAskingOtherProducts,
    excludedApps,
  };
}

import { ConversationMessage } from "../memory";

/**
 * High-speed intent classification for customer messages.
 */
export function classifyCustomerIntent(
  userText: string,
  hasImage: boolean = false,
  history: ConversationMessage[] = []
): IntentRoutingResult {
  // If an image is attached, it's virtually always a support issue (screenshot, slip, TV code)
  if (hasImage) {
    return {
      intent: "SUPPORT",
      matchedApps: extractMentionedApps(userText),
      hasUserIdentifier: checkHasUserIdentifier(userText),
      isImageAttached: true,
    };
  }

  // 1. Check Micro-Reflex (Gratitude, OK, polite affirmations)
  const reflexText = matchMicroReflex(userText);
  if (reflexText) {
    return {
      intent: "MICRO_REFLEX",
      matchedApps: [],
      reflexResponse: reflexText,
      hasUserIdentifier: false,
    };
  }

  const scope = extractCatalogQueryScope(userText);
  const hasUserIdentifier = checkHasUserIdentifier(userText);
  let matchedApps = extractMentionedApps(userText);

  // If customer is excluding apps (e.g. "นอกจาก Netflix"), remove them from matchedApps!
  if (scope.excludedApps.length > 0) {
    matchedApps = matchedApps.filter((app) => !scope.excludedApps.includes(app));
  }

  // Context Carry-Over: If no app explicitly mentioned in this sentence,
  // AND customer is NOT asking for other products / all catalog,
  // check recent turns to preserve the customer's topic of interest (e.g. Netflix)
  if (
    matchedApps.length === 0 &&
    !scope.isAskingAllCatalog &&
    !scope.isAskingOtherProducts &&
    history.length > 0
  ) {
    const recentHistoryText = history
      .slice(-4)
      .map((m) => m.text)
      .join(" ");
    matchedApps = extractMentionedApps(recentHistoryText);
  }

  // 2. Priority check: Support & Troubleshooting
  // If user mentions issues OR case code OR OTP OR slip, route to Support Brain!
  const isSupport = SUPPORT_PATTERNS.some((pattern) => pattern.test(userText));
  if (isSupport) {
    return {
      intent: "SUPPORT",
      matchedApps,
      hasUserIdentifier,
    };
  }

  // 3. Check Sales & Storefront Inquiries (including follow-ups like "ไปตรวจสอบมาได้ไหม", "มีกี่อัน")
  const isSales = SALES_PATTERNS.some((pattern) => pattern.test(userText));
  const isFollowUpStockOrSales =
    /ตรวจสอบ|เช็ก|เช็ค|กี่ชิ้น|กี่อัน|เหลือ|พร้อมส่ง|เอาอันนี้|สนใจ|เท่าไหร่|เท่าไร|มีไหม|หมายถึง/i.test(userText) &&
    matchedApps.length > 0;

  if (
    isSales ||
    matchedApps.length > 0 ||
    isFollowUpStockOrSales ||
    scope.isAskingAllCatalog ||
    scope.isAskingOtherProducts
  ) {
    return {
      intent: "SALES",
      matchedApps,
      excludedApps: scope.excludedApps,
      isAskingAllCatalog: scope.isAskingAllCatalog,
      isAskingOtherProducts: scope.isAskingOtherProducts,
      hasUserIdentifier,
    };
  }

  // 4. Check Concierge & Greeting
  const isConcierge = CONCIERGE_PATTERNS.some((pattern) => pattern.test(userText));
  if (isConcierge) {
    return {
      intent: "CONCIERGE",
      matchedApps,
      hasUserIdentifier,
    };
  }

  // Default fallback: Concierge Brain handles general inquiries politely
  return {
    intent: "CONCIERGE",
    matchedApps,
    hasUserIdentifier,
  };
}

function checkHasUserIdentifier(text: string): boolean {
  return Boolean(
    text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/) ||
    text.match(/(?:user(?:name)?|ยูส(?:เซอร์)?|ชื่อผู้ใช้|ไอดี)\s*[:= ]\s*([a-zA-Z0-9._-]+)/i) ||
    text.match(/(?:ord[-_]?[a-zA-Z0-9]{6,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i) ||
    text.match(/SUP-[a-zA-Z0-9_-]+/i)
  );
}
