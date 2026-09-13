const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

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

async function main() {
  parseEnv();

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306
  });

  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : '',
  };

  if (!admin.apps.length && serviceAccount.projectId) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
  const db = admin.apps.length ? admin.firestore() : null;

  try {
    const [rows] = await connection.execute(`SELECT * FROM products WHERE is_published = 1`);
    
    let mismatches = [];

    for (const p of rows) {
      let accData = [];
      if (p.account_data) {
        try {
          const parsed = JSON.parse(p.account_data);
          if (Array.isArray(parsed)) accData = parsed;
        } catch (e) {}
      }

      let mysqlStock = p.stock !== null && p.stock !== undefined ? Number(p.stock) : 0;
      let mysqlEffectiveStock = mysqlStock; // Based on the JS code (stock takes precedence over accountData.length)

      let fsData = null;
      if (db) {
        const doc = await db.collection("products").doc(p.id).get();
        if (doc.exists) {
          fsData = doc.data();
        }
      }

      let fsStock = fsData ? fsData.stock : undefined;
      let fsAccDataLength = fsData && fsData.account_data ? fsData.account_data.length : 0;

      let fsEffectiveStock = fsStock;

      if (mysqlEffectiveStock !== fsEffectiveStock || accData.length !== fsAccDataLength) {
        mismatches.push({
          typeId: p.type_id,
          name: p.name,
          mysqlStock,
          mysqlAccLen: accData.length,
          fsStock,
          fsAccLen: fsAccDataLength
        });
      }
    }

    console.log(`Found ${mismatches.length} mismatches out of ${rows.length} published products.`);
    if (mismatches.length > 0) {
      console.table(mismatches);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

main();
