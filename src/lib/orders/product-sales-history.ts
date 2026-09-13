import type { RowDataPacket } from "mysql2/promise";

import { toAnalyticsIso } from "@/lib/analytics/time";
import { getSiteId } from "@/lib/site";
import pool from "@/lib/mysql";

export const PRODUCT_SALES_HISTORY_PAGE_SIZE = 20;

export type ProductSalesHistoryQuery = {
  page: number;
  searchUser?: string;
  searchProductEmail?: string;
  startAt?: string;
  endExclusive?: string;
};

export type ProductSalesHistoryItem = {
  id: string;
  productName: string;
  productImage: string | null;
  productData: string | null;
  storeName: string;
  buyerName: string;
  buyerEmail: string | null;
  purchasedAt: string | null;
};

type ProductSalesHistoryRow = RowDataPacket & {
  id: string;
  product_name: string | null;
  product_image: string | null;
  product_details: string | null;
  account_email: string | null;
  account_password: string | null;
  purchased_at: Date | string | null;
  created_at: Date | string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  store_name: string | null;
  site_id: string | null;
};

type CountRow = RowDataPacket & {
  total: number | string;
};

const FALLBACK_STORE_NAMES: Record<string, string> = {
  main: "Appbymari",
  child1: "PremiumBySom",
  child2: "JaoBam",
};

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  return String(value);
}

function buildProductData(
  productDetails: string | null,
  accountEmail: string | null,
  accountPassword: string | null,
): string | null {
  const details = productDetails?.trim();
  if (details) return details;

  const fallback = [
    accountEmail ? `Email: ${accountEmail}` : null,
    accountPassword ? `Password: ${accountPassword}` : null,
  ].filter(Boolean);

  return fallback.length > 0 ? fallback.join("\n") : null;
}

function buildStoreName(siteId: string | null, configuredName: string | null): string {
  return configuredName?.trim() || FALLBACK_STORE_NAMES[siteId ?? ""] || siteId || "ไม่ระบุ";
}

export async function listProductSalesHistory(
  input: ProductSalesHistoryQuery,
): Promise<{ items: ProductSalesHistoryItem[]; total: number }> {
  const siteId = getSiteId();
  const where: string[] = ["o.site_id = ?"];
  const params: Array<string | number> = [siteId];

  if (input.startAt) {
    where.push("COALESCE(o.purchase_date, o.created_at) >= ?");
    params.push(input.startAt);
  }

  if (input.endExclusive) {
    where.push("COALESCE(o.purchase_date, o.created_at) < ?");
    params.push(input.endExclusive);
  }

  const userSearch = input.searchUser?.trim();
  if (userSearch) {
    const pattern = `%${userSearch}%`;
    where.push(`(
      COALESCE(u.display_name, '') LIKE ?
      OR COALESCE(u.email, '') LIKE ?
      OR COALESCE(o.buyer_display_name, '') LIKE ?
      OR COALESCE(o.buyer_email, '') LIKE ?
      OR COALESCE(o.username_buy, '') LIKE ?
    )`);
    params.push(pattern, pattern, pattern, pattern, pattern);
  }

  const productEmailSearch = input.searchProductEmail?.trim();
  if (productEmailSearch) {
    const pattern = `%${productEmailSearch}%`;
    where.push(`(
      COALESCE(o.product_details, '') LIKE ?
      OR COALESCE(o.account_email, '') LIKE ?
    )`);
    params.push(pattern, pattern);
  }

  const whereClause = where.join(" AND ");
  const joins = `
    LEFT JOIN users u
      ON u.id = o.buyer_user_id
      AND u.site_id = o.site_id
  `;

  const [countRows] = await pool.execute<CountRow[]>(
    `SELECT COUNT(*) AS total
     FROM orders o
     ${joins}
     WHERE ${whereClause}`,
    params,
  );
  const total = Number(countRows[0]?.total ?? 0);
  const offset = (input.page - 1) * PRODUCT_SALES_HISTORY_PAGE_SIZE;

  const [rows] = await pool.execute<ProductSalesHistoryRow[]>(
    `SELECT
       o.id,
       o.product_name,
       o.product_image,
       o.product_details,
       o.account_email,
       o.account_password,
       COALESCE(o.purchase_date, o.created_at) AS purchased_at,
       o.created_at,
       COALESCE(
         NULLIF(o.buyer_display_name, ''),
         NULLIF(u.display_name, ''),
         NULLIF(o.username_buy, ''),
         NULLIF(o.buyer_email, ''),
         NULLIF(u.email, '')
       ) AS buyer_name,
       COALESCE(NULLIF(o.buyer_email, ''), u.email) AS buyer_email,
       s.value AS store_name,
       o.site_id
     FROM orders o
     ${joins}
     LEFT JOIN settings s
       ON s.site_id = o.site_id
       AND s.key = 'site_name'
     WHERE ${whereClause}
     ORDER BY COALESCE(o.purchase_date, o.created_at) DESC, o.id DESC
     LIMIT ? OFFSET ?`,
    [...params, PRODUCT_SALES_HISTORY_PAGE_SIZE, offset],
  );

  return {
    total,
    items: rows.map((row) => ({
      id: row.id,
      productName: asNullableString(row.product_name) || "ไม่ระบุสินค้า",
      productImage: asNullableString(row.product_image),
      productData: buildProductData(
        asNullableString(row.product_details),
        asNullableString(row.account_email),
        asNullableString(row.account_password),
      ),
      storeName: buildStoreName(asNullableString(row.site_id), asNullableString(row.store_name)),
      buyerName: asNullableString(row.buyer_name) || "ไม่ระบุผู้ซื้อ",
      buyerEmail: asNullableString(row.buyer_email),
      purchasedAt: toAnalyticsIso(row.purchased_at ?? row.created_at),
    })),
  };
}
