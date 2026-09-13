import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import pool from "@/lib/mysql";
import { safeParseJson } from "@/lib/products/account-parser";
import { findProductByTypeId, syncProductToFirestore } from "@/lib/products/repository";
import type { ProductAccount } from "@/lib/products/types";
import { StockAccountDeleteError } from "@/lib/products/stock-account-delete";

export type StockAccountBulkDeleteInput = {
  productId: string;
  typeId?: string;
  accounts: Array<{
    accountIndex: number;
    expectedAccount: ProductAccount;
  }>;
  siteId: string;
};

export type StockAccountBulkDeleteResponse = {
  success: true;
  operation: "delete-accounts";
  productId: string;
  typeId: string;
  productName: string;
  deletedAccountIndexes: number[];
  deletedCount: number;
  accountCount: number;
  previousStock: number;
  remainingStock: number;
};

type StoredAccount = Record<string, unknown>;

function normalize(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function accountValues(value: StoredAccount): ProductAccount {
  return {
    email: typeof value.email === "string" ? value.email : "",
    password: typeof value.password === "string" ? value.password : "",
    details: typeof value.details === "string" ? value.details : "",
  };
}

function sameAccount(left: ProductAccount, right: ProductAccount): boolean {
  return (
    normalize(left.email) === normalize(right.email) &&
    normalize(left.password) === normalize(right.password) &&
    normalize(left.details) === normalize(right.details)
  );
}

async function rollback(connection: PoolConnection | null, open: boolean): Promise<void> {
  if (connection && open) await connection.rollback().catch(() => undefined);
}

export async function deleteProductAccounts(
  input: StockAccountBulkDeleteInput,
): Promise<StockAccountBulkDeleteResponse> {
  const productId = input.productId.trim();
  const siteId = input.siteId.trim();
  const selections = input.accounts
    .map((selection) => ({
      accountIndex: selection.accountIndex,
      expectedAccount: {
        email: selection.expectedAccount.email || "",
        password: selection.expectedAccount.password || "",
        details: selection.expectedAccount.details || "",
      },
    }))
    .sort((left, right) => left.accountIndex - right.accountIndex);

  if (!productId || !siteId || selections.length === 0) {
    throw new StockAccountDeleteError(422, "INVALID_ACCOUNT_SELECTION", "Account data is not valid");
  }

  const uniqueIndexes = new Set<number>();
  for (const selection of selections) {
    if (!Number.isInteger(selection.accountIndex) || selection.accountIndex < 0 || uniqueIndexes.has(selection.accountIndex)) {
      throw new StockAccountDeleteError(422, "INVALID_ACCOUNT_SELECTION", "Account data is not valid");
    }
    uniqueIndexes.add(selection.accountIndex);
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
      throw new StockAccountDeleteError(404, "PRODUCT_NOT_FOUND", "Selected product was not found");
    }
    if (input.typeId && input.typeId !== String(product.type_id)) {
      throw new StockAccountDeleteError(409, "PRODUCT_CHANGED", "The selected product has changed; reload it and try again");
    }
    if (product.api_provider_id || product.account_email || product.account_password) {
      throw new StockAccountDeleteError(409, "PRODUCT_NOT_ACCOUNT_POOL", "Provider and static-account products cannot delete pool accounts");
    }

    const parsed = safeParseJson<unknown[]>(product.account_data);
    if (!Array.isArray(parsed)) {
      throw new StockAccountDeleteError(409, "ACCOUNT_DATA_INVALID", "Existing Account data must be checked before deleting");
    }

    const existingAccounts = parsed.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new StockAccountDeleteError(409, "ACCOUNT_DATA_INVALID", "Existing Account data must be checked before deleting");
      }
      return value as StoredAccount;
    });

    for (const selection of selections) {
      if (selection.accountIndex >= existingAccounts.length) {
        throw new StockAccountDeleteError(404, "ACCOUNT_NOT_FOUND", "The selected Account was not found; reload the list and try again");
      }
      if (!sameAccount(accountValues(existingAccounts[selection.accountIndex]), selection.expectedAccount)) {
        throw new StockAccountDeleteError(409, "ACCOUNT_CHANGED", "The Account list changed; reload it before deleting");
      }
    }

    const nextAccounts = existingAccounts.filter((_, index) => !uniqueIndexes.has(index));
    const previousStock = existingAccounts.length;
    const remainingStock = nextAccounts.length;
    const now = new Date();

    await connection.execute<ResultSetHeader>(
      `UPDATE products
       SET account_data = ?, stock = ?, updated_at = ?
       WHERE id = ?
         AND (is_local = 0 OR (is_local = 1 AND site_id = ?))`,
      [JSON.stringify(nextAccounts), remainingStock, now, productId, siteId],
    );
    await connection.commit();
    transactionOpen = false;

    try {
      const refreshedProduct = await findProductByTypeId(String(product.type_id));
      if (refreshedProduct) await syncProductToFirestore(refreshedProduct);
    } catch (error) {
      const syncError = error as { code?: string; errno?: number; sqlState?: string };
      console.error("[stock-account-bulk-delete] post-commit projection failed", {
        code: syncError.code,
        errno: syncError.errno,
        sqlState: syncError.sqlState,
      });
    }

    return {
      success: true,
      operation: "delete-accounts",
      productId,
      typeId: String(product.type_id),
      productName: String(product.name ?? ""),
      deletedAccountIndexes: selections.map((selection) => selection.accountIndex),
      deletedCount: selections.length,
      accountCount: remainingStock,
      previousStock,
      remainingStock,
    };
  } catch (error) {
    await rollback(connection, transactionOpen);
    if (!(error instanceof StockAccountDeleteError)) {
      const dbError = error as { code?: string; errno?: number; sqlState?: string };
      console.error("[stock-account-bulk-delete] database operation failed", {
        code: dbError.code,
        errno: dbError.errno,
        sqlState: dbError.sqlState,
      });
    }
    if (error instanceof StockAccountDeleteError) throw error;
    throw new StockAccountDeleteError(500, "STOCK_ACCOUNT_DELETE_FAILED", "Unable to delete the Accounts; please try again");
  } finally {
    connection?.release();
  }
}
