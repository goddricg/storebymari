const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.join(process.cwd(), ".env") });

const requiredEnv = ["DB_HOST", "DB_USER", "DB_NAME"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  throw new Error(`Missing database configuration: ${missingEnv.join(", ")}`);
}

const migrationPath = path.join(
  process.cwd(),
  "migrations",
  "18_add_purchase_cases_billing_receipts.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME,
    port: Number.parseInt(process.env.DB_PORT || "3306", 10),
    multipleStatements: true,
    timezone: "+07:00",
  });

  try {
    await connection.query(sql);
    const [rows] = await connection.query(
      `SELECT
         (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME IN ('purchase_cases', 'purchase_case_items',
                               'user_billing_profiles', 'receipt_counters',
                               'cash_receipts', 'cart_checkout_requests')) AS created_tables,
         (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'orders'
            AND COLUMN_NAME IN ('case_order_id', 'case_item_index')) AS case_order_columns`,
    );
    console.log("Purchase cases / billing / receipts migration completed", rows[0]);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Purchase cases / billing / receipts migration failed:", error.message);
  process.exitCode = 1;
});
