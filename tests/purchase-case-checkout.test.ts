import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { createDB } from "mysql-memory-server";
import mysql, { type Pool } from "mysql2/promise";

type MySQLDB = Awaited<ReturnType<typeof createDB>>;
type CartModule = typeof import("../src/lib/cart/checkout");

let db: MySQLDB;
let testPool: Pool;
let cart: CartModule;

const schema = `
CREATE TABLE users (
  id VARCHAR(128) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NULL,
  display_name VARCHAR(255) NULL,
  is_admin TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  points DECIMAL(12,2) NOT NULL DEFAULT 0,
  role VARCHAR(50) NULL,
  is_banned TINYINT(1) NOT NULL DEFAULT 0,
  user_tier VARCHAR(50) NULL,
  tier_expires_at DATETIME(6) NULL,
  site_id VARCHAR(50) NOT NULL DEFAULT 'main',
  updated_at DATETIME(6) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE products (
  id VARCHAR(128) PRIMARY KEY,
  site_id VARCHAR(50) NOT NULL DEFAULT 'main',
  is_local TINYINT(1) NOT NULL DEFAULT 0,
  type_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NULL,
  image_url TEXT NULL,
  details TEXT NULL,
  price DECIMAL(12,2) NULL,
  price_vip DECIMAL(12,2) NULL,
  price_walkin DECIMAL(12,2) NULL,
  cost_price DECIMAL(12,2) NULL,
  stock INT NULL,
  type_menu VARCHAR(255) NULL,
  account_email VARCHAR(255) NULL,
  account_password VARCHAR(255) NULL,
  account_data LONGTEXT NULL,
  api_provider_id VARCHAR(128) NULL,
  is_published TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NULL,
  updated_at DATETIME(6) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE site_product_prices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site_id VARCHAR(50) NOT NULL,
  product_id VARCHAR(128) NOT NULL,
  retail_price DECIMAL(12,2) NULL,
  price_vip DECIMAL(12,2) NULL,
  price_walkin DECIMAL(12,2) NULL,
  UNIQUE KEY uq_site_product (site_id, product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE settings (
  id VARCHAR(36) PRIMARY KEY,
  \`key\` VARCHAR(255) NOT NULL,
  value TEXT NULL,
  site_id VARCHAR(50) NOT NULL,
  UNIQUE KEY uq_settings_site_key (site_id, \`key\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE orders (
  id VARCHAR(128) PRIMARY KEY,
  purchase_request_id VARCHAR(36) NULL,
  purchase_item_index INT NULL,
  product_type_id VARCHAR(255) NULL,
  product_name VARCHAR(255) NULL,
  product_image TEXT NULL,
  product_details TEXT NULL,
  price DECIMAL(12,2) NULL,
  type_menu VARCHAR(255) NULL,
  purchase_date DATETIME(6) NULL,
  username_buy VARCHAR(255) NULL,
  buyer_user_id VARCHAR(128) NULL,
  raw_response LONGTEXT NULL,
  created_at DATETIME(6) NULL,
  cost_price DECIMAL(12,2) NULL,
  profit DECIMAL(12,2) NULL,
  buyer_email VARCHAR(255) NULL,
  buyer_display_name VARCHAR(255) NULL,
  api_provider_id VARCHAR(128) NULL,
  account_email VARCHAR(255) NULL,
  account_password VARCHAR(255) NULL,
  site_id VARCHAR(50) NOT NULL DEFAULT 'main',
  is_local TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

async function scalar(query: string, params: unknown[] = []): Promise<number> {
  const [rows] = await testPool.query(query, params);
  return Number((rows as Array<Record<string, unknown>>)[0].value);
}

async function seed() {
  await testPool.execute(
    `INSERT INTO users (
       id, email, display_name, is_active, is_admin, role, is_banned,
       user_tier, points, site_id, updated_at
     ) VALUES ('buyer-a', 'buyer-a@example.test', 'Buyer A', 1, 0, 'user', 0,
       'normal', 500, 'main', NOW(6))`,
  );
  const accounts = [
    { email: "one@example.test", password: "one-pass", details: "screen 1" },
    { email: "two@example.test", password: "two-pass", details: "screen 2" },
    { email: "three@example.test", password: "three-pass", details: "screen 3" },
  ];
  await testPool.execute(
    `INSERT INTO products (
       id, site_id, is_local, type_id, name, details, price, price_vip,
       price_walkin, cost_price, stock, account_data, is_published,
       created_at, updated_at
     ) VALUES ('product-a', 'main', 1, 'sku-a', 'Netflix Premium', 'ไม่ลงรายละเอียดนี้ใน Receipt',
       100, 90, 100, 20, 3, ?, 1, NOW(6), NOW(6))`,
    [JSON.stringify(accounts)],
  );
  await testPool.execute(
    `INSERT INTO site_product_prices (site_id, product_id, retail_price, price_vip, price_walkin)
     VALUES ('main', 'product-a', 100, 90, 100)`,
  );
}

async function checkout(key: string) {
  const payload = { lines: [{ typeId: "sku-a", quantity: 2 }] };
  const normalized = cart.normalizeCartPayload(payload);
  const requestFingerprint = cart.createCartCheckoutFingerprint(normalized);
  const claim = await cart.claimCartCheckout({
    siteId: "main",
    buyerUserId: "buyer-a",
    idempotencyKey: key,
    requestFingerprint,
  });
  assert.equal(claim.kind, "claimed");
  if (claim.kind !== "claimed") throw new Error("Expected a new checkout claim");
  return cart.executeCartCheckout({
    requestId: claim.requestId,
    processingToken: claim.processingToken,
    siteId: "main",
    buyerUserId: "buyer-a",
    payload: normalized,
  });
}

before(async () => {
  db = await createDB({
    version: "8.4.x",
    dbName: "purchase_case_checkout_test",
    downloadBinaryOnce: true,
    xEnabled: "OFF",
  });
  process.env.DB_HOST = "127.0.0.1";
  process.env.DB_USER = db.username;
  process.env.DB_PASSWORD = "";
  process.env.DB_NAME = db.dbName;
  process.env.DB_PORT = String(db.port);
  process.env.NEXT_PUBLIC_SITE_ID = "main";

  testPool = mysql.createPool({
    host: "127.0.0.1",
    user: db.username,
    password: "",
    database: db.dbName,
    port: db.port,
    connectionLimit: 20,
    multipleStatements: true,
  });
  for (const statement of schema.split(";").map((item) => item.trim()).filter(Boolean)) {
    await testPool.query(statement);
  }
  await testPool.query(
    fs.readFileSync(path.join(process.cwd(), "migrations", "18_add_purchase_cases_billing_receipts.sql"), "utf8"),
  );
  cart = await import("../src/lib/cart/checkout");
});

beforeEach(async () => {
  for (const table of [
    "cart_checkout_requests",
    "cash_receipts",
    "purchase_case_items",
    "purchase_cases",
    "orders",
    "site_product_prices",
    "products",
    "users",
  ]) {
    await testPool.query(`DELETE FROM ${table}`);
  }
});

after(async () => {
  const appPool = (await import("../src/lib/mysql")).default;
  await appPool.end();
  await testPool.end();
  await db.stop();
});

test("cart checkout creates one Case Order, deducts points once, and issues a receipt", async () => {
  await seed();
  const result = await checkout("cart-checkout-1");

  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.ok, true);
  if (!result.body.ok) throw new Error("Expected checkout success");
  assert.equal(result.body.quantity, 2);
  assert.equal(result.body.caseOrder.status, "COMPLETED");
  assert.match(result.body.caseOrder.receipt?.receiptNo ?? "", /^RECP-\d{4}-\d{2}-\d{3}$/);
  assert.equal(result.body.caseOrder.items.length, 1);
  assert.equal(result.body.caseOrder.items[0].quantity, 2);
  assert.equal(result.body.caseOrder.items[0].unitPrice, 100);
  assert.equal(result.body.caseOrder.items[0].amount, 200);
  assert.equal(result.body.caseOrder.receipt?.lines[0].productName, "Netflix Premium");
  assert.equal(result.body.caseOrder.receipt?.lines[0].quantity, 2);

  assert.equal(await scalar("SELECT COUNT(*) AS value FROM orders"), 2);
  assert.equal(await scalar("SELECT points AS value FROM users WHERE id = 'buyer-a'"), 300);
  assert.equal(await scalar("SELECT stock AS value FROM products WHERE id = 'product-a'"), 1);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM cash_receipts"), 1);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM cart_checkout_requests WHERE status = 'SUCCEEDED'"), 1);
});

test("same cart idempotency key replays the saved result without another delivery", async () => {
  await seed();
  const first = await checkout("cart-checkout-replay");
  assert.equal(first.status, 200, JSON.stringify(first.body));

  const payload = { lines: [{ typeId: "sku-a", quantity: 2 }] };
  const fingerprint = cart.createCartCheckoutFingerprint(payload);
  const claim = await cart.claimCartCheckout({
    siteId: "main",
    buyerUserId: "buyer-a",
    idempotencyKey: "cart-checkout-replay",
    requestFingerprint: fingerprint,
  });
  assert.equal(claim.kind, "existing");
  if (claim.kind !== "existing" || claim.decision.kind !== "replay") {
    throw new Error("Expected a replay decision");
  }
  assert.equal(claim.decision.result.replayed, true);
  assert.equal(claim.decision.result.status, 200);
  assert.deepEqual(claim.decision.result.body, first.body);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM orders"), 2);
  assert.equal(await scalar("SELECT points AS value FROM users WHERE id = 'buyer-a'"), 300);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM cash_receipts"), 1);
});
