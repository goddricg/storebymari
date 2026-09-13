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
    const email = 'Natthakxn2009@gmail.com'.toLowerCase();
    const [users] = await connection.query(
      `SELECT id, email, user_tier, points, site_id FROM users WHERE LOWER(email) = ?`,
      [email]
    );
    console.log(JSON.stringify(users, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

main();
