const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306
  });

  try {
    const [rows] = await connection.query(
      `SELECT id, email, role, is_admin, site_id FROM users 
       WHERE is_admin = 1 AND (role IS NULL OR role = '' OR role NOT IN ('admin', 'superadmin'))`
    );
    console.log("Users with is_admin = 1 and invalid/null role:", rows);

    const [rows2] = await connection.query(
      `SELECT id, email, role, is_admin, site_id FROM users 
       WHERE role = 'superadmin' AND email != 'maripwriter@gmail.com'`
    );
    console.log("Superadmins other than maripwriter:", rows2);

    const [rows3] = await connection.query(
      `SELECT id, email, role, is_admin, site_id FROM users 
       WHERE role = 'admin' AND is_admin = 0`
    );
    console.log("Admins with is_admin = 0:", rows3);
  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

main();
