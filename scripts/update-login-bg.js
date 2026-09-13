const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306
  });

  const key = 'login_bg_image';
  const value = '/images/login-bg.jpg';
  const siteId = 'main';
  const now = new Date();
  
  await connection.execute(
    `INSERT INTO settings (id, \`key\`, value, description, created_at, updated_at, site_id)
     VALUES (UUID(), ?, ?, 'Login Page Background Image', ?, ?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)`,
    [key, value, now, now, siteId]
  );
  
  console.log("Successfully updated login_bg_image in settings table.");
  
  await connection.end();
}

main().catch(console.error);
