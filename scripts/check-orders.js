const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306
  });

  const [rows] = await connection.query("SELECT DISTINCT site_id FROM orders");
  console.log("Distinct site_ids in orders table:", rows);

  const [orderSample] = await connection.query("SELECT site_id, COUNT(*) as count, SUM(price) as total_price, SUM(profit) as total_profit FROM orders GROUP BY site_id");
  console.log("Order counts and prices by site_id:", orderSample);
  
  process.exit(0);
}

main().catch(console.error);
