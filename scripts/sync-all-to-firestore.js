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

  if (!db) {
    console.error("Firebase admin failed to initialize.");
    await connection.end();
    return;
  }

  try {
    const [rows] = await connection.execute(`SELECT * FROM products`);
    console.log(`Syncing ${rows.length} products to Firestore...`);

    let synced = 0;
    for (const product of rows) {
      let accData = [];
      if (product.account_data) {
        try {
          const parsed = JSON.parse(product.account_data);
          if (Array.isArray(parsed)) accData = parsed;
        } catch (e) {}
      }

      let stock = product.stock !== null && product.stock !== undefined ? Number(product.stock) : 0;

      const docRef = db.collection("products").doc(product.id);
      const payload = {
        id: product.id,
        type_id: product.type_id,
        name: product.name,
        image_url: product.image_url,
        details: product.details,
        stock: stock,
        type_menu: product.type_menu,
        is_published: product.is_published === 1 || product.is_published === true,
        badge: product.badge || null,
        category_id: product.category_id || null,
        account_email: product.account_email || null,
        account_password: product.account_password || null,
        account_data: accData,
        api_provider_id: product.api_provider_id || null,
        updated_at: new Date().toISOString(),
        price: product.price ? Number(product.price) : null,
        price_vip: product.price_vip ? Number(product.price_vip) : null,
        price_walkin: product.price_walkin ? Number(product.price_walkin) : null,
        price_main: product.price ? Number(product.price) : null,
        price_main_vip: product.price_vip ? Number(product.price_vip) : null,
        price_main_walkin: product.price_walkin ? Number(product.price_walkin) : null,
      };

      await docRef.set(payload, { merge: true });
      synced++;
    }

    console.log(`Successfully synced all ${synced} products to Firestore!`);

  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

main();
