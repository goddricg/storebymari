import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { createDB } from "mysql-memory-server";
import mysql, { type Pool } from "mysql2/promise";

import {
  APPBYMARI_API_BASE_URL,
  APPBYMARI_PROVIDER_NAME,
  parseAppByMariStorefrontTypeId,
  toAppByMariStorefrontTypeId,
} from "../src/lib/appbymari/types";

type MySQLDB = Awaited<ReturnType<typeof createDB>>;
let db: MySQLDB;
let testPool: Pool;
let client: typeof import("../src/lib/appbymari/client");
let purchase: typeof import("../src/lib/appbymari/purchase");
let appRepository: typeof import("../src/lib/appbymari/repository");

const schema = `
CREATE TABLE users (
  id VARCHAR(128) PRIMARY KEY,
  email VARCHAR(255) NULL,
  display_name VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_banned TINYINT(1) NOT NULL DEFAULT 0,
  points DECIMAL(12,2) NOT NULL DEFAULT 0,
  site_id VARCHAR(50) NOT NULL DEFAULT 'main',
  updated_at DATETIME(6) NULL
) ENGINE=InnoDB;
CREATE TABLE api_providers (
  id VARCHAR(128) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  api_key VARCHAR(255) NULL,
  api_endpoint TEXT NULL,
  product_endpoint TEXT NULL,
  buy_endpoint TEXT NULL,
  history_endpoint TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NULL,
  updated_at DATETIME(6) NULL
) ENGINE=InnoDB;
CREATE TABLE appbymari_products (
  id VARCHAR(128) PRIMARY KEY,
  site_id VARCHAR(50) NOT NULL DEFAULT 'main',
  api_provider_id VARCHAR(128) NULL,
  source_type_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  image_url LONGTEXT NULL,
  image_override_url LONGTEXT NULL,
  details TEXT NULL,
  category_name VARCHAR(255) NULL,
  cost_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  sale_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  stock INT NOT NULL DEFAULT 0,
  reserved_stock INT NOT NULL DEFAULT 0,
  is_enabled TINYINT(1) NOT NULL DEFAULT 0,
  last_synced_at DATETIME(6) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  UNIQUE KEY uq_appbymari_product_source (site_id, source_type_id)
) ENGINE=InnoDB;
CREATE TABLE appbymari_purchase_requests (
  id VARCHAR(36) PRIMARY KEY,
  site_id VARCHAR(50) NOT NULL,
  buyer_user_id VARCHAR(128) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  source_type_id VARCHAR(255) NOT NULL,
  product_id VARCHAR(128) NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(12,2) NULL,
  reserved_amount DECIMAL(12,2) NULL,
  status VARCHAR(32) NOT NULL,
  processing_stage VARCHAR(40) NOT NULL DEFAULT 'CLAIMED',
  processing_token VARCHAR(36) NOT NULL,
  lease_expires_at DATETIME(6) NULL,
  upstream_order_id VARCHAR(255) NULL,
  upstream_payload LONGTEXT NULL,
  response_status INT NULL,
  saved_response LONGTEXT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  UNIQUE KEY uq_appbymari_purchase_key (site_id, buyer_user_id, idempotency_key)
) ENGINE=InnoDB;
CREATE TABLE orders (
  id VARCHAR(128) PRIMARY KEY,
  purchase_request_id VARCHAR(36) NULL,
  purchase_item_index INT NULL,
  external_uid VARCHAR(255) NULL,
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
  is_local TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_orders_purchase_item (purchase_request_id, purchase_item_index)
) ENGINE=InnoDB;
`;

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function provider() {
  return {
    id: "provider-appbymari",
    name: APPBYMARI_PROVIDER_NAME,
    displayName: "AppByMari ร้านหลัก",
    apiKey: "test-key",
    apiEndpoint: APPBYMARI_API_BASE_URL,
    productEndpoint: `${APPBYMARI_API_BASE_URL}/products`,
    buyEndpoint: `${APPBYMARI_API_BASE_URL}/buy`,
    historyEndpoint: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function scalar(query: string, params: unknown[] = []): Promise<number> {
  const [rows] = await testPool.query(query, params);
  return Number((rows as Array<Record<string, unknown>>)[0].value);
}

async function seedProduct() {
  await testPool.execute(
    `INSERT INTO users (id, email, display_name, is_active, is_banned, points, site_id, updated_at)
     VALUES ('buyer-a', 'buyer-a@example.test', 'Buyer A', 1, 0, 100, 'main', NOW(6))`,
  );
  await testPool.execute(
    `INSERT INTO api_providers (
       id, name, display_name, api_key, api_endpoint, product_endpoint, buy_endpoint,
       is_active, created_at, updated_at
     ) VALUES (?, ?, ?, 'test-key', ?, ?, ?, 1, NOW(6), NOW(6))`,
    [
      provider().id,
      provider().name,
      provider().displayName,
      provider().apiEndpoint,
      provider().productEndpoint,
      provider().buyEndpoint,
    ],
  );
  await testPool.execute(
    `INSERT INTO appbymari_products (
       id, site_id, api_provider_id, source_type_id, name, image_url, details,
       category_name, cost_price, sale_price, stock, reserved_stock, is_enabled,
       last_synced_at, created_at, updated_at
     ) VALUES ('app-product-a', 'main', ?, 'source-a', 'Remote Netflix', 'https://cdn.test/a.png',
       'remote details', 'แอพสตรีมมิ่ง', 10, 20, 2, 0, 1, NOW(6), NOW(6), NOW(6))`,
    [provider().id],
  );
}

before(async () => {
  db = await createDB({
    version: "8.4.x",
    dbName: "appbymari_bridge_test",
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
  });
  for (const statement of schema.split(";").map((item) => item.trim()).filter(Boolean)) {
    await testPool.query(statement);
  }
  client = await import("../src/lib/appbymari/client");
  purchase = await import("../src/lib/appbymari/purchase");
  appRepository = await import("../src/lib/appbymari/repository");
});

beforeEach(async () => {
  for (const table of ["orders", "appbymari_purchase_requests", "appbymari_products", "api_providers", "users"]) {
    await testPool.query(`DELETE FROM ${table}`);
  }
  globalThis.fetch = (async () => response({ success: false }, 500)) as typeof fetch;
});

after(async () => {
  const appPool = (await import("../src/lib/mysql")).default;
  await appPool.end();
  await testPool.end();
  await db.stop();
});

test("namespaces AppByMari ids without changing local product ids", () => {
  const storefrontId = toAppByMariStorefrontTypeId("source-a");
  assert.equal(storefrontId, "appbymari:source-a");
  assert.equal(parseAppByMariStorefrontTypeId(storefrontId), "source-a");
  assert.equal(parseAppByMariStorefrontTypeId("local-source-a"), null);
});

test("keeps a StoreByMari image override across AppByMari syncs", async () => {
  await appRepository.upsertAppByMariProducts([
    {
      sourceTypeId: "source-image",
      name: "Remote Image Product",
      imageUrl: "https://cdn.test/original.png",
      details: "remote details",
      categoryName: "แอพสตรีมมิ่ง",
      costPrice: 10,
      stock: 2,
    },
  ], provider().id, "main");
  await appRepository.updateAppByMariProductSettings({
    sourceTypeId: "source-image",
    siteId: "main",
    imageUrl: "/uploads/products/custom.png",
    isEnabled: true,
  });
  await appRepository.upsertAppByMariProducts([
    {
      sourceTypeId: "source-image",
      name: "Remote Image Product Updated",
      imageUrl: "https://cdn.test/refreshed.png",
      details: "refreshed details",
      categoryName: "แอพสตรีมมิ่ง",
      costPrice: 12,
      stock: 3,
    },
  ], provider().id, "main");

  const adminProducts = await appRepository.getAppByMariProductsForAdmin("main");
  const adminProduct = adminProducts.find((product) => product.sourceTypeId === "source-image");
  assert.ok(adminProduct);
  assert.equal(adminProduct.imageUrl, "/uploads/products/custom.png");
  assert.equal(adminProduct.sourceImageUrl, "https://cdn.test/refreshed.png");
  assert.equal(adminProduct.hasImageOverride, true);

  const storefrontProducts = await appRepository.fetchEnabledAppByMariProducts({ siteId: "main" });
  const storefrontProduct = storefrontProducts.find((product) => product.externalSourceTypeId === "source-image");
  assert.ok(storefrontProduct);
  assert.equal(storefrontProduct.imageUrl, "/uploads/products/custom.png");
});

test("fetches all remote products with the API key in a server request header", async () => {
  const requests: Array<{ url: string; headers: Headers }> = [];
  globalThis.fetch = (async (input, init) => {
    requests.push({ url: String(input), headers: new Headers(init?.headers) });
    return response({
      success: true,
      data: [{ type_id: "source-a", name: "Remote Netflix", image_url: null, price: 12, stock: 3 }],
      pagination: { total: 1, limit: 100, offset: 0, hasMore: false },
    });
  }) as typeof fetch;

  const products = await client.fetchAppByMariProducts({ provider: provider(), apiKey: "test-key" });
  assert.equal(products.length, 1);
  assert.equal(products[0].costPrice, 12);
  assert.equal(requests[0].url, `${APPBYMARI_API_BASE_URL}/products?limit=100&offset=0`);
  assert.equal(requests[0].headers.get("x-api-key"), "test-key");
  assert.equal("apiKey" in products[0], false);
});

test("tests the connection and sends idempotency key for a remote buy", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input, init) => {
    requests.push({ url: String(input), init });
    if (String(input).endsWith("/test-connection")) {
      return response({ success: true, tenant: { site_name: "StoreByMari" } });
    }
    if (String(input).endsWith("/products?limit=100&offset=0")) {
      return response({ success: true, data: [], pagination: { total: 0 } });
    }
    return response({
      success: true,
      productName: "Remote Netflix",
      orderId: "remote-order-a",
      accountData: [{ email: "a@example.test", password: "p", details: "account" }],
      remainingStock: 1,
    });
  }) as typeof fetch;

  const connection = await client.testAppByMariConnection({ apiKey: "test-key" });
  assert.equal(connection.productCount, 0);
  assert.equal(connection.siteName, "StoreByMari");
  const buy = await client.buyAppByMariProduct({
    provider: provider(),
    sourceTypeId: "source-a",
    quantity: 1,
    idempotencyKey: "buy-key-a",
  });
  assert.equal(buy.orderId, "remote-order-a");
  assert.equal(new Headers(requests[2].init?.headers).get("Idempotency-Key"), "buy-key-a");
  assert.equal(JSON.stringify(requests[2].init?.body).includes("test-key"), false);
});

test("deducts StoreByMari points only after remote success and replays one order", async () => {
  await seedProduct();
  let buyCalls = 0;
  globalThis.fetch = (async () => {
    buyCalls += 1;
    return response({
      success: true,
      productName: "Remote Netflix",
      orderId: "remote-order-a",
      accountData: [{ email: "a@example.test", password: "p", details: "account" }],
      remainingStock: 1,
    });
  }) as typeof fetch;

  const first = await purchase.executeAppByMariStorefrontPurchase({
    buyerUserId: "buyer-a",
    typeId: "appbymari:source-a",
    quantity: 1,
    idempotencyKey: "store-order-a",
  });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.ok, true);
  assert.equal(await scalar("SELECT points AS value FROM users WHERE id = 'buyer-a'"), 80);
  assert.equal(await scalar("SELECT stock - reserved_stock AS value FROM appbymari_products WHERE id = 'app-product-a'"), 1);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM orders"), 1);
  assert.equal(await scalar("SELECT cost_price AS value FROM orders"), 10);

  const replay = await purchase.executeAppByMariStorefrontPurchase({
    buyerUserId: "buyer-a",
    typeId: "appbymari:source-a",
    quantity: 1,
    idempotencyKey: "store-order-a",
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.replayed, true);
  assert.equal(buyCalls, 1);
  assert.equal(await scalar("SELECT points AS value FROM users WHERE id = 'buyer-a'"), 80);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM orders"), 1);
});

test("refunds the local reservation when AppByMari rejects the purchase", async () => {
  await seedProduct();
  globalThis.fetch = (async () => response({ success: false, message: "out of stock" }, 400)) as typeof fetch;

  const result = await purchase.executeAppByMariStorefrontPurchase({
    buyerUserId: "buyer-a",
    typeId: "appbymari:source-a",
    quantity: 1,
    idempotencyKey: "store-order-fail",
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.ok, false);
  assert.equal(await scalar("SELECT points AS value FROM users WHERE id = 'buyer-a'"), 100);
  assert.equal(await scalar("SELECT reserved_stock AS value FROM appbymari_products WHERE id = 'app-product-a'"), 0);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM orders"), 0);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM appbymari_purchase_requests WHERE status = 'FAILED'"), 1);
});
