import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { createDB } from "mysql-memory-server";
import mysql, { type Pool } from "mysql2/promise";
import type { PublicUser } from "../src/lib/auth/user";
import type { StorefrontBundlePayload } from "../src/lib/purchases/storefront-bundle";

type MySQLDB = Awaited<ReturnType<typeof createDB>>;
type BundleModule = typeof import("../src/lib/purchases/storefront-bundle");
type OptionsModule = typeof import("../src/lib/purchase-options/repository");

let db: MySQLDB;
let testPool: Pool;
let bundle: BundleModule;
let optionsRepository: OptionsModule;

const schema = `
CREATE TABLE users (
  id VARCHAR(128) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_admin TINYINT(1) NOT NULL DEFAULT 0,
  role VARCHAR(50) NULL,
  user_tier VARCHAR(50) NULL,
  tier_expires_at DATETIME(6) NULL,
  is_banned TINYINT(1) NOT NULL DEFAULT 0,
  points DECIMAL(10,2) NOT NULL DEFAULT 0,
  site_id VARCHAR(50) NOT NULL DEFAULT 'main',
  updated_at DATETIME(6) NULL
) ENGINE=InnoDB;

CREATE TABLE products (
  id VARCHAR(128) PRIMARY KEY,
  site_id VARCHAR(50) NOT NULL DEFAULT 'main',
  is_local TINYINT(1) NOT NULL DEFAULT 0,
  type_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NULL,
  image_url TEXT NULL,
  details TEXT NULL,
  price DECIMAL(10,2) NULL,
  price_vip DECIMAL(10,2) NULL,
  price_walkin DECIMAL(10,2) NULL,
  cost_price DECIMAL(10,2) NULL,
  stock INT NULL,
  type_menu VARCHAR(255) NULL,
  account_email VARCHAR(255) NULL,
  account_password VARCHAR(255) NULL,
  account_data JSON NULL,
  api_provider_id VARCHAR(128) NULL,
  is_published TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NULL,
  updated_at DATETIME(6) NULL,
  INDEX idx_products_type_id (type_id)
) ENGINE=InnoDB;

CREATE TABLE site_product_prices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site_id VARCHAR(50) NOT NULL,
  product_id VARCHAR(128) NOT NULL,
  retail_price DECIMAL(10,2) NULL,
  UNIQUE KEY uq_site_product (site_id, product_id)
) ENGINE=InnoDB;

CREATE TABLE product_purchase_options (
  id VARCHAR(128) NOT NULL,
  site_id VARCHAR(50) NOT NULL DEFAULT 'main',
  product_id VARCHAR(128) NOT NULL,
  product_type_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  price_vip DECIMAL(10,2) NULL,
  price_walkin DECIMAL(10,2) NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_product_option_quantity (site_id, product_id, quantity),
  CONSTRAINT chk_product_option_quantity CHECK (quantity BETWEEN 2 AND 100),
  CONSTRAINT chk_product_option_price CHECK (price >= 0)
) ENGINE=InnoDB;

CREATE TABLE storefront_purchase_requests (
  id VARCHAR(36) NOT NULL,
  site_id VARCHAR(50) NOT NULL,
  buyer_user_id VARCHAR(128) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  product_id VARCHAR(128) NOT NULL,
  product_type_id VARCHAR(255) NOT NULL,
  purchase_option_id VARCHAR(128) NOT NULL,
  quantity INT NOT NULL,
  status VARCHAR(20) NOT NULL,
  processing_token VARCHAR(36) NOT NULL,
  lease_expires_at DATETIME(6) NULL,
  order_id VARCHAR(128) NULL,
  response_status INT NULL,
  saved_response LONGTEXT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_storefront_request_key (site_id, buyer_user_id, idempotency_key),
  CONSTRAINT chk_storefront_request_status CHECK (status IN ('PROCESSING', 'SUCCEEDED', 'FAILED'))
) ENGINE=InnoDB;

CREATE TABLE orders (
  id VARCHAR(128) PRIMARY KEY,
  purchase_request_id VARCHAR(36) NULL,
  purchase_item_index INT NULL,
  purchase_option_id VARCHAR(128) NULL,
  purchase_option_name VARCHAR(255) NULL,
  purchase_option_quantity INT NULL,
  external_uid VARCHAR(255) NULL,
  product_type_id VARCHAR(255) NULL,
  product_name VARCHAR(255) NULL,
  product_image TEXT NULL,
  product_details TEXT NULL,
  price DECIMAL(10,2) DEFAULT 0,
  type_menu VARCHAR(255) NULL,
  purchase_date DATETIME(6) NULL,
  username_buy VARCHAR(255) NULL,
  buyer_user_id VARCHAR(128) NULL,
  raw_response JSON NULL,
  created_at DATETIME(6) NULL,
  cost_price DECIMAL(10,2) DEFAULT 0,
  profit DECIMAL(10,2) DEFAULT 0,
  buyer_email VARCHAR(255) NULL,
  buyer_display_name VARCHAR(255) NULL,
  api_provider_id VARCHAR(128) NULL,
  account_email VARCHAR(255) NULL,
  account_password VARCHAR(255) NULL,
  site_id VARCHAR(50) NOT NULL DEFAULT 'main',
  is_local TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_purchase_item (purchase_request_id, purchase_item_index)
) ENGINE=InnoDB;
`;

function publicUser(id: string, points: number): PublicUser {
  return {
    id,
    email: `${id}@example.test`,
    displayName: id,
    role: "user",
    isAdmin: false,
    isActive: true,
    points,
    tier: "normal",
    tierExpiresAt: null,
    isBanned: false,
    createdAt: new Date().toISOString(),
  };
}

async function scalar(query: string, params: unknown[] = []): Promise<number> {
  const [rows] = await testPool.query(query, params);
  return Number((rows as Array<Record<string, unknown>>)[0].value);
}

async function seedProduct(accountCount: number, points = 1000) {
  await testPool.execute(
    `INSERT INTO users (
       id, email, display_name, is_active, is_admin, role, user_tier, points, site_id, updated_at
     ) VALUES ('buyer-a', 'buyer-a@example.test', 'Buyer A', 1, 0, 'user', 'normal', ?, 'main', NOW(6))`,
    [points]
  );

  const accounts = Array.from({ length: accountCount }, (_, index) => ({
    email: `account-${index + 1}@example.test`,
    password: `password-${index + 1}`,
    details: `delivery-${index + 1}`,
  }));
  await testPool.execute(
    `INSERT INTO products (
       id, site_id, is_local, type_id, name, price, price_vip, price_walkin,
       cost_price, stock, account_data, is_published, created_at, updated_at
     ) VALUES ('product-a', 'main', 0, 'sku-a', 'Bundle Product', 50, 45, 50, 3, ?, ?, 1, NOW(6), NOW(6))`,
    [accountCount, JSON.stringify(accounts)]
  );

  const now = new Date();
  await testPool.execute(
    `INSERT INTO product_purchase_options (
       id, site_id, product_id, product_type_id, name, quantity, price,
       price_vip, price_walkin, display_order, is_active, created_at, updated_at
     ) VALUES
       ('option-3', 'main', 'product-a', 'sku-a', 'Buy 3 accounts', 3, 135, 120, 135, 0, 1, ?, ?),
       ('option-5', 'main', 'product-a', 'sku-a', 'Buy 5 accounts', 5, 220, 195, 220, 1, 1, ?, ?)`,
    [now, now, now, now]
  );
}

async function submit(
  key: string,
  optionId: string,
  quantity: number,
  userId = "buyer-a"
) {
  const payload: StorefrontBundlePayload = {
    typeId: "sku-a",
    purchaseOptionId: optionId,
    quantity,
  };
  const fingerprint = bundle.createStorefrontBundleFingerprint(payload);
  const claim = await bundle.claimStorefrontBundlePurchase({
    siteId: "main",
    buyerUserId: userId,
    idempotencyKey: key,
    requestFingerprint: fingerprint,
    payload,
  });

  if (claim.kind === "existing") {
    if (claim.decision.kind === "conflict") {
      return {
        status: 409,
        body: { ok: false, message: "conflict" },
      } as const;
    }
    if (claim.decision.kind === "replay") {
      return { status: claim.decision.status, body: claim.decision.body, replayed: true };
    }
    return bundle.waitForStorefrontBundlePurchase({
      siteId: "main",
      buyerUserId: userId,
      idempotencyKey: key,
      requestFingerprint: fingerprint,
    });
  }

  return bundle.executeStorefrontBundlePurchase({
    requestId: claim.requestId,
    processingToken: claim.processingToken,
    user: publicUser(userId, 1000),
    payload,
  });
}

before(async () => {
  db = await createDB({
    version: "8.4.x",
    dbName: "storefront_bundle_test",
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
    connectionLimit: 30,
  });

  for (const statement of schema.split(";").map((item) => item.trim()).filter(Boolean)) {
    await testPool.query(statement);
  }

  bundle = await import("../src/lib/purchases/storefront-bundle");
  optionsRepository = await import("../src/lib/purchase-options/repository");
});

beforeEach(async () => {
  for (const table of [
    "orders",
    "storefront_purchase_requests",
    "product_purchase_options",
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

test("20 identical bundle retries create one delivery and replay one response", async () => {
  await seedProduct(5);

  const results = await Promise.all(
    Array.from({ length: 20 }, () => submit("same-bundle-key", "option-3", 3))
  );
  assert.ok(results.every((result) => result.status === 200));
  const firstBody = JSON.stringify(results[0].body);
  assert.ok(results.every((result) => JSON.stringify(result.body) === firstBody));
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM orders"), 3);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM storefront_purchase_requests WHERE status = 'SUCCEEDED'"), 1);
  assert.equal(await scalar("SELECT points AS value FROM users WHERE id = 'buyer-a'"), 865);
  assert.equal(await scalar("SELECT stock AS value FROM products WHERE id = 'product-a'"), 2);
  assert.equal(await scalar("SELECT JSON_LENGTH(account_data) AS value FROM products WHERE id = 'product-a'"), 2);

  const replay = await submit("same-bundle-key", "option-3", 3);
  assert.equal(replay.status, 200);
  assert.equal("replayed" in replay && replay.replayed, true);
  assert.equal(JSON.stringify(replay.body), firstBody);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM orders"), 3);
});

test("same idempotency key with a different bundle payload returns conflict", async () => {
  await seedProduct(10);
  const first = await submit("payload-key", "option-3", 3);
  assert.equal(first.status, 200);

  const conflict = await submit("payload-key", "option-5", 5);
  assert.equal(conflict.status, 409);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM orders"), 3);
  assert.equal(await scalar("SELECT points AS value FROM users WHERE id = 'buyer-a'"), 865);
});

test("two different keys cannot consume the same three accounts", async () => {
  await seedProduct(3);
  const results = await Promise.all([
    submit("race-key-a", "option-3", 3),
    submit("race-key-b", "option-3", 3),
  ]);
  assert.equal(results.filter((result) => result.status === 200).length, 1);
  assert.equal(results.filter((result) => result.status === 400).length, 1);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM orders"), 3);
  assert.equal(await scalar("SELECT stock AS value FROM products WHERE id = 'product-a'"), 0);
  assert.equal(await scalar("SELECT JSON_LENGTH(account_data) AS value FROM products WHERE id = 'product-a'"), 0);
  assert.equal(await scalar("SELECT points AS value FROM users WHERE id = 'buyer-a'"), 865);
});

test("the same key is isolated by buyer identity", async () => {
  await seedProduct(6);
  await testPool.execute(
    `INSERT INTO users (
       id, email, display_name, is_active, is_admin, role, user_tier, points, site_id, updated_at
     ) VALUES ('buyer-b', 'buyer-b@example.test', 'Buyer B', 1, 0, 'user', 'normal', 1000, 'main', NOW(6))`
  );

  const results = await Promise.all([
    submit("shared-key", "option-3", 3, "buyer-a"),
    submit("shared-key", "option-3", 3, "buyer-b"),
  ]);
  assert.ok(results.every((result) => result.status === 200));
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM orders"), 6);
  assert.equal(await scalar("SELECT points AS value FROM users WHERE id = 'buyer-a'"), 865);
  assert.equal(await scalar("SELECT points AS value FROM users WHERE id = 'buyer-b'"), 865);
});

test("options are scoped to one product and the admin replacement is additive", async () => {
  await seedProduct(5);
  const visible = await optionsRepository.listPurchaseOptionsByTypeId("sku-a");
  assert.deepEqual(visible.map((option) => option.quantity), [3, 5]);
  assert.equal(visible[0].availableStock, 5);
  assert.equal(visible[0].canBuy, true);

  await optionsRepository.replacePurchaseOptionsForProduct("sku-a", [
    {
      id: "option-3",
      name: "Buy 3 accounts updated",
      quantity: 3,
      price: 135,
      priceVip: 120,
      priceWalkin: 135,
      displayOrder: 0,
      isActive: true,
    },
  ]);
  const adminOptions = await optionsRepository.listPurchaseOptionsForAdmin("sku-a");
  assert.equal(adminOptions.length, 2);
  assert.equal(adminOptions.find((option) => option.id === "option-5")?.isActive, false);
  assert.equal(adminOptions.find((option) => option.id === "option-3")?.name, "Buy 3 accounts updated");

  const deleted = await optionsRepository.deletePurchaseOptionForProduct("sku-a", "option-5");
  assert.equal(deleted?.id, "option-5");
  assert.equal((await optionsRepository.listPurchaseOptionsForAdmin("sku-a")).some((option) => option.id === "option-5"), false);
});
