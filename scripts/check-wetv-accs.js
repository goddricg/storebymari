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
    const [rows] = await connection.query(
      `SELECT id, name, stock, account_data FROM products WHERE name = 'WeTv 30 Day ( หาร4 )'`
    );

    console.log("MySQL Data for WeTv:");
    if (rows.length > 0) {
      const p = rows[0];
      console.log(`ID: ${p.id}, Stock: ${p.stock}`);
      let accs = [];
      try { accs = JSON.parse(p.account_data || '[]'); } catch (e) {}
      console.log(`Accounts: ${accs.length}`);
      console.log("Account details:");
      accs.forEach((a, i) => console.log(`  [${i}] ${a.email}`));
    }
  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

main();
