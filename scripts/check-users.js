const mysql = require('mysql2/promise');
const fs = require('fs');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306
  });

  const [rows] = await connection.query("SELECT id, email, role, is_admin FROM users LIMIT 100");
  fs.writeFileSync('users_list.json', JSON.stringify(rows, null, 2));
  console.log("Queried", rows.length, "users.");
  
  process.exit(0);
}

main().catch(console.error);
