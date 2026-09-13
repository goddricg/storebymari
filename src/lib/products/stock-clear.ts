import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import pool from "@/lib/mysql";
import { safeParseJson } from "@/lib/products/account-parser";
import { findProductByTypeId, syncProductToFirestore } from "@/lib/products/repository";

export type StockClearInput = {
  productId: string;
  typeId?: string;
  siteId: string;
};

export type StockClearResponse = {
  success: true;
  operation: "clear-stock";
  productId: string;
  typeId: string;
  productName: string;
  clearedAccountCount: number;
  clearedStaticAccount: boolean;
  previousStock: number;
  remainingStock: 0;
};

export class StockClearError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "StockClearError";
  }
}

function numericStock(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

async function rollback(connection: PoolConnection | null, open: boolean): Promise<void> {
  if (connection && open) await connection.rollback().catch(() => undefined);
}

export async function clearProductStock(
  input: StockClearInput,
): Promise<StockClearResponse> {
  const productId = input.productId.trim();
  const siteId = input.siteId.trim();

  if (!productId || !siteId) {
    throw new StockClearError(422, "INVALID_PRODUCT", "Product data is not valid");
  }

  let connection: PoolConnection | null = null;
  let transactionOpen = false;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionOpen = true;

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT id, type_id, name, stock, account_data, api_provider_id,
              account_email, account_password
       FROM products
       WHERE id = ?
         AND (is_local = 0 OR (is_local = 1 AND site_id = ?))
       LIMIT 1
       FOR UPDATE`,
      [productId, siteId],
    );
    const product = rows[0] as RowDataPacket | undefined;
    if (!product) {
      throw new StockClearError(404, "PRODUCT_NOT_FOUND", "Selected product was not found");
    }
    if (input.typeId && input.typeId !== String(product.type_id)) {
      throw new StockClearError(409, "PRODUCT_CHANGED", "The selected product has changed; reload it and try again");
    }

    const accounts = safeParseJson<unknown[]>(product.account_data);
    const clearedAccountCount = Array.isArray(accounts) ? accounts.length : 0;
    const previousStock = clearedAccountCount > 0
      ? clearedAccountCount
      : numericStock(product.stock);
    const clearedStaticAccount = Boolean(product.account_email || product.account_password);
    const now = new Date();

    await connection.execute<ResultSetHeader>(
      `UPDATE products
       SET account_data = ?, stock = 0, account_email = NULL,
           account_password = NULL, updated_at = ?
       WHERE id = ?
         AND (is_local = 0 OR (is_local = 1 AND site_id = ?))`,
      [JSON.stringify([]), now, productId, siteId],
    );

    await connection.commit();
    transactionOpen = false;

    try {
      const refreshedProduct = await findProductByTypeId(String(product.type_id));
      if (refreshedProduct) await syncProductToFirestore(refreshedProduct);
    } catch (error) {
      const syncError = error as { code?: string; errno?: number; sqlState?: string };
      console.error("[stock-clear] post-commit projection failed", {
        code: syncError.code,
        errno: syncError.errno,
        sqlState: syncError.sqlState,
      });
    }

    return {
      success: true,
      operation: "clear-stock",
      productId,
      typeId: String(product.type_id),
      productName: String(product.name ?? ""),
      clearedAccountCount,
      clearedStaticAccount,
      previousStock,
      remainingStock: 0,
    };
  } catch (error) {
    await rollback(connection, transactionOpen);
    if (!(error instanceof StockClearError)) {
      const dbError = error as { code?: string; errno?: number; sqlState?: string };
      console.error("[stock-clear] database operation failed", {
        code: dbError.code,
        errno: dbError.errno,
        sqlState: dbError.sqlState,
      });
    }
    if (error instanceof StockClearError) throw error;
    throw new StockClearError(500, "STOCK_CLEAR_FAILED", "Unable to clear Stock; please try again");
  } finally {
    connection?.release();
  }
}
