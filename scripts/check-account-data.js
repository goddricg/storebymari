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
    const productId = 'bb8a26e1-091e-4dca-a07f-3d3d0eaec761';
    
    // MySQL
    const [mysqlRows] = await connection.query(
      `SELECT id, name, stock, account_data FROM products WHERE id = ?`,
      [productId]
    );
    const mysqlRow = mysqlRows[0];
    let mysqlAccs = [];
    try {
      mysqlAccs = JSON.parse(mysqlRow.account_data || '[]');
    } catch(e) {}
    
    console.log("=== MySQL ===");
    console.log(`stock field: ${mysqlRow.stock}`);
    console.log(`account_data length: ${mysqlAccs.length}`);

    // Firestore
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
    const doc = await db.collection('products').doc(productId).get();
    if (doc.exists) {
      const data = doc.data();
      console.log("\n=== Firestore ===");
      console.log(`stock field: ${data.stock}`);
      console.log(`account_data length: ${data.account_data ? data.account_data.length : 0}`);
    } else {
      console.log("\nFirestore document not found!");
    }

  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

main();
