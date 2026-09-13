import { safeParseJson } from "@/lib/products/account-parser";

export type StockAccount = {
  email?: string;
  password?: string;
  details?: string;
};

export type ProductStockRow = {
  stock: number | string | null;
  account_data: unknown;
  account_email?: string | null;
  account_password?: string | null;
  api_provider_id?: string | null;
};

export function getAccountInventory(record: ProductStockRow): StockAccount[] {
  return safeParseJson<StockAccount[]>(record.account_data) ?? [];
}

/** Account inventory is authoritative when present; provider/static stock uses stock. */
export function getEffectiveStockFromRecord(
  record: ProductStockRow
): number {
  const accountInventory = getAccountInventory(record);
  if (accountInventory.length > 0) {
    return accountInventory.length;
  }

  const hasStaticDelivery = Boolean(
    record.account_email || record.account_password
  );
  const usesStockColumn = Boolean(record.api_provider_id || hasStaticDelivery);
  const hasFulfillmentMetadata =
    record.account_email !== undefined ||
    record.account_password !== undefined ||
    record.api_provider_id !== undefined;

  if (
    hasFulfillmentMetadata &&
    !usesStockColumn &&
    record.account_data !== null &&
    record.account_data !== undefined
  ) {
    return 0;
  }

  if (record.stock !== null && record.stock !== undefined) {
    const value =
      typeof record.stock === "number" ? record.stock : Number(record.stock);
    if (Number.isFinite(value)) {
      return Math.max(0, Math.trunc(value));
    }
  }

  return 0;
}
