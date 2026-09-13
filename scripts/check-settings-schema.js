const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306
  });

  const [rows] = await connection.query("DESCRIBE settings");
  console.log("Settings columns:", rows);

  const [samples] = await connection.query("SELECT * FROM settings WHERE \`key\` = 'site_name'");
  console.log("site_name settings:", samples);
  
  process.exit(0);
}

main().catch(console.error);
