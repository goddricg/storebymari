import pool from "@/lib/mysql";
import type { ExternalProduct, Product, ProductAccount } from "@/lib/products/types";
import { randomUUID } from "crypto";
import { safeParseJson } from "@/lib/products/account-parser";
import { getSiteId } from "@/lib/site";
import { unstable_cache } from "next/cache";
import { FIRESTORE_PRODUCT_FIELDS_TO_DELETE } from "@/lib/products/realtime-sanitization";
import { parseStockDeliveryType } from "@/lib/products/stock-delivery-type";
import {
  fetchEnabledAppByMariProducts,
  findAppByMariStorefrontProduct,
} from "@/lib/appbymari/repository";
import { parseAppByMariStorefrontTypeId } from "@/lib/appbymari/types";

// Cache for category name -> id mapping
const categoryCache = new Map<string, string | null>();
let categoryCacheExpiry = 0;
const CACHE_DURATION = 0; // 0 minutes (Realtime)

async function getCategoryIdByName(categoryName: string): Promise<string | null> {
  const now = Date.now();
  if (categoryCache.has(categoryName) && now < categoryCacheExpiry) {
    return categoryCache.get(categoryName) ?? null;
  }
  
  try {
    const [rows] = await pool.execute(
      "SELECT id FROM categories WHERE name = ? AND is_active = 1 LIMIT 1",
      [categoryName]
    );
    const list = rows as any[];
    const categoryId = list.length > 0 ? list[0].id : null;
    
    categoryCache.set(categoryName, categoryId);
    categoryCacheExpiry = now + CACHE_DURATION;
    return categoryId;
  } catch (error) {
    console.error("Error in getCategoryIdByName:", error);
    return null;
  }
}

function toProduct(row: any, includeAccountData = true): Product {
  const accountData = includeAccountData
    ? safeParseJson<ProductAccount[]>(row.account_data)
    : null;
  const accountCount = row.account_count != null
    ? Math.max(0, Number(row.account_count) || 0)
    : (accountData && Array.isArray(accountData) ? accountData.length : 0);
  const fallbackStock = row.stock !== null && row.stock !== undefined
    ? Math.max(0, Math.trunc(Number(row.stock) || 0))
    : accountCount;
  const availableStock = row.available_stock != null
    ? Math.max(0, Math.trunc(Number(row.available_stock) || 0))
    : (accountCount > 0 ? accountCount : fallbackStock);
  const hasStaticAccount = row.has_static_account != null
    ? Boolean(Number(row.has_static_account))
    : Boolean(row.account_email || row.account_password);

  let stock = 0;
  if (row.stock !== null && row.stock !== undefined) {
    stock = Number(row.stock);
  } else if (accountData && Array.isArray(accountData)) {
    stock = accountData.length;
  }

  return {
    id: row.id,
    typeId: row.type_id,
    name: row.name,
    imageUrl: row.site_image_url ?? row.image_url ?? null,
    typeImageUrl: row.site_image_url ?? row.image_url ?? null,
    details: row.details ?? null,
    price: row.site_retail_price != null ? Number(row.site_retail_price) : (row.price != null ? Number(row.price) : null),
    mainPrice: row.price != null ? Number(row.price) : null,
    priceVip: row.site_price_vip != null ? Number(row.site_price_vip) : (row.price_vip != null ? Number(row.price_vip) : null),
    costPrice: row.cost_price != null ? Number(row.cost_price) : null,
    priceWalkin: row.site_price_walkin != null ? Number(row.site_price_walkin) : (row.price_walkin != null ? Number(row.price_walkin) : null),
    stock,
    availableStock,
    accountCount,
    hasStaticAccount,
    typeMenu: row.type_menu ?? null,
    categoryId: row.category_id ?? null,
    accountEmail: row.account_email ?? null,
    accountPassword: row.account_password ?? null,
    accountData,
    stockDeliveryType: parseStockDeliveryType(row.stock_delivery_type),
    isPublished: row.is_published === 1 || row.is_published === true,
    apiProviderId: row.api_provider_id ?? null,
    badge: row.badge ?? null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

function productVisibilityPredicate(alias = "") {
  const prefix = alias ? `${alias}.` : "";
  return `(${prefix}is_local = 0 OR (${prefix}is_local = 1 AND ${prefix}site_id = ?))`;
}

function externalSyncPredicate(siteId: string, alias = "") {
  const prefix = alias ? `${alias}.` : "";
  // External providers own the shared catalog on main. A child deployment may
  // sync only products local to that deployment; it must never reopen another
  // site's local row by type_id.
  return siteId === "main"
    ? `${prefix}is_local = 0`
    : `(${prefix}is_local = 1 AND ${prefix}site_id = ?)`;
}

async function selectScopedProductRow(
  typeId: string,
  siteId: string,
  productId?: string,
): Promise<any | null> {
  const targetPredicate = productId
    ? "p.id = ? AND p.type_id = ?"
    : "p.type_id = ?";
  const targetParams = productId ? [productId, typeId] : [typeId];

  const [rows] = await pool.execute(
    `SELECT p.*,
            spp.retail_price as site_retail_price,
            spp.price_vip as site_price_vip,
            spp.price_walkin as site_price_walkin,
            spp.image_url as site_image_url
     FROM products p
     LEFT JOIN site_product_prices spp
       ON p.id = spp.product_id AND spp.site_id = ?
     WHERE ${targetPredicate}
       AND ${productVisibilityPredicate("p")}
     LIMIT 1`,
    [siteId, ...targetParams, siteId],
  );

  return (rows as any[])[0] ?? null;
}


export const getAllCategoriesCached = unstable_cache(
  async (onlyPublishedWithStock: boolean = false) => {
    return await getAllCategories(onlyPublishedWithStock);
  },
  ["categories-list"],
  { tags: ["products"], revalidate: 300 }
);

export async function upsertProductsFromExternal(
  items: ExternalProduct[],
  apiProviderId: string,
  siteId: string = getSiteId(),
): Promise<void> {
  if (items.length === 0) return;

  const now = new Date();
  const syncSiteId = siteId.trim() || "main";
  const syncPredicate = externalSyncPredicate(syncSiteId, "p");
  const syncPredicateParams = syncSiteId === "main" ? [] : [syncSiteId];

  for (const item of items) {
    const rawCost = Number(item.pricevip);
    const priceVip = Number.isFinite(rawCost) ? rawCost : null;
    const salePrice = priceVip != null ? Math.max(0, priceVip) : null;

    // Select one product only within the trusted sync scope. Main sync owns
    // shared/global rows; a child sync owns only its own local rows.
    const [existingRows] = await pool.execute(
      `SELECT p.id
       FROM products p
       WHERE p.type_id = ? AND ${syncPredicate}
       LIMIT 1`,
      [item.type_id, ...syncPredicateParams]
    );
    const list = existingRows as any[];
    const existingId = list[0]?.id ?? null;
    let targetProductId = existingId as string | null;

    if (existingId) {
      // Update
      await pool.execute(
        `UPDATE products 
         SET name = ?, image_url = ?, details = ?, price = ?, price_vip = ?, price_walkin = ?, stock = ?, type_menu = ?, api_provider_id = ?, updated_at = ? 
         WHERE id = ? AND type_id = ? AND ${externalSyncPredicate(syncSiteId)}`,
        [
          item.name,
          item.imageapi,
          item.details,
          salePrice,
          priceVip,
          item.pricewalkin ? Number(item.pricewalkin) : null,
          item.stock,
          item.type_menu,
          apiProviderId,
          now,
          existingId,
          item.type_id,
          ...syncPredicateParams,
        ]
      );
    } else {
      // Insert
      const id = randomUUID();
      targetProductId = id;
      await pool.execute(
        `INSERT INTO products (id, type_id, name, image_url, details, price, price_vip, cost_price, price_walkin, stock, type_menu, api_provider_id, is_published, badge, created_at, updated_at, account_data, site_id, is_local)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          item.type_id,
          item.name,
          item.imageapi,
          item.details,
          salePrice,
          priceVip,
          null, // cost_price starts as null
          item.pricewalkin ? Number(item.pricewalkin) : null,
          item.stock,
          item.type_menu,
          apiProviderId,
          0, // is_published = false
          null, // badge
          now,
          now,
          JSON.stringify([]),
          syncSiteId,
          syncSiteId === "main" ? 0 : 1,
        ]
      );
    }

    const updatedProductRow = targetProductId
      ? await selectScopedProductRow(item.type_id, syncSiteId, targetProductId)
      : null;
    if (updatedProductRow) {
      await syncProductToFirestore(toProduct(updatedProductRow));
    }
  }
}
export async function isChildSiteApiEnabled(): Promise<boolean> {
  const siteId = getSiteId();
  if (siteId === 'main') return true;
  
  const masterEmail = process.env.NEXT_PUBLIC_CHILD_SITE_MASTER_EMAIL;
  if (!masterEmail) return false;
  
  try {
    const [rows] = await pool.execute(
      "SELECT is_api_enabled FROM users WHERE email = ? AND site_id = 'main' LIMIT 1",
      [masterEmail]
    );
    const list = rows as any[];
    if (list.length === 0) return false;
    return list[0].is_api_enabled === 1;
  } catch (err) {
    console.error("Error checking child site API status:", err);
    return false;
  }
}

export async function fetchAllProducts(): Promise<Product[]> {
  try {
    if (!(await isChildSiteApiEnabled())) return [];

    const siteId = getSiteId();
    const [rows] = await pool.execute(
      `SELECT p.*, spp.retail_price as site_retail_price, spp.price_vip as site_price_vip, spp.price_walkin as site_price_walkin, spp.image_url as site_image_url 
       FROM products p 
       LEFT JOIN site_product_prices spp ON p.id = spp.product_id AND spp.site_id = ? 
       WHERE (p.is_local = 0 OR (p.is_local = 1 AND p.site_id = ?))
       ORDER BY p.created_at DESC`,
      [siteId, siteId]
    );
    return (rows as any[]).map((row) => toProduct(row));
  } catch (error) {
    console.error("Error in fetchAllProducts:", error);
    return [];
  }
}

export async function fetchAllProductsPaginated(
  limit: number = 50,
  offset: number = 0,
  category?: string | null,
  searchTerm?: string | null,
  isLocalFilter?: boolean | null,
  includeAccountData: boolean = true,
): Promise<{ products: Product[]; total: number }> {
  try {
    if (!(await isChildSiteApiEnabled())) return { products: [], total: 0 };
    let whereClause = "1=1";
    const params: any[] = [];

    if (category && category !== "ทั้งหมด") {
      const categoryId = await getCategoryIdByName(category);
      if (categoryId) {
        whereClause += " AND p.category_id = ?";
        params.push(categoryId);
      } else {
        return { products: [], total: 0 };
      }
    }

    if (searchTerm && searchTerm.trim().length > 0) {
      whereClause += " AND p.name LIKE ?";
      params.push(`%${searchTerm.trim()}%`);
    }

    const siteId = getSiteId();
    if (isLocalFilter === true) {
      whereClause += " AND p.is_local = 1 AND p.site_id = ?";
      params.push(siteId);
    } else if (isLocalFilter === false) {
      whereClause += " AND p.is_local = 0";
    } else {
      whereClause += " AND (p.is_local = 0 OR (p.is_local = 1 AND p.site_id = ?))";
      params.push(siteId);
    }

    // Get total
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as count FROM products p WHERE ${whereClause}`,
      params
    );
    const total = (countRows as any[])[0].count;

    const selectParams = [siteId, ...params, String(limit), String(offset)];
    const productColumns = includeAccountData
      ? "p.*"
      : `p.id, p.site_id, p.is_local, p.type_id, p.name, p.image_url, p.details,
          p.price, p.price_vip, p.cost_price, p.price_walkin, p.stock, p.type_menu,
          p.category_id, p.is_published, p.api_provider_id, p.badge, p.stock_delivery_type,
         p.created_at, p.updated_at`;
    const [rows] = await pool.execute(
      `SELECT ${productColumns},
              spp.retail_price as site_retail_price,
              spp.price_vip as site_price_vip,
              spp.price_walkin as site_price_walkin,
              spp.image_url as site_image_url,
              COALESCE(JSON_LENGTH(p.account_data), 0) as account_count,
              COALESCE(NULLIF(JSON_LENGTH(p.account_data), 0), p.stock, 0) as available_stock,
              (p.account_email IS NOT NULL OR p.account_password IS NOT NULL) as has_static_account
       FROM products p
       LEFT JOIN site_product_prices spp ON p.id = spp.product_id AND spp.site_id = ?
       WHERE ${whereClause}
       ORDER BY available_stock DESC,
                CASE WHEN p.badge = 'hot_sale' THEN 3 WHEN p.badge = 'recommended' THEN 2 ELSE 1 END DESC,
                p.created_at DESC
       LIMIT ? OFFSET ?`,
      selectParams
    );

    return {
      products: (rows as any[]).map((row) => toProduct(row, includeAccountData)),
      total,
    };
  } catch (error) {
    console.error("Error in fetchAllProductsPaginated:", error);
    return { products: [], total: 0 };
  }
}

export async function bulkUpdatePublishStatus(
  isPublished: boolean,
  onlyWithStock: boolean = false
): Promise<number> {
  try {
    const now = new Date();
    const siteId = getSiteId();
    let query = "UPDATE products SET is_published = ?, updated_at = ?";
    const params: any[] = [isPublished ? 1 : 0, now];

    if (onlyWithStock) {
      query += " WHERE COALESCE(JSON_LENGTH(account_data), stock, 0) > 0 AND (is_local = 0 OR (is_local = 1 AND site_id = ?))";
      params.push(siteId);
    } else {
      query += " WHERE (is_local = 0 OR (is_local = 1 AND site_id = ?))";
      params.push(siteId);
    }

    const [result] = await pool.execute(query, params);
    const affected = (result as any).affectedRows;

    // Sync updated products to Firestore
    try {
      const [updatedRows] = await pool.execute(
        "SELECT * FROM products WHERE (is_local = 0 OR (is_local = 1 AND site_id = ?))",
        [siteId]
      );
      await Promise.allSettled(
        (updatedRows as any[]).map((row) =>
          syncProductToFirestore(toProduct(row))
        )
      );
    } catch (e) {}

    return affected;
  } catch (error) {
    console.error("Error in bulkUpdatePublishStatus:", error);
    throw error;
  }
}

export async function getAllCategories(
  onlyPublishedWithStock: boolean = false
): Promise<Array<{ category: string; imageUrl: string | null; count: number }>> {
  try {
    let query = `
      SELECT c.name AS category, c.image_url, COUNT(p.id) AS count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
    `;
    
    if (onlyPublishedWithStock) {
      query += " AND p.is_published = 1 AND COALESCE(JSON_LENGTH(p.account_data), p.stock, 0) > 0";
    }
    
    query += `
      WHERE c.is_active = 1
      GROUP BY c.id, c.name, c.image_url, c.display_order
      ORDER BY c.display_order ASC, c.name ASC
    `;

    const [rows] = await pool.execute(query);
    const categories = (rows as any[]).map(r => ({
      category: r.category,
      imageUrl: r.image_url ?? null,
      count: Number(r.count ?? 0),
    }));

    // Keep the category navigation sourced from the site's real catalogue.
    // AppByMari rows may contribute counts only when their synced category is
    // already present in that catalogue; unmatched source categories remain
    // visible under "ทั้งหมด" without inventing local categories.
    try {
      const externalProducts = await fetchEnabledAppByMariProducts({ siteId: getSiteId() });
      const counts = new Map<string, number>();
      for (const product of externalProducts) {
        if (onlyPublishedWithStock && (product.stock ?? 0) <= 0) continue;
        if (product.typeMenu) counts.set(product.typeMenu, (counts.get(product.typeMenu) ?? 0) + 1);
      }
      return categories.map((category) => ({
        ...category,
        count: category.count + (counts.get(category.category) ?? 0),
      }));
    } catch {
      return categories;
    }
  } catch (error) {
    console.error("Error in getAllCategories:", error);
    throw error;
  }
}

export async function fetchPublishedProducts(): Promise<Product[]> {
  try {
    if (!(await isChildSiteApiEnabled())) return [];
    const siteId = getSiteId();
    const [rows] = await pool.execute(
      `SELECT p.*, spp.retail_price as site_retail_price, spp.image_url as site_image_url, COALESCE(JSON_LENGTH(p.account_data), p.stock, 0) as effective_stock 
       FROM products p
       LEFT JOIN site_product_prices spp ON p.id = spp.product_id AND spp.site_id = ?
       WHERE p.is_published = 1 AND (p.is_local = 0 OR (p.is_local = 1 AND p.site_id = ?))
       ORDER BY CASE WHEN p.badge = 'hot_sale' THEN 3 WHEN p.badge = 'recommended' THEN 2 ELSE 1 END DESC, 
                p.name ASC`,
      [siteId, siteId]
    );
    const localProducts = (rows as any[]).map((row) => toProduct(row));
    try {
      const externalProducts = await fetchEnabledAppByMariProducts({ siteId });
      return [...localProducts, ...externalProducts];
    } catch {
      return localProducts;
    }
  } catch (error) {
    console.error("Error in fetchPublishedProducts:", error);
    return [];
  }
}

export const fetchPublishedProductsPaginated = unstable_cache(
  _fetchPublishedProductsPaginated,
  ["published-products-paginated"],
  { tags: ["products"], revalidate: 300 }
);

/** Uncached storefront read used by realtime reconciliation and polling fallback. */
export async function fetchPublishedProductsPaginatedLive(
  limit: number = 12,
  offset: number = 0,
  category?: string | null,
  searchTerm?: string | null
): Promise<{ products: Product[]; total: number }> {
  return _fetchPublishedProductsPaginated(limit, offset, category, searchTerm);
}

async function _fetchPublishedProductsPaginated(
  limit: number = 12,
  offset: number = 0,
  category?: string | null,
  searchTerm?: string | null
): Promise<{ products: Product[]; total: number }> {
  try {
    if (!(await isChildSiteApiEnabled())) return { products: [], total: 0 };
    const siteId = getSiteId();
    let whereClause = "p.is_published = 1 AND (p.is_local = 0 OR (p.is_local = 1 AND p.site_id = ?))";
    const params: any[] = [siteId];

    if (category && category !== "ทั้งหมด") {
      const categoryId = await getCategoryIdByName(category);
      if (categoryId) {
        whereClause += " AND p.category_id = ?";
        params.push(categoryId);
      } else {
        // The upstream category can be present in the synced catalog even if
        // it has not been added to the site's category table yet. Keep local
        // rows out of this filtered result while still allowing AppByMari rows
        // to match their source category below.
        whereClause += " AND 1 = 0";
      }
    }

    if (searchTerm && searchTerm.trim().length > 0) {
      whereClause += " AND p.name LIKE ?";
      params.push(`%${searchTerm.trim()}%`);
    }

    // Total count
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as count FROM products p WHERE ${whereClause}`,
      params
    );
    const total = (countRows as any[])[0].count;

    // Get paginated
    const fetchLimit = Math.max(1, offset + limit);
    const selectParams = [siteId, ...params, String(fetchLimit), "0"];
    const [rows] = await pool.execute(
      `SELECT p.*, spp.retail_price as site_retail_price, spp.price_vip as site_price_vip, spp.price_walkin as site_price_walkin, spp.image_url as site_image_url, COALESCE(JSON_LENGTH(p.account_data), p.stock, 0) as effective_stock 
       FROM products p
       LEFT JOIN site_product_prices spp ON p.id = spp.product_id AND spp.site_id = ?
       WHERE ${whereClause} 
       ORDER BY effective_stock DESC, 
                CASE WHEN p.badge = 'hot_sale' THEN 3 WHEN p.badge = 'recommended' THEN 2 ELSE 1 END DESC, 
                p.name ASC 
       LIMIT ? OFFSET ?`,
      selectParams
    );

    const localProducts = (rows as any[]).map((row) => toProduct(row));
    let externalProducts: Product[] = [];
    try {
      externalProducts = await fetchEnabledAppByMariProducts({
        siteId,
        category: category ?? null,
        searchTerm: searchTerm ?? null,
      });
    } catch {
      externalProducts = [];
    }

    const priority = (product: Product) => {
      const outOfStock = (product.stock ?? 0) <= 0 ? 1 : 0;
      const badge = product.badge === "hot_sale" ? 0 : product.badge === "recommended" ? 1 : 2;
      return [outOfStock, badge, product.name.toLocaleLowerCase()] as const;
    };
    const combined = [...localProducts, ...externalProducts].sort((left, right) => {
      const a = priority(left);
      const b = priority(right);
      if (a[0] !== b[0]) return a[0] - b[0];
      if (a[1] !== b[1]) return a[1] - b[1];
      return a[2].localeCompare(b[2]);
    });

    return {
      products: combined.slice(offset, offset + limit),
      total: Number(total) + externalProducts.length,
    };
  } catch (error) {
    console.error("Error in fetchPublishedProductsPaginated:", error);
    throw error;
  }
}


export async function findProductByTypeId(typeId: string): Promise<Product | null> {
  try {
    if (parseAppByMariStorefrontTypeId(typeId)) {
      const externalProduct = await findAppByMariStorefrontProduct(typeId, getSiteId());
      if (externalProduct) return externalProduct;
      return null;
    }
    if (!(await isChildSiteApiEnabled())) return null;
    const siteId = getSiteId();
    const row = await selectScopedProductRow(typeId, siteId);
    return row ? toProduct(row) : null;
  } catch (error) {
    console.error("Error in findProductByTypeId:", error);
    throw error;
  }
}

export async function applyGlobalProfit(
  mode: "amount" | "percent",
  value: number,
  siteId: string = getSiteId(),
): Promise<Product[]> {
  try {
    const now = new Date();
    const [rows] = await pool.execute(
      `SELECT id, price_vip
       FROM products
       WHERE ${productVisibilityPredicate()}`,
      [siteId]
    );
    
    for (const row of rows as any[]) {
      const cost = row.price_vip !== null ? Number(row.price_vip) : null;
      if (cost !== null && Number.isFinite(cost)) {
        const computed = mode === "amount" ? cost + value : cost * (1 + value / 100);
        const finalPrice = Number.isFinite(computed) ? Math.max(0, Number(computed.toFixed(2))) : cost;
        
        await pool.execute(
          `UPDATE products
           SET price = ?, updated_at = ?
           WHERE id = ? AND ${productVisibilityPredicate()}`,
          [finalPrice, now, row.id, siteId]
        );
      }
    }

    return fetchAllProducts();
  } catch (error) {
    console.error("Error in applyGlobalProfit:", error);
    throw error;
  }
}

export async function fetchCheapestProductsByCategory(): Promise<Product[]> {
  try {
    const siteId = getSiteId();
    const [rows] = await pool.execute(
      `SELECT p.* 
       FROM products p
       INNER JOIN (
         SELECT COALESCE(type_menu, 'อื่นๆ') as category, MIN(price) as min_price
         FROM products
         WHERE is_published = 1 AND (is_local = 0 OR (is_local = 1 AND site_id = ?))
         GROUP BY COALESCE(type_menu, 'อื่นๆ')
       ) grouped ON COALESCE(p.type_menu, 'อื่นๆ') = grouped.category AND p.price = grouped.min_price
       WHERE p.is_published = 1 AND (p.is_local = 0 OR (p.is_local = 1 AND p.site_id = ?))
       ORDER BY p.price ASC, p.name ASC`,
      [siteId, siteId]
    );

    // Filter duplicates per category in case there are multiple with same min_price
    const seen = new Set<string>();
    const result: Product[] = [];
    for (const r of rows as any[]) {
      const cat = r.type_menu ?? "อื่นๆ";
      if (!seen.has(cat)) {
        seen.add(cat);
        result.push(toProduct(r));
      }
    }
    return result;
  } catch (error) {
    console.error("Error in fetchCheapestProductsByCategory:", error);
    return [];
  }
}

export const fetchRecommendedProducts = unstable_cache(
  _fetchRecommendedProducts,
  ["recommended-products"],
  { tags: ["products"], revalidate: 300 }
);

async function _fetchRecommendedProducts(): Promise<Product[]> {
  try {
    const siteId = getSiteId();
    const [rows] = await pool.execute(
      `SELECT p.*, spp.retail_price as site_retail_price, spp.price_vip as site_price_vip, spp.price_walkin as site_price_walkin, spp.image_url as site_image_url, COALESCE(JSON_LENGTH(p.account_data), p.stock, 0) as effective_stock 
       FROM products p
       LEFT JOIN site_product_prices spp ON p.id = spp.product_id AND spp.site_id = ?
       WHERE p.is_published = 1 AND p.badge IN ('recommended', 'hot_sale') AND (p.is_local = 0 OR (p.is_local = 1 AND p.site_id = ?))
       ORDER BY CASE WHEN COALESCE(JSON_LENGTH(p.account_data), p.stock, 0) <= 0 THEN 1 ELSE 0 END ASC, 
                CASE WHEN p.badge = 'hot_sale' THEN 1 ELSE 2 END ASC`,
      [siteId, siteId]
    );
    return (rows as any[]).map((row) => toProduct(row));
  } catch (error) {
    console.error("Error in fetchRecommendedProducts:", error);
    return [];
  }
}


export async function updateProductPublishStatus(
  typeId: string,
  isPublished: boolean,
  productId?: string,
): Promise<void> {
  try {
    const now = new Date();
    const siteId = getSiteId();
    const current = await selectScopedProductRow(typeId, siteId, productId);
    if (!current) throw new Error("ไม่พบสินค้า");
    await pool.execute(
      `UPDATE products
       SET is_published = ?, updated_at = ?
       WHERE id = ? AND type_id = ? AND ${productVisibilityPredicate()}`,
      [isPublished ? 1 : 0, now, current.id, typeId, siteId]
    );
    const updated = await selectScopedProductRow(typeId, siteId, current.id);
    if (!updated) throw new Error("ไม่พบสินค้า");
    await syncProductToFirestore(toProduct(updated));
  } catch (error: any) {
    throw new Error(`อัปเดตสถานะสินค้าไม่สำเร็จ: ${error.message}`);
  }
}

export async function updateProductPrice(
  typeId: string,
  price: number,
  productId?: string,
): Promise<void> {
  try {
    const now = new Date();
    const siteId = getSiteId();
    const current = await selectScopedProductRow(typeId, siteId, productId);
    if (!current) throw new Error("ไม่พบสินค้า");
    await pool.execute(
      `UPDATE products
       SET price = ?, updated_at = ?
       WHERE id = ? AND type_id = ? AND ${productVisibilityPredicate()}`,
      [price, now, current.id, typeId, siteId]
    );
    const updated = await selectScopedProductRow(typeId, siteId, current.id);
    if (!updated) throw new Error("ไม่พบสินค้า");
    await syncProductToFirestore(toProduct(updated));
  } catch (error: any) {
    throw new Error(`อัปเดตราคาสินค้าไม่สำเร็จ: ${error.message}`);
  }
}

export async function updateProductBadge(
  typeId: string,
  badge: 'hot_sale' | 'recommended' | null,
  productId?: string,
): Promise<void> {
  try {
    const now = new Date();
    const siteId = getSiteId();
    const current = await selectScopedProductRow(typeId, siteId, productId);
    if (!current) throw new Error("ไม่พบสินค้า");
    await pool.execute(
      `UPDATE products
       SET badge = ?, updated_at = ?
       WHERE id = ? AND type_id = ? AND ${productVisibilityPredicate()}`,
      [badge, now, current.id, typeId, siteId]
    );
    const updated = await selectScopedProductRow(typeId, siteId, current.id);
    if (!updated) throw new Error("ไม่พบสินค้า");
    await syncProductToFirestore(toProduct(updated));
  } catch (error: any) {
    throw new Error(`อัปเดต badge สินค้าไม่สำเร็จ: ${error.message}`);
  }
}

export async function createProduct(
  typeId: string,
  name: string,
  imageUrl: string | null = null,
  details: string | null = null,
  price: number | null = null,
  priceVip: number | null = null,
  costPrice: number | null = null,
  priceWalkin: number | null = null,
  stock: number | null = null,
  categoryId: string | null = null,
  accountEmail: string | null = null,
  accountPassword: string | null = null,
  isPublished: boolean = false,
  badge: 'hot_sale' | 'recommended' | null = null,
  isLocal: boolean = false
): Promise<Product> {
  const existing = await findProductByTypeId(typeId);
  if (existing) {
    throw new Error(`สินค้าที่มี Type ID "${typeId}" มีอยู่แล้ว`);
  }

  try {
    const id = randomUUID();
    const now = new Date();
    const siteId = getSiteId();
    await pool.execute(
      `INSERT INTO products (id, type_id, name, image_url, details, price, price_vip, cost_price, price_walkin, stock, type_menu, category_id, account_email, account_password, account_data, is_published, api_provider_id, badge, created_at, updated_at, site_id, is_local) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        typeId,
        name,
        imageUrl,
        details,
        price,
        priceVip,
        costPrice,
        priceWalkin,
        stock,
        "", // type_menu defaults to empty, categories query sets category
        categoryId,
        accountEmail,
        accountPassword,
        JSON.stringify([]), // account_data starts empty
        isPublished ? 1 : 0,
        null,
        badge,
        now,
        now,
        siteId,
        (siteId !== 'main' || isLocal) ? 1 : 0
      ]
    );

    const productObj = {
      id,
      typeId,
      name,
      imageUrl,
      typeImageUrl: imageUrl,
      details,
      price,
      priceVip,
      costPrice,
      priceWalkin,
      stock: stock ?? 0,
      typeMenu: "",
      categoryId,
      accountEmail,
      accountPassword,
      accountData: [],
      isPublished,
      apiProviderId: null,
      badge,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    await syncProductToFirestore(productObj);

    return productObj;
  } catch (error: any) {
    throw new Error(`ไม่สามารถสร้างสินค้าได้: ${error?.message || "Unknown error"}`);
  }
}

export async function updateProduct(
  typeId: string,
  updates: {
    name?: string;
    imageUrl?: string | null;
    details?: string | null;
    price?: number | null;
    priceVip?: number | null;
    costPrice?: number | null;
    priceWalkin?: number | null;
    stock?: number | null;
    categoryId?: string | null;
    accountEmail?: string | null;
    accountPassword?: string | null;
    accountData?: ProductAccount[] | null;
    isPublished?: boolean;
    badge?: 'hot_sale' | 'recommended' | null;
  },
  forceStockUpdate: boolean = false,
  authorizedProductId?: string,
): Promise<Product> {
  try {
    const siteId = getSiteId();
    const current = await selectScopedProductRow(typeId, siteId, authorizedProductId);
    if (!current) {
      throw new Error("ไม่พบสินค้าที่ต้องการแก้ไข");
    }

    const isMainSite = siteId === 'main';
    const isLocalProduct = current.is_local === 1 || current.is_local === true;
    const canUpdateFully = isMainSite || isLocalProduct;
    const canUpdateStock = canUpdateFully || forceStockUpdate;

    // If it's a child site and NOT a local product, only update prices and image in site_product_prices
    if (!canUpdateFully) {
      if (updates.price !== undefined || updates.priceVip !== undefined || updates.priceWalkin !== undefined || updates.imageUrl !== undefined) {
        // Fetch existing site prices to merge
        const [sppRows] = await pool.execute(
          "SELECT retail_price, price_vip, price_walkin, image_url FROM site_product_prices WHERE site_id = ? AND product_id = ?",
          [siteId, current.id]
        );
        const sppList = sppRows as any[];
        const currentSpp = sppList.length > 0 ? sppList[0] : null;

        const newRetailPrice = updates.price !== undefined ? updates.price : (currentSpp?.retail_price ?? current.price);
        const newPriceVip = updates.priceVip !== undefined ? updates.priceVip : (currentSpp?.price_vip ?? current.price_vip);
        const newPriceWalkin = updates.priceWalkin !== undefined ? updates.priceWalkin : (currentSpp?.price_walkin ?? current.price_walkin);
        const newImageUrl = updates.imageUrl !== undefined ? updates.imageUrl : (currentSpp?.image_url ?? null);

        await pool.execute(
          `INSERT INTO site_product_prices (site_id, product_id, retail_price, price_vip, price_walkin, image_url) 
           VALUES (?, ?, ?, ?, ?, ?) 
           ON DUPLICATE KEY UPDATE retail_price = ?, price_vip = ?, price_walkin = ?, image_url = ?`,
          [siteId, current.id, newRetailPrice, newPriceVip, newPriceWalkin, newImageUrl, newRetailPrice, newPriceVip, newPriceWalkin, newImageUrl]
        );
      }
    }

    let updatedProduct: Product;

    // Shared/global products on a child site keep their canonical row intact;
    // only the child-specific price/image overlay is writable. Stock writes
    // with forceStockUpdate remain supported for the existing checkout path.
    if (canUpdateFully || forceStockUpdate) {
      // For main site or local products, use updates if provided. For child site, force using current values to prevent overwriting main site data.
      const name = (canUpdateFully && updates.name !== undefined) ? updates.name : current.name;
      const imageUrl = (canUpdateFully && updates.imageUrl !== undefined) ? updates.imageUrl : current.image_url;
      const details = (canUpdateFully && updates.details !== undefined) ? updates.details : current.details;

      // For main site or local products, update the prices in main table. For child site, keep the current main prices.
      const price = (canUpdateFully && updates.price !== undefined) ? updates.price : current.price;
      const priceVip = (canUpdateFully && updates.priceVip !== undefined) ? updates.priceVip : current.price_vip;
      const costPrice = (canUpdateFully && updates.costPrice !== undefined) ? updates.costPrice : current.cost_price;
      const priceWalkin = (canUpdateFully && updates.priceWalkin !== undefined) ? updates.priceWalkin : current.price_walkin;

      let accountDataObj: ProductAccount[] = [];
      let stock = current.stock;
      if (canUpdateStock && updates.accountData !== undefined) {
        accountDataObj = updates.accountData || [];
        stock = updates.accountData ? updates.accountData.length : 0;
      } else {
        accountDataObj = safeParseJson<ProductAccount[]>(current.account_data) || [];
        if (canUpdateStock && updates.stock !== undefined) {
          stock = updates.stock;
        }
      }

      const categoryId = (canUpdateFully && updates.categoryId !== undefined) ? updates.categoryId : current.category_id;
      const accountEmail = (canUpdateFully && updates.accountEmail !== undefined) ? updates.accountEmail : current.account_email;
      const accountPassword = (canUpdateFully && updates.accountPassword !== undefined) ? updates.accountPassword : current.account_password;
      const isPublished = (canUpdateFully && updates.isPublished !== undefined) ? updates.isPublished : current.is_published;
      const badge = (canUpdateFully && updates.badge !== undefined) ? updates.badge : current.badge;
      const now = new Date();

      await pool.execute(
        `UPDATE products
         SET name = ?, image_url = ?, details = ?, price = ?, price_vip = ?, cost_price = ?, price_walkin = ?, stock = ?, category_id = ?, account_email = ?, account_password = ?, account_data = ?, is_published = ?, badge = ?, updated_at = ?
         WHERE id = ? AND type_id = ? AND ${productVisibilityPredicate()}`,
        [
          name,
          imageUrl,
          details,
          price,
          priceVip,
          costPrice,
          priceWalkin,
          stock,
          categoryId,
          accountEmail,
          accountPassword,
          JSON.stringify(accountDataObj),
          isPublished ? 1 : 0,
          badge,
          now,
          current.id,
          typeId,
          siteId,
        ]
      );

      const updatedRow = await selectScopedProductRow(typeId, siteId, current.id);
      if (!updatedRow) throw new Error("ไม่พบสินค้าที่ต้องการแก้ไข");
      updatedProduct = toProduct(updatedRow);
    } else {
      const updatedRow = await selectScopedProductRow(typeId, siteId, current.id);
      if (!updatedRow) throw new Error("ไม่พบสินค้าที่ต้องการแก้ไข");
      updatedProduct = toProduct(updatedRow);
    }

    await syncProductToFirestore(updatedProduct);

    // ถ้าเป็นเว็บลูก ให้ส่ง Webhook ไปแจ้งเว็บแม่ให้ล้าง Cache และอัปเดต Firebase ด้วย
    if (siteId !== 'main' && process.env.NEXT_PUBLIC_MAIN_SITE_URL && process.env.MAIN_SITE_SYNC_SECRET) {
      fetch(`${process.env.NEXT_PUBLIC_MAIN_SITE_URL}/api/admin/products/sync-main`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ typeId, secret: process.env.MAIN_SITE_SYNC_SECRET })
      }).catch(err => console.error("Failed to trigger main site sync:", err));
    }

    return updatedProduct;
  } catch (error: any) {
    throw new Error(`ไม่สามารถอัปเดตสินค้าได้: ${error?.message || "Unknown error"}`);
  }
}

export async function deleteProduct(typeId: string, authorizedProductId?: string): Promise<void> {
  try {
    const siteId = getSiteId();
    const productRow = await selectScopedProductRow(typeId, siteId, authorizedProductId);
    const product = productRow ? toProduct(productRow) : null;
    if (!product) {
      throw new Error("ไม่พบสินค้า");
    }

    const isLocalProduct = productRow?.is_local === 1 || productRow?.is_local === true;
    if (siteId !== "main" && !isLocalProduct) {
      throw new Error("ไม่สามารถลบสินค้าหลักจากเว็บลูกได้");
    }

    // Check orders
    const [orderRows] = await pool.execute(
      "SELECT 1 FROM orders WHERE product_type_id = ? LIMIT 1",
      [typeId]
    );

    if ((orderRows as any[]).length > 0) {
      throw new Error("ไม่สามารถลบสินค้าได้ เนื่องจากมีคำสั่งซื้อที่เกี่ยวข้อง");
    }

    const [result] = await pool.execute(
      `DELETE FROM products
       WHERE id = ? AND type_id = ? AND ${productVisibilityPredicate()}`,
      [product.id, typeId, siteId],
    );
    if ((result as any).affectedRows !== 1) {
      throw new Error("ไม่พบสินค้า");
    }

    // Delete from Firestore
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (projectId) {
      const { db } = await import("@/lib/firebase-admin");
      await db.collection("products").doc(product.id).delete().catch(err => console.error("Firestore delete error:", err));
    }
  } catch (error: any) {
    throw new Error(`ไม่สามารถลบสินค้าได้: ${error.message}`);
  }
}

export const countTotalStockAndProducts = unstable_cache(
  _countTotalStockAndProducts,
  ["total-stock-products"],
  { tags: ["products"], revalidate: 300 }
);

async function _countTotalStockAndProducts(): Promise<{ totalStock: number; productCount: number }> {
  try {
    const siteId = getSiteId();
    const [rows] = await pool.execute(
      `SELECT SUM(COALESCE(JSON_LENGTH(account_data), stock, 0)) as totalStock, COUNT(id) as productCount 
       FROM products 
       WHERE is_published = 1 AND (is_local = 0 OR (is_local = 1 AND site_id = ?))`,
      [siteId]
    );
    const result = (rows as any[])[0];
    return {
      totalStock: Number(result.totalStock) || 0,
      productCount: Number(result.productCount) || 0,
    };
  } catch (error) {
    console.error("Error in countTotalStockAndProducts:", error);
    return { totalStock: 0, productCount: 0 };
  }
}

export async function syncProductToFirestore(product: Product): Promise<void> {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      return;
    }

    const [{ db }, { FieldValue }] = await Promise.all([
      import("@/lib/firebase-admin"),
      import("firebase-admin/firestore"),
    ]);
    const docRef = db.collection("products").doc(product.id);
    
    const siteId = getSiteId();
    
    const sensitiveFieldDeletions = Object.fromEntries(
      FIRESTORE_PRODUCT_FIELDS_TO_DELETE.map((field) => [
        field,
        FieldValue.delete(),
      ])
    );
    const payload: any = {
      id: product.id,
      type_id: product.typeId,
      name: product.name,
      image_url: product.imageUrl,
      details: product.details,
      stock: product.stock,
      type_menu: product.typeMenu,
      is_published: product.isPublished,
      badge: product.badge,
      category_id: product.categoryId,
      // Never expose delivery credentials through the client-readable channel.
      ...sensitiveFieldDeletions,
      api_provider_id: product.apiProviderId,
      updated_at: new Date().toISOString(),
    };

    if (siteId === "main") {
      payload.price = product.price;
      payload.price_vip = product.priceVip;
      payload.price_walkin = product.priceWalkin;
      payload.price_main = product.price;
      payload.price_main_vip = product.priceVip;
      payload.price_main_walkin = product.priceWalkin;
    } else {
      payload[`price_${siteId}`] = product.price;
      payload[`price_${siteId}_vip`] = product.priceVip;
      payload[`price_${siteId}_walkin`] = product.priceWalkin;
    }

    await docRef.set(payload, { merge: true });
    
    console.log(`[realtime] Successfully synced product ${product.id} (site: ${siteId}) to Firestore`);
  } catch (error: any) {
    console.error("[realtime] Failed to sync product to Firestore:", error.message);
  }
}
