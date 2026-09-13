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
    const typeId = 'WeTv 30 Day 4';
    console.log(`Fixing WeTv product (type_id: ${typeId})...`);
    
    await connection.execute(
      `UPDATE products SET account_data = '[]', stock = 0, updated_at = NOW() WHERE type_id = ?`,
      [typeId]
    );

    console.log("WeTv product updated in MySQL. Now syncing to Firestore...");
    
    // Fetch product to sync
    const [rows] = await connection.execute(`SELECT * FROM products WHERE type_id = ?`, [typeId]);
    if (rows.length > 0) {
      const row = rows[0];
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
      
      const payload = {
        stock: 0,
        account_data: [],
        updated_at: new Date().toISOString()
      };
      
      await db.collection('products').doc(row.id).set(payload, { merge: true });
      console.log("Firestore updated successfully!");
    }
  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

main();
