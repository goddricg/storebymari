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

const migrationFiles = [
  "27_add_appbymari_storefront.sql",
  "28_add_appbymari_product_image_overrides.sql",
];

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
    for (const migrationFile of migrationFiles) {
      const migrationPath = path.join(process.cwd(), "migrations", migrationFile);
      await connection.query(fs.readFileSync(migrationPath, "utf8"));
    }
    const [rows] = await connection.query(
      `SELECT COUNT(*) AS created_tables
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN ('appbymari_products', 'appbymari_purchase_requests')`,
    );
    const [columns] = await connection.query(
      `SELECT COUNT(*) AS image_override_columns
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'appbymari_products'
         AND COLUMN_NAME = 'image_override_url'`,
    );
    console.log("AppByMari storefront migration completed", rows[0], columns[0]);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("AppByMari storefront migration failed:", error.message);
  process.exitCode = 1;
});
