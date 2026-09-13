const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306
  });

  const [rows] = await connection.query(`
    SELECT site_id, buyer_email, COUNT(*) as count, SUM(price) as total_price 
    FROM orders 
    WHERE buyer_email IN ('bamubw1210@gmail.com', 'rungwadee2547@gmail.com') 
    GROUP BY site_id, buyer_email
  `);
  console.log("Admin orders:", rows);
  
  process.exit(0);
}

main().catch(console.error);
