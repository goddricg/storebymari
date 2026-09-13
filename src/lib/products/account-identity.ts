import type { AccountIdentityMode, ProductAccount } from "@/lib/products/types";

export type AccountIdentityInput = Pick<ProductAccount, "email" | "password"> & {
  details?: string | null;
};

function normalizeLineBreaks(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function normalizeDetails(value: string): string {
  return normalizeLineBreaks(value).replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeScreenValue(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (/^\d+$/.test(normalized)) {
    return String(Number.parseInt(normalized, 10));
  }
  return normalized;
}

/**
 * Read screen/profile/slot identifiers from the delivery text. The optional
 * label after `screen:` supports formats such as `screen : จอ 1` without
 * treating the word "จอ" as the identifier.
 */
export function getScreenIdentity(details: string): string | null {
  const normalized = normalizeDetails(details);
  const screenPattern =
    /(?:screen|slot|profile|หน้าจอ|จอ|โปรไฟล์)\s*(?:ที่|no\.?|number)?\s*[:#-]?\s*(?:screen|slot|profile|หน้าจอ|จอ|โปรไฟล์)?\s*[:#-]?\s*([a-z0-9\u0e00-\u0e7f]{1,12})/i;
  const match = normalized.match(screenPattern);
  return match?.[1] ? normalizeScreenValue(match[1]) : null;
}

export function isNetflixProductName(productName: string): boolean {
  return productName.toLowerCase().includes("netflix");
}

function getNetflixSlotKey(details: string): string {
  const normalized = normalizeDetails(details);
  const screen = getScreenIdentity(details);
  return screen ? `screen:${screen}` : `details:${normalized}`;
}

function accountParts(
  account: AccountIdentityInput,
  productName = "",
  identityMode?: AccountIdentityMode,
): [string, string] {
  let email = normalizeLineBreaks(account.email || "");
  let password = normalizeLineBreaks(account.password || "");

  if ((isNetflixProductName(productName) || identityMode === "credentials-screen") && (!email || !password)) {
    const details = normalizeLineBreaks(account.details || "");
    const emailMatch = details.match(/(?:email|mail|username|user|📧|💌|✉️|🅼🅰🅸🅻)\s*[:=：]\s*([^\s,|]+)/i);
    const passwordMatch = details.match(/(?:password|pass|🔐|🔑|🗝️|🅿🅰🆂🆂(?:🆆🅾🆁🅳)?|\u0e23\u0e2b\u0e31\u0e2a\u0e1c\u0e48\u0e32\u0e19)\s*[:=：]\s*([^\s,|]+)/i);
    email ||= emailMatch?.[1] || "";
    password ||= passwordMatch?.[1] || "";
  }

  return [email, password];
}

export function getAccountGroupKey(
  account: AccountIdentityInput,
  productName = "",
  identityMode?: AccountIdentityMode,
): string {
  const [email, password] = accountParts(account, productName, identityMode);
  if (email && password) return JSON.stringify([email, password]);
  return JSON.stringify([email, password, normalizeLineBreaks(account.details || "")]);
}

export function getAccountIdentity(
  account: AccountIdentityInput,
  productName: string,
  identityMode?: AccountIdentityMode,
): string {
  const [email, password] = accountParts(account, productName, identityMode);
  if (identityMode === "credentials-screen" && email && password) {
    const screen = getScreenIdentity(account.details || "") || "missing";
    return JSON.stringify([email, password, `screen:${screen}`]);
  }
  if (!identityMode && isNetflixProductName(productName) && email && password) {
    return JSON.stringify([email, password, getNetflixSlotKey(account.details || "")]);
  }
  return getAccountGroupKey(account, productName, identityMode);
}

export function getAccountIdentityIssue(
  account: AccountIdentityInput,
  productName: string,
  identityMode?: AccountIdentityMode,
): string | null {
  if (identityMode !== "credentials-screen") return null;

  const [email, password] = accountParts(account, productName, identityMode);
  if (!email || !password) {
    return "ต้องมี Email/Mail และ Password/Pass สำหรับสินค้าที่แบ่งตามจอ";
  }
  if (!getScreenIdentity(account.details || "")) {
    return "ไม่พบหมายเลขจอ/โปรไฟล์ เช่น screen : จอ 1";
  }
  return null;
}
