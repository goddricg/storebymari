/**
 * Smart Warranty Date & Product Details Parser Service
 * รองรับการดึงและแปลงวันหมดอายุทั้ง ค.ศ., พ.ศ., 2 หลัก, 4 หลัก, สัญลักษณ์ และ Emoji
 */

export interface ParsedWarrantyDate {
  rawString: string | null;
  parsedDate: Date | null;
  formattedDate: string | null; // DD/MM/YYYY
  isoDate: string | null; // YYYY-MM-DD
  expirationDate: string | null; // YYYY-MM-DD
  remainingDays: number | null;
  status: 'active' | 'expiring_today' | 'expired' | 'unknown';
  displayText: string;
}

export interface ExtractedProductInfo {
  email: string | null;
  password: string | null;
  screenNumber: string | null;
  caseType: 'screen' | 'account';
  links: string[];
  inviteLink: string | null;
  warranty: ParsedWarrantyDate;
}

const THAI_MONTHS: Record<string, number> = {
  'ม.ค.': 1, 'มกราคม': 1,
  'ก.พ.': 2, 'กุมภาพันธ์': 2,
  'มี.ค.': 3, 'มีนาคม': 3,
  'เม.ย.': 4, 'เมษายน': 4,
  'พ.ค.': 5, 'พฤษภาคม': 5,
  'มิ.ย.': 6, 'มิถุนายน': 6,
  'ก.ค.': 7, 'กรกฎาคม': 7,
  'ส.ค.': 8, 'สิงหาคม': 8,
  'ก.ย.': 9, 'กันยายน': 9,
  'ต.ค.': 10, 'ตุลาคม': 10,
  'พ.ย.': 11, 'พฤศจิกายน': 11,
  'ธ.ค.': 12, 'ธันวาคม': 12,
};

const ENG_MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

/**
 * Normalizes year: converts Buddhist Era (พ.ศ.) or 2-digit years to full CE year (ค.ศ.)
 */
export function normalizeYear(yearNum: number): number {
  if (yearNum >= 2400) {
    // พ.ศ. 4 หลัก เช่น 2569 -> 2026
    return yearNum - 543;
  }
  if (yearNum >= 50 && yearNum <= 99) {
    // พ.ศ. 2 หลัก เช่น 69 -> 2569 -> 2026
    return (2500 + yearNum) - 543;
  }
  if (yearNum >= 0 && yearNum < 50) {
    // ค.ศ. 2 หลัก เช่น 26 -> 2026
    return 2000 + yearNum;
  }
  return yearNum;
}

/**
 * Gets current date in Bangkok timezone normalized to start-of-day (00:00:00)
 */
export function getBangkokToday(): Date {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const bangkokTime = new Date(utc + (7 * 3600000));
  return new Date(Date.UTC(bangkokTime.getFullYear(), bangkokTime.getMonth(), bangkokTime.getDate(), 0, 0, 0));
}

/**
 * Parses a date string into a normalized Bangkok Date object
 */
export function parseDateString(dateStr: string): Date | null {
  if (!dateStr || !dateStr.trim()) return null;

  // Pattern 1: DD/MM/YYYY or D/M/YY or DD-MM-YYYY or DD.MM.YYYY
  const slashMatch = dateStr.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (slashMatch) {
    const day = parseInt(slashMatch[1], 10);
    const month = parseInt(slashMatch[2], 10);
    const rawYear = parseInt(slashMatch[3], 10);
    const year = normalizeYear(rawYear);

    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2020 && year <= 2050) {
      return new Date(Date.UTC(year, month - 1, day, 23, 59, 59));
    }
  }

  // Pattern 2: YYYY-MM-DD
  const isoMatch = dateStr.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (isoMatch) {
    const rawYear = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    const year = normalizeYear(rawYear);

    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return new Date(Date.UTC(year, month - 1, day, 23, 59, 59));
    }
  }

  // Pattern 3: Thai month text (e.g. 18 ก.ย. 69, 18 กันยายน 2569)
  for (const [mName, mNum] of Object.entries(THAI_MONTHS)) {
    if (dateStr.includes(mName)) {
      const parts = dateStr.split(mName);
      const dayMatch = parts[0]?.match(/(\d{1,2})/);
      const yearMatch = parts[1]?.match(/(\d{2,4})/);
      if (dayMatch && yearMatch) {
        const day = parseInt(dayMatch[1], 10);
        const year = normalizeYear(parseInt(yearMatch[1], 10));
        return new Date(Date.UTC(year, mNum - 1, day, 23, 59, 59));
      }
    }
  }

  // Pattern 4: English month text (e.g. 18 Sep 2026)
  const engMatch = dateStr.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})/);
  if (engMatch) {
    const day = parseInt(engMatch[1], 10);
    const mStr = engMatch[2].toLowerCase();
    const year = normalizeYear(parseInt(engMatch[3], 10));
    const mNum = ENG_MONTHS[mStr];
    if (mNum) {
      return new Date(Date.UTC(year, mNum - 1, day, 23, 59, 59));
    }
  }

  return null;
}

/**
 * Parses warranty information from raw text or product details
 */
export function parseWarrantyDate(rawText: string | null | undefined): ParsedWarrantyDate {
  if (!rawText || !rawText.trim()) {
    return {
      rawString: null,
      parsedDate: null,
      formattedDate: null,
      isoDate: null,
      expirationDate: null,
      remainingDays: null,
      status: 'unknown',
      displayText: 'ไม่ระบุวันหมดอายุ',
    };
  }

  // 1. Try to find expiration lines with known prefixes
  const prefixPatterns = [
    /[⏰⏰]\s*:\s*([^\n\r]+)/i,
    /(?:exp|exp\s*date|expiration|expire|หมดอายุ|วันหมดอายุ|สิ้นสุด)\s*:\s*([^\n\r]+)/i,
    /(?:exp|หมดอายุ)\s+([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})/i,
  ];

  let rawString: string | null = null;
  for (const pattern of prefixPatterns) {
    const match = rawText.match(pattern);
    if (match && match[1]) {
      rawString = match[1].trim();
      break;
    }
  }

  // Fallback: If no prefix matched, scan for standalone date pattern DD/MM/YYYY or DD/MM/YY
  if (!rawString) {
    const fallbackMatch = rawText.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/);
    if (fallbackMatch) {
      rawString = fallbackMatch[1].trim();
    }
  }

  const parsedDate = rawString ? parseDateString(rawString) : parseDateString(rawText);
  if (!parsedDate) {
    return {
      rawString,
      parsedDate: null,
      formattedDate: null,
      isoDate: null,
      expirationDate: null,
      remainingDays: null,
      status: 'unknown',
      displayText: rawString ? `วันหมดอายุ: ${rawString}` : 'ไม่พบข้อมูลวันหมดอายุ',
    };
  }

  // Format to standard DD/MM/YYYY and ISO YYYY-MM-DD
  const day = String(parsedDate.getUTCDate()).padStart(2, '0');
  const month = String(parsedDate.getUTCMonth() + 1).padStart(2, '0');
  const year = parsedDate.getUTCFullYear();
  const formattedDate = `${day}/${month}/${year}`;
  const isoDate = `${year}-${month}-${day}`;

  // Calculate remaining days relative to Bangkok start-of-day
  const today = getBangkokToday();
  const expDay = new Date(Date.UTC(parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), parsedDate.getUTCDate(), 0, 0, 0));
  const diffTime = expDay.getTime() - today.getTime();
  const remainingDays = Math.round(diffTime / (1000 * 3600 * 24));

  let status: 'active' | 'expiring_today' | 'expired';
  let displayText: string;

  if (remainingDays > 0) {
    status = 'active';
    displayText = `อยู่ในประกัน (เหลืออีก ${remainingDays} วัน - หมดอายุ ${formattedDate})`;
  } else if (remainingDays === 0) {
    status = 'expiring_today';
    displayText = `วันสุดท้ายของประกัน (หมดอายุวันนี้ ${formattedDate})`;
  } else {
    status = 'expired';
    const expiredAgo = Math.abs(remainingDays);
    displayText = `หมดประกันแล้ว (หมดเมื่อ ${formattedDate} - เกินมา ${expiredAgo} วัน)`;
  }

  return {
    rawString,
    parsedDate,
    formattedDate,
    isoDate,
    expirationDate: isoDate,
    remainingDays,
    status,
    displayText,
  };
}

/**
 * Extracts complete product delivery info from product details or delivered text
 */
export function extractProductDetails(productDetails: string | null | undefined): ExtractedProductInfo {
  const details = productDetails || '';

  // 1. Email extraction
  const emailPatterns = [
    /[📧]\s*:\s*([^\s\n\r]+)/i,
    /(?:email|mail|อีเมล|เมล)\s*:\s*([^\s\n\r]+)/i,
    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
  ];
  let email: string | null = null;
  for (const p of emailPatterns) {
    const m = details.match(p);
    if (m && m[1]) {
      email = m[1].trim();
      break;
    }
  }

  // 2. Password extraction
  const passPatterns = [
    /[🔐🔑]\s*:\s*([^\s\n\r]+)/i,
    /(?:password|pass|รหัสผ่าน|พาส)\s*:\s*([^\s\n\r]+)/i,
  ];
  let password: string | null = null;
  for (const p of passPatterns) {
    const m = details.match(p);
    if (m && m[1]) {
      password = m[1].trim();
      break;
    }
  }

  // 3. Screen number extraction
  const screenPatterns = [
    /[📺🖥️]\s*:\s*([^\n\r]+)/i,
    /(?:screen|จอ|จอที่)\s*:\s*([^\n\r]+)/i,
    /(?:จอ\s*([0-9]+))/i,
  ];
  let screenNumber: string | null = null;
  for (const p of screenPatterns) {
    const m = details.match(p);
    if (m && m[1]) {
      screenNumber = m[1].trim();
      break;
    }
  }

  // 4. Case type determination ('screen' vs 'account')
  const caseType: 'screen' | 'account' = screenNumber ? 'screen' : 'account';

  // 5. Links extraction
  const linkMatches = details.match(/https?:\/\/[^\s\n\r<>"']+/g) || [];
  const inviteLink = linkMatches.find(l => l.includes('canva.com') || l.includes('join') || l.includes('invite') || l.includes('youtube.com')) || linkMatches[0] || null;

  // 6. Warranty Date parsing
  const warranty = parseWarrantyDate(details);

  return {
    email,
    password,
    screenNumber,
    caseType,
    links: linkMatches,
    inviteLink,
    warranty,
  };
}
