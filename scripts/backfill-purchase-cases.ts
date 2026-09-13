import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const fromInput = process.argv[2] || "2026-08-26T00:00:00+07:00";
const from = new Date(fromInput);
if (Number.isNaN(from.getTime())) {
  throw new Error("รูปแบบวันที่เริ่มต้นไม่ถูกต้อง ตัวอย่าง: 2026-08-26T00:00:00+07:00");
}

const siteId = process.argv[3] || process.env.NEXT_PUBLIC_SITE_ID || "main";
const rawLimit = Number(process.argv[4] || "10000");
const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.trunc(rawLimit) : 10000;

async function main() {
  const { backfillPurchaseCasesFromDate } = await import("../src/lib/purchase-cases/repository");
  const pool = (await import("../src/lib/mysql")).default;

  try {
    const result = await backfillPurchaseCasesFromDate({ siteId, from, limit });
    console.log(JSON.stringify({ siteId, from: from.toISOString(), limit, ...result }, null, 2));
    if (result.failed > 0) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
