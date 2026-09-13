const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306
  });

  // Find all admins
  const [admins] = await connection.query("SELECT email, MAX(points) as max_points FROM users WHERE is_admin = 1 OR role IN ('admin', 'superadmin') GROUP BY email");
  
  for (const admin of admins) {
    console.log(`Syncing points for ${admin.email} to ${admin.max_points}`);
    await connection.query("UPDATE users SET points = ? WHERE email = ?", [admin.max_points, admin.email]);
  }
  
  console.log("Done syncing admin points.");
  process.exit(0);
}

main().catch(console.error);
