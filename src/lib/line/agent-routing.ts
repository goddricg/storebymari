/** Explicit operational commands retain their existing confirmation workflows.
 * Ordinary questions, including stock/support/help, go through the AI agent. */
export function isExplicitAdminOperation(text: string): boolean {
  return /^(?:(?:เปิด|ขอ|ดู)?\s*(?:แผงควบคุม|dashboard|control\s*panel|ปุ่มมิมิ|สวิตช์(?:มิมิ)?)|สถานะระบบ|หยุดตอบ|พักมิมิ|เงียบก่อน|ปิดมิมิ|ปิดระบบ|เปิดระบบ|เปิดมิมิ|เริ่มงาน|กลับมาทำงาน|resume|ลุยต่อ|ปลดล็อกทุกเคส|เคลียร์ทุกเคส|unlock all|รับเคส|ล็อกเคส|ปลดเคส|ดูแลต่อ|ปลดล็อก|พักเคส|จำไว้นะ|สอนงาน|กฎใหม่|เรียนรู้นะ|เติมสต็อก|เพิ่มสต็อก|ใส่สต็อก|refill|add stock|เช็คไอดี|เช็กไอดี|ดูไอดี|ไอดีฉัน|ไอดีผม|uid|my id|whoami|ตั้งสิทธิ์|ผูกสิทธิ์|เช็คสิทธิ์|เช็กสิทธิ์|ดูสิทธิ์|สิทธิ์แอดมิน|รายชื่อแอดมิน|แอดมินทั้งหมด)(?:\s|$)/iu.test(text.trim());
}

export function isAuthorizedAdminSource(
  source: { type?: string; groupId?: string }, configuredGroupId: string,
): boolean {
  return Boolean(configuredGroupId && source.type === "group" && source.groupId === configuredGroupId);
}

export function isExplicitHumanRequest(text: string): boolean {
  return /(?:ขอคุยกับคน|คุยกับแอดมิน|ติดต่อแอดมิน|ขอแอดมิน|เรียกแอดมิน|ขอคนตอบ|ขอคุยกับเจ้าหน้าที่|มีคนตอบไหม|มีคนอยู่ไหม)/u.test(text);
}
