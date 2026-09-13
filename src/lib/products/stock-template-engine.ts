import type { ProductAccount, StockDeliveryType } from "@/lib/products/types";
import { formatAccountData } from "@/lib/products/account-parser";
import { getStockDeliveryIdentity } from "@/lib/products/stock-delivery-type";

export interface ExtractedStockItem {
  email?: string;
  password?: string;
  screen?: string;
  expiry?: string;
  inviteLink?: string;
  extra?: string;
  raw?: string;
}

export interface PreparedStockBatch {
  rawInput: string;
  validAccounts: ProductAccount[];
  previewDeliveryForm: string;
  duplicateCount: number;
  validCount: number;
  totalDetected: number;
}

/**
 * Calculate estimated expiry date based on product name
 * e.g. 7 วัน -> today + 7 days in D/M/YYYY format
 */
export function calculateProductExpiryDate(productName: string, baseDate = new Date()): string {
  const lower = productName.toLowerCase();
  let addDays = 30; // default to 30 days

  if (/\b1\s*วัน\b|\b1\s*day\b/i.test(lower)) {
    addDays = 1;
  } else if (/\b7\s*วัน\b|\b7\s*day\b|\b7d\b/i.test(lower)) {
    addDays = 7;
  } else if (/\b30\s*วัน\b|\b30\s*day\b|\b1\s*เดือน\b|\b30d\b/i.test(lower)) {
    addDays = 30;
  } else if (/\b60\s*วัน\b|\b60\s*day\b|\b2\s*เดือน\b/i.test(lower)) {
    addDays = 60;
  } else if (/\b90\s*วัน\b|\b90\s*day\b|\b3\s*เดือน\b/i.test(lower)) {
    addDays = 90;
  } else if (/\b1\s*ปี\b|\b365\s*วัน\b|\b1\s*year\b/i.test(lower)) {
    addDays = 365;
  }

  const exp = new Date(baseDate.getTime() + addDays * 24 * 60 * 60 * 1000);
  const day = exp.getDate();
  const month = exp.getMonth() + 1;
  const year = exp.getFullYear();

  return `${day}/${month}/${year}`;
}

/**
 * Fallback Master Delivery Form Templates by Service
 */
const DEFAULT_TEMPLATES: Record<string, (pName: string, item: ExtractedStockItem, exp: string) => string> = {
  netflix: (pName, item, exp) => {
    const isAcc = pName.toLowerCase().includes("acc");
    const isMobile = pName.toLowerCase().includes("มือถือ") || pName.toLowerCase().includes("mobile");
    const isTv = pName.toLowerCase().includes("ทุกอุปกรณ์") || pName.toLowerCase().includes("tv");
    const durationMatch = pName.match(/(?:1|7|30)\s*(?:วัน|day)/i);
    const duration = durationMatch ? durationMatch[0] : "30 Day";
    const deviceTag = isMobile ? "mobile ipad pc" : isTv ? "Tv All Devices" : "All Devices";

    if (isAcc) {
      return `𐙚˚ Netflix premium 4 k ${duration} ♡ ACC\n📧 : ${item.email || ""}\n🔐 : ${item.password || ""}\n⏰ : ${item.expiry || exp}\n\n♡ เคลม 24-48 ชม\n♡ ห้ามขายจอหาร\n♡ เข้าสู่ระบบแล้วติดยืนยัน 2 ชั้น สามารถนำเมล\nไปค้นหาในช่องสีฟ้าได้เลยค่ะ\nลิงก์ https://m2holdhouse.vercel.app/ ได้เลย`;
    }

    const screenLabel = item.screen
      ? item.screen.startsWith("จอ") || item.screen.toLowerCase().startsWith("screen")
        ? item.screen
        : `จอ ${item.screen}`
      : "จอ 1";

    return `𐙚˚  Netflix premium 4 k  ${duration} ♡\n        ┌ ✿ ${deviceTag} ✿ ┘\n\n📧 : ${item.email || ""}\n🔐 : ${item.password || ""}\n📺 : ${screenLabel}\n⏰ : ${item.expiry || exp}\n\n♡ ห้ามเปลี่ยนรหัส / ห้ามแชร์รหัสให้ผู้อื่นเด็ดขาด\n♡ เข้าได้แค่ 1 อุปกรณ์เท่านั้น ซื้อ 1 จอ ดูได้ 1 เครื่อง\n♡ เข้าสู่ระบบแล้วติดยืนยัน 2 ชั้น สามารถนำเมล ไปค้นหาในลิงก์ https://m2holdhouse.vercel.app/ ได้เลย`;
  },

  prime: (pName, item, exp) => {
    const durationMatch = pName.match(/(?:7|30)\s*(?:วัน|day)/i);
    const duration = durationMatch ? durationMatch[0] : "30 Day";
    const isAcc = pName.toLowerCase().includes("acc");
    const slotMatch = pName.match(/หาร\s*\d+/i);
    const slot = slotMatch ? slotMatch[0] : "หาร 3";
    const screenNum = item.screen ? item.screen.replace(/\D/g, "") || "1" : "1";

    if (isAcc) {
      return `~✿ Acc prime  ${duration}  🌛 ✿\n\nmail : ${item.email || ""}\npass : ${item.password || ""}\n\n♡     ทางร้านไม่รับเคลม 𓈒 ในกรณีที่แอคล็อค\n— thank you for order kub 🪞🪄`;
    }

    return `~✿  prime  ${duration}  🌛 ✿\n       ┌ ✿ ${slot} ✿ ┘\n\nmail : ${item.email || ""}\npass : ${item.password || ""}\nscreen : ${screenNum}\n\n𓈒 🌤️  กฎการใช้งาน 𓈒 prime(  👀⭐️  )\n- จอไม่ชน\n- ใช้ได้แค่ 1 อุปกรณ์เท่านั้น`;
  },

  wetv: (pName, item, exp) => {
    const slotMatch = pName.match(/หาร\s*\d+/i);
    const slot = slotMatch ? slotMatch[0] : "หาร 4";

    return `🌴🌊♡ 𝗪𝗘𝗧𝗩 𝗩𝗜𝗣 30 𝗗𝗮𝘆𝘀 ♡🐚\n～★${slot} ★～\n🥥🅼🅰🅸🅻 : ${item.email || ""}\n🐠🅿🅰🆂🆂🆆🅾🆁🅳 : ${item.password || ""}\n**เปลี่ยน +66 ด้านหน้า ไปที่ อินโดนิเซีย +62 ก่อนนะคะ\n☻ ♡ กฎการใช้งาน💖 ✧\nWeTV ถ้าขึ้นให้เลือกอายุ ให้ลูกค้าเลือกอายุ 20 ปีขึ้นไปนะคะ\n❌ ซื้อ 1 รหัส เข้าได้ 1 เครื่องเท่านั้น ห้ามเข้าเกินเด็ดขาด\nเนื่องจากทางร้าน${slot} คน ถ้าเข้าเกินเมลจะล็อกร้านไม่รับเคลม\n✧ จอหารต้องรับผิดชอบร่วมกันนะงับ\n🌈 ᴴᵃᵛᵉ ᶠᵘⁿ ʷᵃᵗᶜʰⁱⁿᵍ ᵗʰᵉ ᵐᵒᵛⁱᵉ εїз☁️`;
  },

  viu: (pName, item, exp) => {
    const slotMatch = pName.match(/หาร\s*\d+/i);
    const slot = slotMatch ? slotMatch[0] : "หาร 4";

    return `- ⩩☁️› 𝐯𝐢𝐮 7 𝐝𝐚𝐲𝐬  ◟  ✿\n-     ${slot}\n𝐌𝐚𝐢𝐥 : ${item.email || ""}\n𝐏𝐚𝐬𝐬 : ${item.password || ""}\n┈┈┈  ּ   ⚞♡݂⚟ ּ    ┈┈┈ \n✖️1 คน 1 อุปกรณ์จะเข้าเครื่องไหนให้อยู่เครื่องนั้นน้า\n✖️ห้ามแก้ไขข้อมูลเด็ดขาด\n✖️อย่ากดจอซ้ำกับคนอื่นนะคะ`;
  },

  canva: (pName, item, exp) => {
    const link = item.inviteLink || item.extra || (item.email && item.email.startsWith("http") ? item.email : "");
    const isEdu = pName.toLowerCase().includes("edu");
    const title = isEdu ? "Canva EDU ตลอดชีพ" : "Canva Pro";
    const teamHead = item.extra && !item.extra.startsWith("http") ? item.extra : "appbymari-team";

    return `☁️ *⁠.⁠ ${title} ✧  🌤️\nหัวทีม : ${teamHead}\n\n▪️▪️ลิ้งค์เข้าทีม▪️▪️\n${link}\n\n♡ กดเข้าลิงก์เพื่อเข้าร่วมทีมได้ทันทีนะคะ\n♡ ใช้งานได้ตามระยะเวลาแพ็กเกจ`;
  },

  youtube: (pName, item, exp) => {
    const link = item.inviteLink || item.extra || (item.email && item.email.startsWith("http") ? item.email : "");
    if (link) {
      return `#*⁠.✨YouTubePremium 30  Day (ไม่ต่อเมล)✧🧡.\n\n🗂Family : ${item.email || "Family Group"}\n\n.🔐° กดลิ้งก์เพื่อเข้าร่วม Family ภายใน6ชม.\n${link}`;
    }

    return `𐙚ִ  youtube 3O days 𓈒  \n\nEmail : ${item.email || ""}\nPassword : ${item.password || ""}\n \n      ⑅̶ ᱸแพ็คเกจรายบุคคล เคลม\n  กรอก mail & password เข้าสู่ระบบได้เลยค่ะ`;
  },

  iqiyi: (pName, item, exp) => {
    const slotMatch = pName.match(/หาร\s*\d+/i);
    const slot = slotMatch ? slotMatch[0] : "หาร 4";

    return `🥦 ✿シ 𝗶𝗾𝗶𝘆𝗶 𝗴𝗼𝗹𝗱 30 𝗱𝗮𝘆𝘀 ₊˚🍅\n\n             ～★${slot} ★～\n\n🍊𝐦𝐚𝐢𝐥 : ${item.email || ""}\n🌊𝐩𝐚𝐬𝐬𝐰𝐨𝐫𝐝 : ${item.password || ""}\n\n☻ ♡ กฎการใช้งาน💖\n❗️หากมีคนในแอคกดอัพเดตแพ็กเกจ จะทำให้วันลด รับผิดชอบร่วมกันทั้งแอค ร้านไม่เคลม❗️\n✧ ซื้อ 1 รหัสดูได้ 1 เครื่องเท่านั้น ถ้าเปลี่ยนอุปกรณ์ ต้องออกจากเครื่องเก่าก่อนนะคะ\n🌈 ᴴᵃᵛᵉ ᶠᵘⁿ ʷᵃᵗᶜʰⁱⁿᵍ ᵗʰᵉ ᵐᵒᵛⁱᵉ εїз☁️`;
  },

  capcut: (pName, item, exp) => {
    return `✿ 🌻𝘾𝙖𝙥𝙘𝙪𝙩 30 𝘿𝙖𝙮𝙨 🌼\n♪⁠┌ Acc - คอม ┘\n\n𝗠𝗮𝗶𝗹 : ${item.email || ""}\n𝗣𝗮𝘀𝘀 : ${item.password || ""}\n\n➖➖➖➖➖➖➖➖➖\n☀️ อ่านตรงนี้ก่อนนะคะ\n1. ล็อคอินผ่าน #เข้าสู่ระบบด้วยอีเมล\n2. ห้ามเปลี่ยนรหัสเด็ดขาด`;
  },
};

/**
 * Extract template structure from an existing account details string
 */
export function extractTemplateFromExistingDetails(existingDetails: string): string | null {
  if (!existingDetails || existingDetails.trim().length < 20) return null;

  let template = existingDetails;

  // Replace email line
  template = template.replace(
    /((?:Email|Mail|⚜\s*Mail|📧|💌|✉️|🅼🅰🅸🅻|User(?:name)?)\s*[:：=]\s*)([^\r\n]+)/i,
    "$1{{EMAIL}}"
  );

  // Replace password line
  template = template.replace(
    /((?:Pass(?:word)?|🔐|🔑|🗝️|🅿🅰🆂🆂(?:🆆🅾🆁🅳)?|\u0e23\u0e2b\u0e31\u0e2a\u0e1c\u0e48\u0e32\u0e19)\s*[:：=]\s*)([^\r\n]+)/i,
    "$1{{PASSWORD}}"
  );

  // Replace screen line
  template = template.replace(
    /((?:📺|screen|slot|profile|หน้าจอ|จอ|โปรไฟล์)\s*(?:ที่|no\.?|number)?\s*[:#-]?\s*)([^\r\n]+)/i,
    "$1{{SCREEN}}"
  );

  // Replace date line
  template = template.replace(
    /((?:⏰|หมดอายุ|expire|expiry|valid)\s*[:：=]?\s*)([^\r\n]+)/i,
    "$1{{EXPIRY}}"
  );

  // Replace invite link if present (exclude 2FA help websites like m2holdhouse)
  template = template.replace(/(https?:\/\/(?!m2holdhouse)[^\s\r\n]*(?:canva|join|family|token|invite)[^\s\r\n]*)/i, "{{INVITE_LINK}}");

  // Check if at least email/password or invite link was replaced
  if (template.includes("{{EMAIL}}") || template.includes("{{INVITE_LINK}}")) {
    return template;
  }

  return null;
}

/**
 * Render single delivery text for an account item using template
 */
export function renderAccountDeliveryText(
  productName: string,
  item: ExtractedStockItem,
  existingDetailsTemplate?: string | null
): string {
  const expiryDate = calculateProductExpiryDate(productName);
  const pLower = productName.toLowerCase();

  // 1. If an existing template exists, interpolate into it
  if (existingDetailsTemplate) {
    let text = existingDetailsTemplate;
    text = text.replace(/{{EMAIL}}/g, item.email || "");
    text = text.replace(/{{PASSWORD}}/g, item.password || "");

    const screenVal = item.screen
      ? item.screen.startsWith("จอ") || item.screen.toLowerCase().startsWith("screen")
        ? item.screen
        : `จอ ${item.screen}`
      : "จอ 1";
    text = text.replace(/{{SCREEN}}/g, screenVal);
    text = text.replace(/{{EXPIRY}}/g, item.expiry || expiryDate);

    if (item.inviteLink) {
      text = text.replace(/{{INVITE_LINK}}/g, item.inviteLink);
    } else if (item.email && item.email.startsWith("http")) {
      text = text.replace(/{{INVITE_LINK}}/g, item.email);
    }

    return text.trim();
  }

  // 2. Check predefined service templates
  for (const [key, generator] of Object.entries(DEFAULT_TEMPLATES)) {
    if (pLower.includes(key)) {
      return generator(productName, item, expiryDate).trim();
    }
  }

  // 3. Generic fallback
  const lines: string[] = [];
  if (item.email) lines.push(`Email : ${item.email}`);
  if (item.password) lines.push(`Pass : ${item.password}`);
  if (item.screen) lines.push(`จอ : ${item.screen}`);
  if (item.expiry) lines.push(`หมดอายุ : ${item.expiry}`);
  if (item.inviteLink) lines.push(`Link : ${item.inviteLink}`);
  if (item.extra) lines.push(item.extra);

  return lines.join("\n");
}

/**
 * Format a full stock batch with form injection, deduplication, and preview
 */
export function prepareStockBatch(params: {
  product: {
    id: string;
    typeId: string;
    name: string;
    stockDeliveryType?: StockDeliveryType;
    accountData?: ProductAccount[] | null;
  };
  items: ExtractedStockItem[];
}): PreparedStockBatch {
  const { product, items } = params;
  const existingAccounts = product.accountData || [];
  const deliveryType = product.stockDeliveryType || "account-pool";

  // Try to find a template from existing accounts
  let existingTemplate: string | null = null;
  for (const acc of existingAccounts) {
    if (acc.details && acc.details.length > 20) {
      const extracted = extractTemplateFromExistingDetails(acc.details);
      if (extracted) {
        existingTemplate = extracted;
        break;
      }
    }
  }

  // Deduplication set based on getStockDeliveryIdentity
  const existingKeys = new Set(
    existingAccounts
      .map((acc) => getStockDeliveryIdentity(acc, product.name, deliveryType))
      .filter((k): k is string => Boolean(k))
  );

  const batchKeys = new Set<string>();
  const validAccounts: ProductAccount[] = [];
  let duplicateCount = 0;

  for (const item of items) {
    const email = (item.email || "").trim();
    const password = (item.password || "").trim();
    const details = renderAccountDeliveryText(product.name, item, existingTemplate);

    const candidateAccount: ProductAccount = {
      email,
      password,
      details,
    };

    const key = getStockDeliveryIdentity(candidateAccount, product.name, deliveryType);
    if (key !== null && (existingKeys.has(key) || batchKeys.has(key))) {
      duplicateCount++;
      continue;
    }

    if (key !== null) batchKeys.add(key);
    validAccounts.push(candidateAccount);
  }

  const rawInput = formatAccountData(
    validAccounts.map((a) => ({
      email: a.email,
      password: a.password,
      details: a.details,
      rawLines: [a.details],
    })),
    ","
  );

  const previewDeliveryForm = validAccounts[0]?.details || "";

  return {
    rawInput,
    validAccounts,
    previewDeliveryForm,
    duplicateCount,
    validCount: validAccounts.length,
    totalDetected: items.length,
  };
}