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
    const [rows] = await connection.execute(`
      SELECT 
        id, 
        type_id, 
        name, 
        stock, 
        account_data, 
        JSON_LENGTH(account_data) as json_len,
        COALESCE(JSON_LENGTH(account_data), stock, 0) as old_sql_stock,
        COALESCE(stock, JSON_LENGTH(account_data), 0) as new_sql_stock
      FROM products
      WHERE stock IS NULL OR stock != JSON_LENGTH(account_data) OR account_data IS NULL
    `);

    console.table(rows.slice(0, 30));
  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

main();
