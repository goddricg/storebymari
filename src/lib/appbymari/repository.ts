import type { RowDataPacket } from "mysql2/promise";
import { createHash } from "crypto";
import pool from "@/lib/mysql";
import { getSiteId } from "@/lib/site";
import type { Product } from "@/lib/products/types";
import {
  APPBYMARI_PROVIDER_NAME,
  parseAppByMariStorefrontTypeId,
  toAppByMariStorefrontTypeId,
  type AppByMariAdminProduct,
  type AppByMariRemoteProduct,
  type AppByMariStorefrontProduct,
} from "./types";
import { ensureAppByMariSchema } from "./schema";

type AppByMariProductRow = RowDataPacket & {
  id: string;
  site_id: string;
  api_provider_id: string | null;
  source_type_id: string;
  name: string;
  image_url: string | null;
  image_override_url: string | null;
  details: string | null;
  category_name: string | null;
  cost_price: number | string;
  sale_price: number | string;
  stock: number | string;
  reserved_stock: number | string;
  is_enabled: number | boolean;
  last_synced_at: Date | string | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
};

function asNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function asIso(value: Date | string | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

function toAdminProduct(row: AppByMariProductRow): AppByMariAdminProduct {
  const stock = Math.max(0, Math.trunc(asNumber(row.stock)));
  const reservedStock = Math.max(0, Math.trunc(asNumber(row.reserved_stock)));
  return {
    id: row.id,
    sourceTypeId: row.source_type_id,
    name: row.name,
    imageUrl: row.image_override_url ?? row.image_url ?? null,
    sourceImageUrl: row.image_url ?? null,
    details: row.details ?? null,
    categoryName: row.category_name ?? null,
    costPrice: Math.max(0, asNumber(row.cost_price)),
    salePrice: Math.max(0, asNumber(row.sale_price)),
    stock,
    reservedStock,
    availableStock: Math.max(0, stock - reservedStock),
    isEnabled: row.is_enabled === 1 || row.is_enabled === true,
    hasImageOverride: Boolean(row.image_override_url),
    lastSyncedAt: asIso(row.last_synced_at),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  };
}

export function toAppByMariStorefrontProduct(row: AppByMariProductRow): AppByMariStorefrontProduct {
  const adminProduct = toAdminProduct(row);
  const now = new Date().toISOString();
  return {
    id: `appbymari:${row.id}`,
    typeId: toAppByMariStorefrontTypeId(row.source_type_id),
    name: row.name,
    imageUrl: adminProduct.imageUrl,
    typeImageUrl: adminProduct.imageUrl,
    details: row.details ?? null,
    price: adminProduct.salePrice,
    mainPrice: adminProduct.salePrice,
    priceVip: adminProduct.salePrice,
    costPrice: adminProduct.costPrice,
    priceWalkin: adminProduct.salePrice,
    stock: adminProduct.availableStock,
    availableStock: adminProduct.availableStock,
    accountCount: adminProduct.availableStock,
    hasStaticAccount: false,
    typeMenu: row.category_name ?? null,
    categoryId: null,
    accountEmail: null,
    accountPassword: null,
    accountData: [],
    stockDeliveryType: "account-pool",
    isPublished: true,
    apiProviderId: row.api_provider_id ?? APPBYMARI_PROVIDER_NAME,
    badge: null,
    createdAt: asIso(row.created_at) ?? now,
    updatedAt: asIso(row.updated_at) ?? now,
    isExternal: true,
    externalSourceTypeId: row.source_type_id,
  };
}

function toRowProduct(row: AppByMariProductRow): Product {
  return toAppByMariStorefrontProduct(row);
}

export async function getAppByMariProductsForAdmin(siteId = "main"): Promise<AppByMariAdminProduct[]> {
  await ensureAppByMariSchema();
  const [rows] = await pool.execute<AppByMariProductRow[]>(
    `SELECT * FROM appbymari_products
     WHERE site_id = ?
     ORDER BY name ASC, source_type_id ASC`,
    [siteId],
  );
  return rows.map(toAdminProduct);
}

export async function getAppByMariProductStats(siteId = "main"): Promise<{
  total: number;
  enabled: number;
  lastSyncedAt: string | null;
}> {
  await ensureAppByMariSchema();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN is_enabled = 1 THEN 1 ELSE 0 END) AS enabled,
            MAX(last_synced_at) AS last_synced_at
     FROM appbymari_products
     WHERE site_id = ?`,
    [siteId],
  );
  const row = rows[0] as (RowDataPacket & {
    total?: number | string;
    enabled?: number | string;
    last_synced_at?: Date | string | null;
  }) | undefined;
  return {
    total: Math.max(0, Math.trunc(asNumber(row?.total))),
    enabled: Math.max(0, Math.trunc(asNumber(row?.enabled))),
    lastSyncedAt: asIso(row?.last_synced_at ?? null),
  };
}

export async function upsertAppByMariProducts(
  items: AppByMariRemoteProduct[],
  providerId: string,
  siteId = "main",
): Promise<number> {
  await ensureAppByMariSchema();
  const now = new Date();
  for (const item of items) {
    const sourceTypeId = item.sourceTypeId.trim();
    if (!sourceTypeId) continue;
    const id = `${APPBYMARI_PROVIDER_NAME}:${createHash("sha256").update(sourceTypeId).digest("hex")}`;
    await pool.execute(
      `INSERT INTO appbymari_products (
         id, site_id, api_provider_id, source_type_id, name, image_url, details,
         category_name, cost_price, sale_price, stock, reserved_stock, is_enabled,
         last_synced_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         id = VALUES(id), api_provider_id = VALUES(api_provider_id),
         name = VALUES(name), image_url = VALUES(image_url), details = VALUES(details),
         category_name = VALUES(category_name), cost_price = VALUES(cost_price),
         stock = VALUES(stock), last_synced_at = VALUES(last_synced_at),
         updated_at = VALUES(updated_at)`,
      [
        id,
        siteId,
        providerId,
        sourceTypeId,
        item.name,
        item.imageUrl,
        item.details,
        item.categoryName,
        Math.max(0, item.costPrice),
        Math.max(0, item.costPrice),
        Math.max(0, Math.trunc(item.stock)),
        now,
        now,
        now,
      ],
    );
  }
  return items.length;
}

export async function updateAppByMariProductSettings(input: {
  sourceTypeId: string;
  siteId?: string;
  salePrice?: number;
  isEnabled?: boolean;
  imageUrl?: string | null;
}): Promise<AppByMariAdminProduct | null> {
  await ensureAppByMariSchema();
  const siteId = input.siteId ?? getSiteId();
  const updates: string[] = [];
  const params: any[] = [];
  if (input.salePrice !== undefined) {
    updates.push("sale_price = ?");
    params.push(input.salePrice);
  }
  if (input.isEnabled !== undefined) {
    updates.push("is_enabled = ?");
    params.push(input.isEnabled ? 1 : 0);
  }
  if (input.imageUrl !== undefined) {
    updates.push("image_override_url = ?");
    params.push(input.imageUrl?.trim() || null);
  }
  if (updates.length === 0) throw new Error("ต้องระบุราคาขาย สถานะ หรือรูปภาพ");
  updates.push("updated_at = ?");
  params.push(new Date(), input.sourceTypeId, siteId);

  await pool.execute(
    `UPDATE appbymari_products SET ${updates.join(", ")}
     WHERE source_type_id = ? AND site_id = ?`,
    params,
  );
  const [rows] = await pool.execute<AppByMariProductRow[]>(
    `SELECT * FROM appbymari_products
     WHERE source_type_id = ? AND site_id = ?
     LIMIT 1`,
    [input.sourceTypeId, siteId],
  );
  return rows[0] ? toAdminProduct(rows[0]) : null;
}

export async function findAppByMariStorefrontProduct(typeId: string, siteId = getSiteId()): Promise<Product | null> {
  await ensureAppByMariSchema();
  const sourceTypeId = parseAppByMariStorefrontTypeId(typeId);
  if (!sourceTypeId || siteId !== "main") return null;
  const [rows] = await pool.execute<AppByMariProductRow[]>(
    `SELECT * FROM appbymari_products
     WHERE source_type_id = ? AND site_id = ? AND is_enabled = 1
     LIMIT 1`,
    [sourceTypeId, siteId],
  );
  return rows[0] ? toRowProduct(rows[0]) : null;
}

export async function fetchEnabledAppByMariProducts(input: {
  siteId?: string;
  category?: string | null;
  searchTerm?: string | null;
} = {}): Promise<Product[]> {
  await ensureAppByMariSchema();
  const siteId = input.siteId ?? getSiteId();
  if (siteId !== "main") return [];
  const clauses = ["site_id = ?", "is_enabled = 1"];
  const params: any[] = [siteId];
  if (input.category && input.category !== "ทั้งหมด") {
    clauses.push("category_name = ?");
    params.push(input.category);
  }
  if (input.searchTerm?.trim()) {
    clauses.push("(name LIKE ? OR details LIKE ?)");
    const term = `%${input.searchTerm.trim()}%`;
    params.push(term, term);
  }
  const [rows] = await pool.execute<AppByMariProductRow[]>(
    `SELECT * FROM appbymari_products
     WHERE ${clauses.join(" AND ")}
     ORDER BY GREATEST(stock - reserved_stock, 0) DESC, name ASC`,
    params,
  );
  return rows.map(toRowProduct);
}

export async function getAppByMariProductRowForPurchase(input: {
  sourceTypeId: string;
  siteId?: string;
  connection: import("mysql2/promise").PoolConnection;
  lock?: boolean;
}): Promise<AppByMariProductRow | null> {
  await ensureAppByMariSchema();
  const siteId = input.siteId ?? getSiteId();
  const [rows] = await input.connection.execute<AppByMariProductRow[]>(
    `SELECT * FROM appbymari_products
     WHERE source_type_id = ? AND site_id = ? AND is_enabled = 1
     LIMIT 1${input.lock ? " FOR UPDATE" : ""}`,
    [input.sourceTypeId, siteId],
  );
  return rows[0] ?? null;
}

export async function getAppByMariProductRowById(input: {
  id: string;
  siteId?: string;
  connection: import("mysql2/promise").PoolConnection;
  lock?: boolean;
}): Promise<AppByMariProductRow | null> {
  await ensureAppByMariSchema();
  const siteId = input.siteId ?? getSiteId();
  const [rows] = await input.connection.execute<AppByMariProductRow[]>(
    `SELECT * FROM appbymari_products
     WHERE id = ? AND site_id = ?
     LIMIT 1${input.lock ? " FOR UPDATE" : ""}`,
    [input.id, siteId],
  );
  return rows[0] ?? null;
}

export type { AppByMariProductRow };
