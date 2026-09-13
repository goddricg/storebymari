const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306
  });

  await connection.query("UPDATE users SET display_name = 'Bxmmbx12' WHERE email = 'bamubw1210@gmail.com'");
  
  const [rows] = await connection.query("SELECT id, email, display_name, site_id, points, role, is_admin FROM users WHERE email = 'bamubw1210@gmail.com' OR email = 'rungwadee2547@gmail.com'");
  console.log(rows);
  
  process.exit(0);
}

main().catch(console.error);
