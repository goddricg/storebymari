const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306
  });

  try {
    const [rows] = await connection.execute(
      `SELECT id, type_id, name, stock, account_data FROM products WHERE account_data IS NOT NULL AND account_data != ''`
    );

    console.log(`Checking ${rows.length} products with account_data:`);
    const diffs = [];
    for (const p of rows) {
      let accLen = 0;
      try {
        const parsed = JSON.parse(p.account_data);
        if (Array.isArray(parsed)) accLen = parsed.length;
      } catch (e) {}

      const stockNum = p.stock !== null && p.stock !== undefined ? Number(p.stock) : null;
      if (stockNum !== accLen) {
        diffs.push({
          typeId: p.type_id,
          name: p.name,
          mysqlStockCol: stockNum,
          accountDataLength: accLen,
          difference: (stockNum ?? 0) - accLen
        });
      }
    }

    console.table(diffs);
  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

main();
