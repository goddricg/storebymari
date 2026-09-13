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
    const [rows] = await connection.query(`SELECT id, name, account_data FROM products WHERE account_data IS NOT NULL`);
    let foundOnlyDetails = false;
    for (const row of rows) {
      if (!row.account_data || row.account_data === '[]') continue;
      let accs = [];
      try { accs = JSON.parse(row.account_data); } catch (e) { continue; }
      if (Array.isArray(accs)) {
        for (const a of accs) {
          if (!a.email && !a.password && a.details) {
            console.log(`Product "${row.name}" has account with only details.`);
            foundOnlyDetails = true;
            break;
          }
        }
      }
    }
    if (!foundOnlyDetails) console.log("No valid accounts with ONLY details found.");
  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

main();
