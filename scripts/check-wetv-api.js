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
      `SELECT id, name, type_id, stock, is_published, api_provider_id FROM products WHERE name LIKE '%Wetv%'`
    );

    console.table(rows);

  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

main();
