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
    const [rows] = await connection.execute(
      `SELECT id, type_id, name, stock, account_data, is_published, is_local, site_id FROM products`
    );

    console.log(`Total products in MySQL: ${rows.length}\n`);

    const mismatches = [];

    for (const p of rows) {
      let accCount = 0;
      if (p.account_data) {
        try {
          const parsed = JSON.parse(p.account_data);
          if (Array.isArray(parsed)) {
            accCount = parsed.length;
          }
        } catch (e) {}
      }

      let fsData = null;
      if (db) {
        try {
          const doc = await db.collection('products').doc(p.id).get();
          if (doc.exists) {
            fsData = doc.data();
          }
        } catch (e) {}
      }

      const mysqlStock = p.stock !== null && p.stock !== undefined ? Number(p.stock) : null;
      const fsStock = fsData ? fsData.stock : undefined;
      const fsAccountDataLength = fsData && fsData.account_data && Array.isArray(fsData.account_data) ? fsData.account_data.length : (fsData && fsData.account_data ? 'not_array' : undefined);

      // Check if stock field != account_data length, OR MySQL stock != Firestore stock
      const hasStockAccMismatch = (accCount > 0 && mysqlStock !== accCount);
      const hasFsMismatch = fsData && (fsStock !== mysqlStock || (fsAccountDataLength !== undefined && fsAccountDataLength !== accCount));

      if (hasStockAccMismatch || hasFsMismatch || p.name.includes('Netflix') || p.name.includes('Capcut') || p.name.includes('WeTv') || p.name.includes('Viu') || p.name.includes('Bilibili') || p.name.includes('HBO') || p.name.includes('Chatgpt')) {
        mismatches.push({
          typeId: p.type_id,
          name: p.name,
          mysqlStock,
          accCount,
          fsStock,
          fsAccLength: fsAccountDataLength,
          isPublished: p.is_published,
          isLocal: p.is_local,
          hasStockAccMismatch,
          hasFsMismatch
        });
      }
    }

    console.log("=== Discrepancies & Target Products Summary ===");
    console.table(mismatches.slice(0, 40));

  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

main();
