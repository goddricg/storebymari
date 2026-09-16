import pool from "@/lib/mysql";
import type { Category } from "@/lib/products/types";
import { randomUUID } from "crypto";

const MAIN_SITE_ID = "main";

/**
 * The category scope is supplied by the trusted server-side site context.
 * `isLocal=true` means an exact local category for that site.  `isLocal=false`
 * means shared/global categories, plus main-owned local categories when the
 * caller is the main site.
 */
export type CategoryScope = Readonly<{
  siteId: string;
  isLocal: boolean;
}>;

type CategoryScopePredicate = {
  sql: string;
  params: string[];
};

const DEFAULT_CATEGORY_SCOPE: CategoryScope = {
  siteId: MAIN_SITE_ID,
  isLocal: false,
};

function normalizeScope(scope: CategoryScope = DEFAULT_CATEGORY_SCOPE): CategoryScope {
  const siteId = scope.siteId.trim();
  if (!siteId) {
    throw new Error("ไม่พบ site id สำหรับกำหนดขอบเขตหมวดหมู่");
  }

  return {
    siteId,
    isLocal: scope.isLocal === true,
  };
}

function qualify(alias: string, column: string): string {
  if (!alias) return column;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) {
    throw new Error("Invalid SQL table alias");
  }
  return `${alias}.${column}`;
}

/**
 * Build the one category/product visibility predicate used by every scoped
 * category operation.  Values remain prepared parameters; only the internal
 * SQL alias is interpolated after validation.
 */
export function buildCategoryScopePredicate(
  requestedScope: CategoryScope,
  alias = "",
): CategoryScopePredicate {
  const scope = normalizeScope(requestedScope);
  const isLocal = qualify(alias, "is_local");
  const siteId = qualify(alias, "site_id");

  if (scope.isLocal) {
    return {
      sql: `${isLocal} = 1 AND ${siteId} = ?`,
      params: [scope.siteId],
    };
  }

  // Shared categories historically used is_local = 0 and may have a legacy
  // NULL site_id. Keep both forms visible to all sites. On main, also keep
  // main-owned local categories visible; never include a child local row.
  if (scope.siteId === MAIN_SITE_ID) {
    return {
      sql: `(COALESCE(${isLocal}, 0) = 0 OR (${isLocal} = 1 AND ${siteId} = ?))`,
      params: [MAIN_SITE_ID],
    };
  }

  return {
    sql: `COALESCE(${isLocal}, 0) = 0`,
    params: [],
  };
}

function toCategory(row: any): Category {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    imageUrl: row.image_url ?? null,
    displayOrder: row.display_order ?? 0,
    isActive: row.is_active === 1 || row.is_active === true,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

export async function getAllCategories(
  scope: CategoryScope = DEFAULT_CATEGORY_SCOPE,
): Promise<Category[]> {
  try {
    const categoryScope = buildCategoryScopePredicate(scope);
    const [rows] = await pool.execute(
      `SELECT * FROM categories
       WHERE is_active = 1 AND ${categoryScope.sql}
       ORDER BY display_order ASC, name ASC`,
      categoryScope.params,
    );
    return (rows as any[]).map(toCategory);
  } catch (error) {
    console.error("Error in getAllCategories:", error);
    return [];
  }
}

export async function getAllCategoriesIncludingInactive(
  scope: CategoryScope = DEFAULT_CATEGORY_SCOPE,
): Promise<Category[]> {
  try {
    const categoryScope = buildCategoryScopePredicate(scope);
    const [rows] = await pool.execute(
      `SELECT * FROM categories
       WHERE ${categoryScope.sql}
       ORDER BY display_order ASC, name ASC`,
      categoryScope.params,
    );
    return (rows as any[]).map(toCategory);
  } catch (error) {
    console.error("Error in getAllCategoriesIncludingInactive:", error);
    return [];
  }
}

export async function getCategoryById(
  id: string,
  scope: CategoryScope = DEFAULT_CATEGORY_SCOPE,
): Promise<Category | null> {
  try {
    const categoryScope = buildCategoryScopePredicate(scope);
    const [rows] = await pool.execute(
      `SELECT * FROM categories
       WHERE id = ? AND ${categoryScope.sql}`,
      [id, ...categoryScope.params],
    );
    const list = rows as any[];
    if (list.length === 0) return null;
    return toCategory(list[0]);
  } catch (error) {
    console.error("Error in getCategoryById:", error);
    return null;
  }
}

function normalizeCreateScope(siteId: string | null, isLocal: boolean) {
  const normalizedSiteId = siteId?.trim() || null;

  if (isLocal && !normalizedSiteId) {
    throw new Error("หมวดหมู่ local ต้องระบุ site id");
  }

  // A caller must never create a global category owned by a child site. The
  // legacy null form remains supported for existing shared categories.
  if (!isLocal && normalizedSiteId && normalizedSiteId !== MAIN_SITE_ID) {
    throw new Error("หมวดหมู่ global ต้องสร้างด้วย site id ของ main เท่านั้น");
  }

  return { siteId: normalizedSiteId, isLocal };
}

export async function createCategory(
  name: string,
  description: string | null = null,
  imageUrl: string | null = null,
  displayOrder: number = 0,
  isActive: boolean = true,
  siteId: string | null = null,
  isLocal: boolean = false,
): Promise<Category> {
  try {
    const createScope = normalizeCreateScope(siteId, isLocal);
    const id = randomUUID();
    const now = new Date();

    await pool.execute(
      `INSERT INTO categories
       (id, name, description, image_url, display_order, is_active, created_at, updated_at, site_id, is_local)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        name,
        description,
        imageUrl,
        displayOrder,
        isActive ? 1 : 0,
        now,
        now,
        createScope.siteId,
        createScope.isLocal ? 1 : 0,
      ],
    );

    return {
      id,
      name,
      description,
      imageUrl,
      displayOrder,
      isActive,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  } catch (error: any) {
    throw new Error(`ไม่สามารถสร้างหมวดหมู่ได้: ${error?.message || "Unknown error"}`);
  }
}

export async function updateCategory(
  id: string,
  updates: {
    name?: string;
    description?: string | null;
    imageUrl?: string | null;
    displayOrder?: number;
    isActive?: boolean;
  },
  scope: CategoryScope = DEFAULT_CATEGORY_SCOPE,
): Promise<Category> {
  try {
    const categoryScope = buildCategoryScopePredicate(scope);
    const [existingRows] = await pool.execute(
      `SELECT * FROM categories
       WHERE id = ? AND ${categoryScope.sql}`,
      [id, ...categoryScope.params],
    );
    const list = existingRows as any[];
    if (list.length === 0) {
      throw new Error("ไม่พบหมวดหมู่ที่ต้องการแก้ไข");
    }

    const current = list[0];
    const name = updates.name !== undefined ? updates.name : current.name;
    const description = updates.description !== undefined ? updates.description : current.description;
    const imageUrl = updates.imageUrl !== undefined ? updates.imageUrl : current.image_url;
    const displayOrder = updates.displayOrder !== undefined ? updates.displayOrder : current.display_order;
    const isActive = updates.isActive !== undefined ? updates.isActive : current.is_active;
    const now = new Date();

    await pool.execute(
      `UPDATE categories
       SET name = ?, description = ?, image_url = ?, display_order = ?, is_active = ?, updated_at = ?
       WHERE id = ? AND ${categoryScope.sql}`,
      [
        name,
        description,
        imageUrl,
        displayOrder,
        isActive ? 1 : 0,
        now,
        id,
        ...categoryScope.params,
      ],
    );

    return {
      id,
      name,
      description,
      imageUrl,
      displayOrder,
      isActive: isActive === 1 || isActive === true,
      createdAt: new Date(current.created_at).toISOString(),
      updatedAt: now.toISOString(),
    };
  } catch (error: any) {
    throw new Error(`ไม่สามารถอัปเดตหมวดหมู่ได้: ${error?.message || "Unknown error"}`);
  }
}

export async function deleteCategory(
  id: string,
  scope: CategoryScope = DEFAULT_CATEGORY_SCOPE,
): Promise<void> {
  try {
    const categoryScope = buildCategoryScopePredicate(scope);
    const productScope = buildCategoryScopePredicate(scope, "p");

    // Only products in the same category scope can block this category delete.
    const [productRows] = await pool.execute(
      `SELECT 1 FROM products p
       WHERE p.category_id = ? AND ${productScope.sql}
       LIMIT 1`,
      [id, ...productScope.params],
    );

    if ((productRows as any[]).length > 0) {
      throw new Error("ไม่สามารถลบหมวดหมู่ได้ เนื่องจากมีสินค้าใช้หมวดหมู่นี้อยู่");
    }

    const [result] = await pool.execute(
      `DELETE FROM categories
       WHERE id = ? AND ${categoryScope.sql}`,
      [id, ...categoryScope.params],
    );

    if (Number((result as any)?.affectedRows ?? 0) === 0) {
      throw new Error("ไม่พบหมวดหมู่ที่ต้องการลบ");
    }
  } catch (error: any) {
    throw new Error(`ไม่สามารถลบหมวดหมู่ได้: ${error?.message || "Unknown error"}`);
  }
}
