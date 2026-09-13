/**
 * Mimi Micro-Reflex Engine
 * Provides instant, zero-delay responses for courteous small-talk, gratitude, and simple confirmations.
 * Completely bypasses LLM inference (0 tokens, < 1ms execution), preventing Mimi from over-explaining or pitching products inappropriately.
 */

interface ReflexPattern {
  patterns: RegExp[];
  responses: string[];
}

const REFLEX_PATTERNS: ReflexPattern[] = [
  // 1. Gratitude / Thanks
  {
    patterns: [
      /^(?:ขอบคุณ|ขอบใจ|ขอบคุน|แต๊งกิ้ว|แต้งกิ้ว|thank\s*you|thanks|thx)(?:\s*(?:นะ|มาก|มากๆ|มากก|มั่ก|มั่กๆ|ค้าบ|ครับ|ค่ะ|ค่า|นะคะ|คับ|งับ|นะค้า|น้า|เน้อ|โลด|จ้า|เลย))*\s*[!.]*$/i,
      /^(?:กราบ|ขอบพระคุณ)(?:\s*(?:มาก|มากๆ|ครับ|ค่ะ|ค่า|นะคะ))*\s*[!.]*$/i,
    ],
    responses: [
      "ยินดีดูแลเสมอค่าเตง มีอะไรให้มิมิช่วยสะกิดได้ตลอดน้า 🐰💕",
      "ด้วยความยินดีมั่กๆ เลยค่าพี่! ขอให้ใช้งานอย่างมีความสุขน้าา ✨🐰",
      "มิมิดูแลด้วยใจเยยงับบ ถ้ามีตรงไหนติดขัดทักหามิมิได้ตลอด 24 ชม. เลยน้า 💖",
    ],
  },

  // 2. Acknowledgments (OK / Roger / Got it)
  {
    patterns: [
      /^(?:โอเค|ok|okay|เคครับ|เคค่ะ|เคงับ|เค|โอเช|โอเคร|รับทราบ|เข้าใจแล้ว)(?:\s*(?:ครับ|ค่ะ|ค่า|นะคะ|คับ|งับ|น้า|เนอะ|จ้า|โลด))*\s*[!.]*$/i,
      /^(?:ครับ|ค่ะ|ค่า|ค้าบ|คับ|งับ|จ้า|จ้าา|จร้า|ได้ครับ|ได้ค่ะ|ได้ค่า|จัดไป|เยี่ยม|เรียบร้อย)(?:\s*(?:ครับ|ค่ะ|ค่า|นะคะ|คับ|งับ|น้า|เน้อ))*\s*[!.]*$/i,
    ],
    responses: [
      "รับทราบค่าเตง! มิมิสแตนด์บายรออยู่ตรงนี้น้า มีอะไรเรียกได้เยย 🐰✨",
      "โอเคเลยค่าพี่! สะกิดมิมิได้ตลอดเสมอน้า 💖",
      "เรียบร้อยแล้วบอกมิมิได้เยยน้าา พร้อมดูแลค่า 🐰💨",
    ],
  },

  // 3. Waiting / BRB
  {
    patterns: [
      /^(?:แป๊บ|แป๊บนะ|แป๊บนึง|รอแป๊บ|รอแป๊บนึง|แป๊บครับ|แป๊บค่ะ|เดี๋ยวมา|สักครู่|รอสักครู่|แปป|แปปนะ|แปปนึง)(?:\s*(?:ครับ|ค่ะ|ค่า|นะคะ|คับ|งับ|น้า))*\s*[!.]*$/i,
    ],
    responses: [
      "ได้เลยค่าเตง! ไม่ต้องรีบน้า มิมิรออยู่ตรงนี้เยย 🐰🕒",
      "รับทราบค่าา พร้อมเมื่อไหร่ทักบอกมิมิได้เลยน้า สแตนด์บายรอค่า ✨",
    ],
  },

  // 4. Finished / Sent / Transferred (Short confirmation)
  {
    patterns: [
      /^(?:ส่งแล้ว|ส่งไปแล้ว|โอนแล้ว|โอนไปแล้ว|แนบแล้ว|จ่ายแล้ว|ทำแล้ว|เรียบร้อยแล้ว)(?:\s*(?:ครับ|ค่ะ|ค่า|นะคะ|คับ|งับ|น้า|เน้อ|จ้า))*\s*[!.]*$/i,
    ],
    responses: [
      "รับทราบค่าเตง! หากระบบตรวจสอบเสร็จแล้วจะอัปเดตให้อัตโนมัติทันทีเลยน้า หรือถ้าติดปัญหาตรงไหนสะกิดมิมิได้เยย 🐰⚡",
      "ขอบคุณค่าพี่! มิมิช่วยบันทึกข้อมูลไว้ให้แล้วน้า ถ้าต้องการให้มิมิตรวจสอบตรงไหนเพิ่มเติมบอกได้เยยงับ 💕",
    ],
  },

  // 5. In-Chat Order or Payment Request (Directing to Auto-Web)
  {
    patterns: [
      /(?:สั่ง|ซื้อ|โอน|จ่าย)(?:ใน|ผ่าน)?(?:แชท|นี้|ไลน์|ข้อความ)(?:ได้ไหม|ได้มั้ย|ได้รึเปล่า|ได้ป่าว|หรอ|มั้ย|ไหม|คะ|ครับ|งับ)/i,
      /(?:ขอ|มี)?\s*(?:เลขบัญชี|บัญชีโอน|เลขบช|บช|คิวอาร์|qr\s*code)(?:\s*(?:หน่อย|มั้ย|ไหม|คะ|ครับ|งับ|ด้วย))?/i,
      /(?:โอน|จ่าย)(?:เข้า|ที่)?\s*(?:บัญชีไหน|บชไหน|ทางไหน)(?:\s*(?:คะ|ครับ|งับ))?/i,
      /^(?:สั่งในแชท|สั่งในไลน์|ซื้อในแชท|โอนในแชท|ขอเลขบัญชี|โอนทางไหน|จ่ายยังไง)/i,
    ],
    responses: [
      "สั่งซื้อและชำระเงินผ่านหน้าเว็บ https://storebymari.com ได้เลยค่าเตง ระบบออโต้ส่งสินค้าให้ทันที 24 ชม. ไม่ต้องรอคิวเลยงับ 🐰✨",
      "ทางร้านไม่มีบริการสั่งซื้อหรือโอนเงินในแชทนะค้า รบกวนคุณลูกค้าทำรายการผ่านเว็บ https://storebymari.com ได้เลยค่า มีระบบออโต้ส่งของทันที 24 ชม. ค่า 🐰💖",
    ],
  },

  // 6. Bank Account Numbers or Wallet Information sent by customer
  {
    patterns: [
      /(?:กรุงศรี|กสิกร|ไทยพาณิชย์|กรุงเทพ|กรุงไทย|ทีทีบี|ttb|kbank|scb|bbl|ktb)\s*[:= ]*\s*\d{8,15}/i,
      /(?:wallet|วอลเล็ท|วอลเลต|พร้อมเพย์|ทรูมันนี่|truemoney)\s*[:= ]*\s*\d{10}/i,
      /\b\d{3}[-\s]?\d{1}[-\s]?\d{5}[-\s]?\d{1}\b/,
    ],
    responses: [
      "ทางร้านไม่มีบริการสั่งซื้อหรือรับโอนเงินในแชทนะค้า รบกวนคุณลูกค้าทำรายการผ่านหน้าเว็บ https://storebymari.com ได้เลยค่า มีระบบชำระเงินออโต้และส่งสินค้าทันที 24 ชม. ค่า 🐰✨",
    ],
  },
];

/**
 * Checks if a user message matches a micro-reflex pattern.
 * If matched, returns an instant, high-context cute response.
 * Otherwise returns null to let specialized sub-brains handle it.
 */
export function matchMicroReflex(userText: string): string | null {
  if (!userText) return null;
  const trimmed = userText.trim();

  // If text is excessively long, it's not a simple reflex
  if (trimmed.length > 200) return null;

  for (const group of REFLEX_PATTERNS) {
    for (const pattern of group.patterns) {
      if (pattern.test(trimmed)) {
        // Pick a random response from the matching group
        const randomIndex = Math.floor(Math.random() * group.responses.length);
        return group.responses[randomIndex];
      }
    }
  }

  return null;
}
