/**
 * Compatibility mapping for public postbacks from a pre-existing LINE menu.
 *
 * The application does not provision or replace a Rich Menu. Message Action
 * Quick Replies are the supported customer shortcuts; this mapping only keeps
 * legacy postback values on the same realtime MIMI path as typed messages.
 */
const CUSTOMER_MESSAGES = {
  products: "มิมิ ช่วยเช็กราคาและสินค้าที่มีให้หน่อย",
  stock: "มิมิ ช่วยเช็กสต็อกสินค้าให้หน่อย",
  order: "มิมิ ขอวิธีสั่งซื้อหน่อย",
  support: "มิมิ มีปัญหาการใช้งาน ขอให้ช่วยหน่อย",
  admin: "ขอคุยกับแอดมิน",
} as const;

/**
 * Map legacy/public postback values to ordinary customer messages. Rich Menu
 * postbacks from a 1:1 chat must not enter the admin-only postback branch.
 */
export function getCustomerRichMenuMessage(data: string): string | null {
  const raw = String(data || "").trim();
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const action = (params.get("action") || raw).trim().toLocaleLowerCase();
  const normalized = action.replace(/[\s_-]+/g, "");

  // Never reinterpret an admin mutation/control payload as a public query if
  // a stale menu sends it from a customer chat.
  if (/^(?:confirmstockfill|cancelstockfill|lockchat|unlockchat|mimiglobalpause|mimiglobalresume|viewactivecases|unlockallcases|showcontrolpanel)$/u.test(normalized)) return null;

  if (/(?:product|catalog|price|สินค้า|ราคา|shop|store|menu)/iu.test(normalized)) return CUSTOMER_MESSAGES.products;
  if (/(?:stock|inventory|เช็กสต็อก|สต็อก|ของมี|มีของ)/iu.test(normalized)) return CUSTOMER_MESSAGES.stock;
  if (/(?:buy|order|purchase|วิธีสั่ง|สั่งซื้อ|ซื้อ)/iu.test(normalized)) return CUSTOMER_MESSAGES.order;
  if (/(?:support|problem|issue|help|แจ้งปัญหา|ช่วยเหลือ|ใช้งาน)/iu.test(normalized)) return CUSTOMER_MESSAGES.support;
  if (/(?:admin|human|agent|เจ้าหน้าที่|แอดมิน|คนตอบ)/iu.test(normalized)) return CUSTOMER_MESSAGES.admin;
  return null;
}
