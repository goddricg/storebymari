const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306
  });

  const [columns] = await connection.query("SHOW COLUMNS FROM users");
  console.log("Users table columns:", columns.map(c => c.Field));
  
  process.exit(0);
}

main().catch(console.error);
