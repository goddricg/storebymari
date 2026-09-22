import type { RowDataPacket } from "mysql2/promise";
import pool from "@/lib/mysql";

let schemaReady: Promise<void> | null = null;

async function addColumnIfMissing(columnName: string, alterSql: string): Promise<void> {
  const [columns] = await pool.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'support_cases'
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [columnName],
  );

  if (columns.length > 0) return;

  try {
    await pool.query(alterSql);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
    const errno = error && typeof error === "object" && "errno" in error
      ? Number(error.errno)
      : 0;
    if (code !== "ER_DUP_FIELDNAME" && errno !== 1060) throw error;
  }
}

/**
 * Additive, idempotent schema bootstrap for the Store By Mari -> AppByMari
 * support bridge. Production may deploy before the Plesk migration runner has
 * access to the application database environment, so the first support read
 * or write safely prepares these nullable columns in-process.
 */
export function ensureSupportCenterSchema(): Promise<void> {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    await addColumnIfMissing(
      "center_case_id",
      `ALTER TABLE support_cases
         ADD COLUMN center_case_id VARCHAR(128) NULL AFTER shop_name`,
    );
    await addColumnIfMissing(
      "center_case_code",
      `ALTER TABLE support_cases
         ADD COLUMN center_case_code VARCHAR(100) NULL AFTER center_case_id`,
    );
    await addColumnIfMissing(
      "center_synced_at",
      `ALTER TABLE support_cases
         ADD COLUMN center_synced_at DATETIME(6) NULL AFTER center_case_code`,
    );
    await addColumnIfMissing(
      "center_sync_error",
      `ALTER TABLE support_cases
         ADD COLUMN center_sync_error TEXT NULL AFTER center_synced_at`,
    );
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });

  return schemaReady;
}
