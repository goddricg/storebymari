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
    const migrationPath = path.join(
      process.cwd(),
      "migrations",
      "29_add_support_case_center_sync.sql",
    );
    await connection.query(fs.readFileSync(migrationPath, "utf8"));

    const [rows] = await connection.query(
      `SELECT COUNT(*) AS column_count
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'support_cases'
         AND COLUMN_NAME IN ('center_case_id', 'center_case_code', 'center_synced_at', 'center_sync_error')`,
    );
    if (Number(rows[0]?.column_count ?? 0) !== 4) {
      throw new Error("Support-case center migration verification failed.");
    }

    console.log("Support-case center migration completed", { columns: 4 });
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Support-case center migration failed:", error.message);
  process.exitCode = 1;
});
