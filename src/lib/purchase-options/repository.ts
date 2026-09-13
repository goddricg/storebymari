import { randomUUID } from "crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

import pool from "@/lib/mysql";
import { getSiteId } from "@/lib/site";
import type { PurchaseOption, PurchaseOptionInput } from "@/lib/purchase-options/types";

type PurchaseOptionRow = RowDataPacket & {
  id: string;
  site_id: string;
  product_id: string;
  product_type_id: string;
  name: string;
  quantity: number | string;
  price: number | string;
  price_vip: number | string | null;
  price_walkin: number | string | null;
  display_order: number | string;
  is_active: number | boolean;
  available_stock?: number | string | null;
};

function toPurchaseOption(row: PurchaseOptionRow): PurchaseOption {
  const availableStock = row.available_stock == null ? undefined : Number(row.available_stock);
  return {
    id: row.id,
    siteId: row.site_id,
    productId: row.product_id,
    productTypeId: row.product_type_id,
    name: row.name,
    quantity: Number(row.quantity),
    price: Number(row.price),
    priceVip: row.price_vip == null ? null : Number(row.price_vip),
    priceWalkin: row.price_walkin == null ? null : Number(row.price_walkin),
    displayOrder: Number(row.display_order),
    isActive: row.is_active === 1 || row.is_active === true,
    ...(availableStock === undefined
      ? {}
      : { availableStock, canBuy: availableStock >= Number(row.quantity) }),
  };
}

function assertMainSite(): string {
  const siteId = getSiteId();
  if (siteId !== "main") {
    throw new Error("Purchase bundle options are available on the main site only.");
  }
  return siteId;
}

export async function listPurchaseOptionsByTypeId(
  typeId: string,
  includeInactive = false,
  includeUnpublished = false
): Promise<PurchaseOption[]> {
  const siteId = assertMainSite();
  const activeClause = includeInactive ? "" : "AND ppo.is_active = 1";
  const publishedClause = includeUnpublished ? "" : "AND p.is_published = 1";
  const [rows] = await pool.execute<PurchaseOptionRow[]>(
    `SELECT ppo.*,
       CASE
         WHEN JSON_TYPE(p.account_data) = 'ARRAY' AND JSON_LENGTH(p.account_data) > 0
           THEN JSON_LENGTH(p.account_data)
         ELSE COALESCE(p.stock, 0)
       END AS available_stock
     FROM product_purchase_options ppo
     INNER JOIN products p ON p.id = ppo.product_id
     WHERE ppo.site_id = ?
       AND ppo.product_type_id = ?
       AND ppo.product_id = p.id
       AND p.type_id = ppo.product_type_id
       AND (p.is_local = 0 OR (p.is_local = 1 AND p.site_id = ?))
       ${publishedClause}
       ${activeClause}
     ORDER BY ppo.display_order ASC, ppo.quantity ASC, ppo.created_at ASC`,
    [siteId, typeId, siteId]
  );
  return rows.map(toPurchaseOption);
}

export async function listPurchaseOptionsForAdmin(typeId: string): Promise<PurchaseOption[]> {
  return listPurchaseOptionsByTypeId(typeId, true, true);
}

export async function replacePurchaseOptionsForProduct(
  typeId: string,
  inputs: PurchaseOptionInput[]
): Promise<PurchaseOption[]> {
  const siteId = assertMainSite();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [productRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id, type_id, api_provider_id
       FROM products
       WHERE type_id = ?
         AND (is_local = 0 OR (is_local = 1 AND site_id = ?))
       LIMIT 1
       FOR UPDATE`,
      [typeId, siteId]
    );
    const product = productRows[0] as {
      id: string;
      type_id: string;
      api_provider_id: string | null;
    } | undefined;
    if (!product) {
      throw new Error("Product was not found.");
    }
    if (product.api_provider_id && inputs.length > 0) {
      throw new Error("API provider products do not support purchase bundle options.");
    }

    const quantities = new Set<number>();
    for (const option of inputs) {
      if (quantities.has(option.quantity)) {
        throw new Error("Each purchase option must have a unique quantity.");
      }
      quantities.add(option.quantity);
    }

    const [existingRows] = await connection.execute<PurchaseOptionRow[]>(
      `SELECT id
       FROM product_purchase_options
       WHERE site_id = ? AND product_id = ?
       FOR UPDATE`,
      [siteId, product.id]
    );
    const existingIds = new Set(existingRows.map((row) => row.id));

    await connection.execute(
      `UPDATE product_purchase_options
       SET is_active = 0, updated_at = ?
       WHERE site_id = ? AND product_id = ?`,
      [new Date(), siteId, product.id]
    );

    for (const [index, option] of inputs.entries()) {
      const id = option.id || randomUUID();
      if (option.id && !existingIds.has(option.id)) {
        throw new Error("Purchase option does not belong to this product.");
      }

      await connection.execute(
        `INSERT INTO product_purchase_options (
           id, site_id, product_id, product_type_id, name, quantity,
           price, price_vip, price_walkin, display_order, is_active,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name), quantity = VALUES(quantity),
           price = VALUES(price), price_vip = VALUES(price_vip),
           price_walkin = VALUES(price_walkin), display_order = VALUES(display_order),
           is_active = VALUES(is_active), updated_at = VALUES(updated_at)`,
        [
          id,
          siteId,
          product.id,
          product.type_id,
          option.name.trim(),
          option.quantity,
          option.price,
          option.priceVip ?? null,
          option.priceWalkin ?? null,
          option.displayOrder ?? index,
          option.isActive === false ? 0 : 1,
          new Date(),
          new Date(),
        ]
      );
    }

    await connection.commit();
    return listPurchaseOptionsForAdmin(typeId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deletePurchaseOptionForProduct(
  typeId: string,
  optionId: string,
): Promise<PurchaseOption | null> {
  const siteId = assertMainSite();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [productRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id
       FROM products
       WHERE type_id = ?
         AND (is_local = 0 OR site_id = ?)
       LIMIT 1
       FOR UPDATE`,
      [typeId, siteId]
    );
    const product = productRows[0] as { id: string } | undefined;
    if (!product) {
      throw new Error("Product was not found.");
    }

    const [optionRows] = await connection.execute<PurchaseOptionRow[]>(
      `SELECT *
       FROM product_purchase_options
       WHERE id = ? AND site_id = ? AND product_id = ?
       LIMIT 1
       FOR UPDATE`,
      [optionId, siteId, product.id]
    );
    const option = optionRows[0];
    if (!option) {
      await connection.rollback();
      return null;
    }

    await connection.execute(
      `DELETE FROM product_purchase_options
       WHERE id = ? AND site_id = ? AND product_id = ?`,
      [optionId, siteId, product.id]
    );
    await connection.commit();
    return toPurchaseOption(option);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function lockPurchaseOptionForProduct(
  connection: PoolConnection,
  input: { typeId: string; optionId: string; siteId: string }
): Promise<PurchaseOptionRow | null> {
  const [rows] = await connection.execute<PurchaseOptionRow[]>(
    `SELECT ppo.*
     FROM product_purchase_options ppo
     INNER JOIN products p ON p.id = ppo.product_id
     WHERE ppo.id = ?
       AND ppo.product_type_id = ?
       AND ppo.site_id = ?
       AND p.type_id = ppo.product_type_id
       AND ppo.is_active = 1
       AND (p.is_local = 0 OR (p.is_local = 1 AND p.site_id = ?))
     LIMIT 1
     FOR UPDATE`,
    [input.optionId, input.typeId, input.siteId, input.siteId]
  );
  return rows[0] ?? null;
}

export function purchaseOptionRowToPublic(row: PurchaseOptionRow): PurchaseOption {
  return toPurchaseOption(row);
}
