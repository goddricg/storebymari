const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306
  });

  const [rows] = await connection.query("SELECT id, email, role, is_admin, site_id FROM users WHERE is_admin = 1 OR role IN ('admin', 'superadmin', 'owner')");
  console.log("All Admins/SuperAdmins:", rows);
  
  process.exit(0);
}

main().catch(console.error);
