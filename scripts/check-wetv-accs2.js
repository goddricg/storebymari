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
      `SELECT account_data FROM products WHERE name = 'WeTv 30 Day ( หาร4 )'`
    );

    if (rows.length > 0) {
      console.log(rows[0].account_data);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

main();
