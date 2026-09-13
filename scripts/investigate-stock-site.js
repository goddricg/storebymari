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
    const keywords = ['Bili Bili', 'Capcut', 'Chat GPT', 'HBO', 'Viu', 'Wetv', 'Bilibili', 'Chatgpt'];
    const likeClauses = keywords.map(() => `name LIKE ?`).join(' OR ');
    const queryParams = keywords.map(k => `%${k}%`);

    const [rows] = await connection.query(
      `SELECT id, name, type_id, stock, is_published, site_id FROM products WHERE ${likeClauses}`,
      queryParams
    );

    console.table(rows);

  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

main();
