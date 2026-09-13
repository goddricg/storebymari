const mysql = require('mysql2/promise');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

function parseEnv() {
  const envPath = path.join(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.substring(1, value.length - 1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.substring(1, value.length - 1);
        }
        process.env[key] = value;
      }
    }
  }
}

parseEnv();

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
      `SELECT id, name, stock, is_published, account_data FROM products WHERE ${likeClauses}`,
      queryParams
    );

    console.log(`Found ${rows.length} products matching the keywords.\n`);

    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
    const db = admin.firestore();

    const results = [];

    for (const row of rows) {
      let mysqlAccs = [];
      try {
        mysqlAccs = JSON.parse(row.account_data || '[]');
      } catch (e) {}

      const doc = await db.collection('products').doc(row.id).get();
      let firestoreData = null;
      if (doc.exists) {
        firestoreData = doc.data();
      }

      results.push({
        id: row.id,
        name: row.name,
        mysql_published: row.is_published,
        mysql_stock_field: row.stock,
        mysql_acc_length: mysqlAccs.length,
        firestore_exists: doc.exists,
        firestore_stock_field: firestoreData ? firestoreData.stock : 'N/A',
        firestore_acc_length: firestoreData && firestoreData.account_data ? firestoreData.account_data.length : 'N/A',
        firestore_published: firestoreData ? firestoreData.is_published : 'N/A'
      });
    }

    console.table(results);

  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

main();
