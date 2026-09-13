const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

const mainEnvPath = path.join(process.cwd(), ".env.main");
const fallbackEnvPath = path.join(process.cwd(), ".env");
dotenv.config({ path: fs.existsSync(mainEnvPath) ? mainEnvPath : fallbackEnvPath });

const requiredEnv = ["DB_HOST", "DB_USER", "DB_NAME"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  throw new Error(`Missing database configuration: ${missingEnv.join(", ")}`);
}

const migrationPath = path.join(
  process.cwd(),
  "migrations",
  "21_add_support_case_notification_reads.sql",
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
         (SELECT COUNT(*)
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'support_case_notification_reads') AS table_count,
         (SELECT COUNT(*)
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'support_case_notification_reads'
            AND COLUMN_NAME IN ('site_id', 'support_case_id', 'admin_user_id', 'read_at', 'created_at')) AS column_count`,
    );

    const verification = rows[0];
    if (Number(verification?.table_count) !== 1 || Number(verification?.column_count) !== 5) {
      throw new Error("Support-case notification migration verification failed.");
    }

    console.log("Support-case notification migration completed", {
      table: "support_case_notification_reads",
      columns: 5,
    });
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Support-case notification migration failed:", error.message);
  process.exitCode = 1;
});
