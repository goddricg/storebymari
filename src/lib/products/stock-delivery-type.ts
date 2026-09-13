import type { ProductAccount, StockDeliveryType } from "@/lib/products/types";
import {
  getAccountIdentity,
  getAccountIdentityIssue,
} from "@/lib/products/account-identity";

export const DEFAULT_STOCK_DELIVERY_TYPE: StockDeliveryType = "account-pool";

export const STOCK_DELIVERY_TYPE_OPTIONS: ReadonlyArray<{
  value: StockDeliveryType;
  label: string;
  description: string;
}> = [
  {
    value: "account-pool",
    label: "บัญชีผู้ใช้ (Account Pool)",
    description: "บัญชีและรหัสผ่าน ใช้ส่งมอบเป็นรายการต่อรายการ",
  },
  {
    value: "account-screen-pool",
    label: "บัญชีแบ่งจอ/โปรไฟล์ (Account + Screen Pool)",
    description: "Email และ Password ซ้ำได้ แต่หมายเลขจอหรือโปรไฟล์ต้องไม่ซ้ำกัน",
  },
  {
    value: "reusable-account-pool",
    label: "บัญชีผู้ใช้แบบซ้ำได้ (Reusable Account Pool)",
    description: "บัญชีผู้ใช้และรายละเอียดซ้ำกันได้โดยไม่มีเงื่อนไข ระบบจะเก็บทุกบัญชีเป็น Stock แยกกัน",
  },
  {
    value: "invite-link-pool",
    label: "ลิงก์เชิญแบบใช้ครั้งเดียว (Invite Link Pool)",
    description: "ลิงก์แต่ละรายการต้องไม่ซ้ำกัน",
  },
  {
    value: "reusable-link",
    label: "ลิงก์เชิญแบบใช้ซ้ำได้ (Reusable Link)",
    description: "ลิงก์เดิมเพิ่มได้หลายรายการตามจำนวนสิทธิ์",
  },
];

export function isStockDeliveryType(value: unknown): value is StockDeliveryType {
  return (
    value === "account-pool" ||
    value === "account-screen-pool" ||
    value === "reusable-account-pool" ||
    value === "invite-link-pool" ||
    value === "reusable-link"
  );
}

export function parseStockDeliveryType(value: unknown): StockDeliveryType {
  return isStockDeliveryType(value) ? value : DEFAULT_STOCK_DELIVERY_TYPE;
}

export function getStockDeliveryTypeLabel(value: unknown): string {
  const normalized = parseStockDeliveryType(value);
  return (
    STOCK_DELIVERY_TYPE_OPTIONS.find((option) => option.value === normalized)?.label ??
    STOCK_DELIVERY_TYPE_OPTIONS[0].label
  );
}

export function canUpgradeStockDeliveryType(
  from: StockDeliveryType,
  to: StockDeliveryType,
): boolean {
  return (
    from === to ||
    (from === "account-pool" &&
      (to === "account-screen-pool" || to === "reusable-account-pool")) ||
    (from === "account-screen-pool" && to === "reusable-account-pool")
  );
}

function normalizeLineBreaks(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function normalizeInviteLink(value: string): string {
  const normalized = normalizeLineBreaks(value);
  const url = normalized.match(/https?:\/\/[^\s]+/i)?.[0];
  return url || normalized;
}

export function getStockDeliveryIdentity(
  account: Pick<ProductAccount, "email" | "password"> & { details?: string | null },
  productName: string,
  deliveryType: StockDeliveryType = DEFAULT_STOCK_DELIVERY_TYPE,
): string | null {
  if (deliveryType === "reusable-account-pool" || deliveryType === "reusable-link") return null;

  if (deliveryType === "invite-link-pool") {
    const link = normalizeInviteLink(account.details || "");
    if (link) return JSON.stringify(["invite-link", link]);
  }

  if (deliveryType === "account-screen-pool") {
    return getAccountIdentity(account, productName, "credentials-screen");
  }

  return getAccountIdentity(account, productName);
}

export function getStockDeliveryIdentityIssue(
  account: Pick<ProductAccount, "email" | "password"> & { details?: string | null },
  productName: string,
  deliveryType: StockDeliveryType = DEFAULT_STOCK_DELIVERY_TYPE,
): string | null {
  if (deliveryType !== "account-screen-pool") return null;
  return getAccountIdentityIssue(account, productName, "credentials-screen");
}
