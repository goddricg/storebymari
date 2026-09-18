import type { Product } from "@/lib/products/types";

export const APPBYMARI_PROVIDER_NAME = "appbymari-main";
export const APPBYMARI_PROVIDER_DISPLAY_NAME = "Store By Mari ร้านหลัก";
export const APPBYMARI_API_BASE_URL = "https://appbymari.com/api/v1";
export const APPBYMARI_TYPE_PREFIX = "appbymari:";

export function toAppByMariStorefrontTypeId(sourceTypeId: string): string {
  return `${APPBYMARI_TYPE_PREFIX}${sourceTypeId.trim()}`;
}

export function parseAppByMariStorefrontTypeId(typeId: string): string | null {
  const normalized = typeId.trim();
  if (!normalized.startsWith(APPBYMARI_TYPE_PREFIX)) return null;
  const sourceTypeId = normalized.slice(APPBYMARI_TYPE_PREFIX.length).trim();
  return sourceTypeId.length > 0 ? sourceTypeId : null;
}

export type AppByMariRemoteProduct = {
  sourceTypeId: string;
  name: string;
  imageUrl: string | null;
  details: string | null;
  categoryName: string | null;
  costPrice: number;
  stock: number;
};

export type AppByMariAdminProduct = AppByMariRemoteProduct & {
  id: string;
  sourceImageUrl: string | null;
  hasImageOverride: boolean;
  salePrice: number;
  isEnabled: boolean;
  reservedStock: number;
  availableStock: number;
  lastSyncedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AppByMariStorefrontProduct = Product & {
  isExternal: true;
  externalSourceTypeId: string;
};

export type AppByMariPurchaseDelivery = {
  uid?: string | null;
  name: string;
  imageapi: string | null;
  textdb: string | null;
  point: number;
  date: string;
  accountEmail: string | null;
  accountPassword: string | null;
};

export type AppByMariPurchaseBody = {
  ok: true;
  message: string;
  order: {
    id: string;
    productName: string;
    productDetails: string | null;
    accountEmail: string | null;
    accountPassword: string | null;
    price: number;
    purchaseDate: string;
  } | {
    id: string;
    productName: string;
    productDetails: string | null;
    accountEmail: string | null;
    accountPassword: string | null;
    price: number;
    purchaseDate: string;
  }[];
  orders: {
    id: string;
    productName: string;
    productDetails: string | null;
    accountEmail: string | null;
    accountPassword: string | null;
    price: number;
    purchaseDate: string;
  }[];
  points: number;
  quantity: number;
};

export type AppByMariPurchaseErrorBody = {
  ok: false;
  message: string;
  retryable?: boolean;
  status?: "PROCESSING";
};

export type AppByMariPurchaseResult = {
  status: number;
  body: AppByMariPurchaseBody | AppByMariPurchaseErrorBody;
  orderIds?: string[];
};
