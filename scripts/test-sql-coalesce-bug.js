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
      WHERE is_published = 1
    `);

    console.log("Checking products where old SQL COALESCE differs from p.stock:");
    const issues = [];
    for (const r of rows) {
      if (r.old_sql_stock !== r.stock && r.stock !== null) {
        issues.push({
          type_id: r.type_id,
          name: r.name,
          mysql_stock_col: r.stock,
          json_len: r.json_len,
          old_sql_eval: r.old_sql_stock,
          new_sql_eval: r.new_sql_stock
        });
      }
    }

    console.table(issues);
    console.log(`Total affected products: ${issues.length}`);

  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

main();
