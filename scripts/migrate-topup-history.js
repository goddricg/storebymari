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
  "16_add_topup_history_metadata.sql"
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
         (SELECT COUNT(*) FROM topup_attempt_history) AS attempt_history_rows,
         (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'topup_requests'
            AND COLUMN_NAME = 'failure_reason') AS failure_reason_column,
         (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'slip_history'
            AND COLUMN_NAME IN ('source_type', 'source_user_id', 'source_label', 'source_email', 'note')) AS source_metadata_columns`
    );
    console.log("Top-up history migration completed", rows[0]);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Top-up history migration failed:", error.message);
  process.exitCode = 1;
});
