import dotenv from "dotenv";
import path from "node:path";

dotenv.config({
  path: path.join(process.cwd(), process.env.STATEMENT_ENV_FILE || ".env"),
});

const apply = process.argv.includes("--apply");

async function main() {
  const { backfillTopupCashReceiptsForAdmin } = await import("../src/lib/receipts/topup-repository");
  const pool = (await import("../src/lib/mysql")).default;

  try {
    const result = await backfillTopupCashReceiptsForAdmin({ apply });
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...result }, null, 2));
    if (apply && result.skippedRows > 0) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Top-up receipt backfill failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
