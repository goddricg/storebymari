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
  "17_add_topup_bonus_rules.sql"
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
         (SELECT COUNT(*) FROM topup_bonus_rules) AS bonus_rule_rows,
         (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME IN ('topup_requests', 'slip_history')
            AND COLUMN_NAME IN ('bonus_rule_id', 'bonus_points', 'credited_points')) AS bonus_columns`
    );
    console.log("Top-up bonus migration completed", rows[0]);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Top-up bonus migration failed:", error.message);
  process.exitCode = 1;
});
