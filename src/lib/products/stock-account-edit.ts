import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import pool from "@/lib/mysql";
import { safeParseJson } from "@/lib/products/account-parser";
import { findProductByTypeId, syncProductToFirestore } from "@/lib/products/repository";
import type { ProductAccount } from "@/lib/products/types";
import {
  getStockDeliveryIdentityIssue,
  getStockDeliveryIdentity,
  parseStockDeliveryType,
} from "@/lib/products/stock-delivery-type";

export type StockAccountEditInput = {
  productId: string;
  typeId?: string;
  accountIndex: number;
  account: {
    email: string;
    password: string;
    details?: string;
  };
  siteId: string;
};

export type StockAccountEditResponse = {
  success: true;
  operation: "edit-account";
  productId: string;
  typeId: string;
  productName: string;
  accountIndex: number;
  accountCount: number;
  previousStock: number;
  remainingStock: number;
};

type StoredAccount = Record<string, unknown>;

export class StockAccountEditError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "StockAccountEditError";
  }
}

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

function normalizeAccount(account: StockAccountEditInput["account"]): ProductAccount {
  return {
    email: normalizeText(account.email).trim(),
    password: normalizeText(account.password).trim(),
    details: normalizeText(account.details ?? "").trim(),
  };
}

function readAccount(value: unknown): StoredAccount {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new StockAccountEditError(
      409,
      "ACCOUNT_DATA_INVALID",
      "Existing Account data must be checked before editing",
    );
  }
  return { ...(value as StoredAccount) };
}

function accountKey(
  account: Partial<ProductAccount>,
  productName: string,
  stockDeliveryType: ReturnType<typeof parseStockDeliveryType>,
): string | null {
  return getStockDeliveryIdentity(
    {
      email: normalizeText(String(account.email ?? "")).trim(),
      password: normalizeText(String(account.password ?? "")).trim(),
      details: normalizeText(String(account.details ?? "")).trim(),
    },
    productName,
    stockDeliveryType,
  );
}

function accountValues(account: StoredAccount): ProductAccount {
  return {
    email: typeof account.email === "string" ? account.email : "",
    password: typeof account.password === "string" ? account.password : "",
    details: typeof account.details === "string" ? account.details : "",
  };
}

async function rollback(connection: PoolConnection | null, open: boolean): Promise<void> {
  if (connection && open) {
    await connection.rollback().catch(() => undefined);
  }
}

export async function updateProductAccount(
  input: StockAccountEditInput,
): Promise<StockAccountEditResponse> {
  const productId = input.productId.trim();
  const siteId = input.siteId.trim();
  if (!productId || !siteId || !Number.isInteger(input.accountIndex) || input.accountIndex < 0) {
    throw new StockAccountEditError(422, "INVALID_ACCOUNT_INDEX", "Account data is not valid");
  }

  const nextAccount = normalizeAccount(input.account);
  if (nextAccount.email.length > 255 || nextAccount.password.length > 255 || nextAccount.details.length > 2_000_000) {
    throw new StockAccountEditError(422, "ACCOUNT_DATA_TOO_LARGE", "Account data is too large");
  }

  let connection: PoolConnection | null = null;
  let transactionOpen = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionOpen = true;

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT id, type_id, name, stock, account_data, stock_delivery_type,
              api_provider_id, account_email, account_password
       FROM products
       WHERE id = ?
         AND (is_local = 0 OR (is_local = 1 AND site_id = ?))
       LIMIT 1
       FOR UPDATE`,
      [productId, siteId],
    );
    const product = rows[0] as RowDataPacket | undefined;
    if (!product) {
      throw new StockAccountEditError(404, "PRODUCT_NOT_FOUND", "Selected product was not found");
    }
    if (input.typeId && input.typeId !== String(product.type_id)) {
      throw new StockAccountEditError(409, "PRODUCT_CHANGED", "The selected product has changed; reload it and try again");
    }
    if (product.api_provider_id || product.account_email || product.account_password) {
      throw new StockAccountEditError(409, "PRODUCT_NOT_ACCOUNT_POOL", "Provider and static-account products cannot edit pool accounts");
    }

    const parsed = safeParseJson<unknown[]>(product.account_data);
    if (!Array.isArray(parsed)) {
      throw new StockAccountEditError(409, "ACCOUNT_DATA_INVALID", "Existing Account data must be checked before editing");
    }
    if (input.accountIndex >= parsed.length) {
      throw new StockAccountEditError(404, "ACCOUNT_NOT_FOUND", "The selected Account was not found; reload the list and try again");
    }

    const existingAccounts = parsed.map(readAccount);
    const productName = String(product.name ?? "");
    const stockDeliveryType = parseStockDeliveryType(product.stock_delivery_type);
    const identityIssue = getStockDeliveryIdentityIssue(
      nextAccount,
      productName,
      stockDeliveryType,
    );
    if (identityIssue) {
      throw new StockAccountEditError(
        422,
        "INVALID_ACCOUNT_IDENTITY",
        identityIssue,
      );
    }
    const duplicateKey = accountKey(nextAccount, productName, stockDeliveryType);
    const duplicateIndex = existingAccounts.findIndex(
      (account, index) =>
        index !== input.accountIndex &&
        duplicateKey !== null &&
        accountKey(accountValues(account), productName, stockDeliveryType) === duplicateKey,
    );
    if (duplicateIndex >= 0) {
      throw new StockAccountEditError(409, "DUPLICATE_ACCOUNT", "This Account already exists in the same product");
    }

    const nextAccounts = existingAccounts.map((account, index) =>
      index === input.accountIndex
        ? { ...account, ...nextAccount }
        : account,
    );
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

    // The database is authoritative; refresh the existing realtime projection after commit.
    try {
      const refreshedProduct = await findProductByTypeId(String(product.type_id));
      if (refreshedProduct) {
        await syncProductToFirestore(refreshedProduct);
      }
    } catch (error) {
      const syncError = error as { code?: string; errno?: number; sqlState?: string };
      console.error("[stock-account-edit] post-commit projection failed", {
        code: syncError.code,
        errno: syncError.errno,
        sqlState: syncError.sqlState,
      });
    }

    return {
      success: true,
      operation: "edit-account",
      productId,
      typeId: String(product.type_id),
      productName: String(product.name ?? ""),
      accountIndex: input.accountIndex,
      accountCount: remainingStock,
      previousStock,
      remainingStock,
    };
  } catch (error) {
    await rollback(connection, transactionOpen);
    if (!(error instanceof StockAccountEditError)) {
      const dbError = error as { code?: string; errno?: number; sqlState?: string };
      console.error("[stock-account-edit] database operation failed", {
        code: dbError.code,
        errno: dbError.errno,
        sqlState: dbError.sqlState,
      });
    }
    if (error instanceof StockAccountEditError) {
      throw error;
    }
    throw new StockAccountEditError(500, "STOCK_ACCOUNT_EDIT_FAILED", "Unable to edit the Account; please try again");
  } finally {
    connection?.release();
  }
}
