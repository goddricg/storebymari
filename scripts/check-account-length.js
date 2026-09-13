import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const [rows] = await connection.execute('SELECT type_id, name, stock, JSON_LENGTH(account_data) as acc_len FROM products WHERE stock <= 0 AND JSON_LENGTH(account_data) > 0');
  console.log(rows);
  await connection.end();
}
check();
