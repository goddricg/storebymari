import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";
import { createDB } from "mysql-memory-server";
import mysql, { type Pool } from "mysql2/promise";
import {
  createPurchaseFingerprint,
  resolvePurchaseIdempotencyKey,
  type PurchasePayload,
} from "../src/lib/purchases/idempotency";
import type { ValidatedApiKey } from "../src/lib/auth/api-key";

type PurchaseResult = {
  status: number;
  body: {
    success?: boolean;
    ok?: boolean;
    productName?: string;
    accountData?: unknown[];
    remainingStock?: number;
    orderId?: string;
    message?: string;
  };
  replayed?: boolean;
};

type MySQLDB = Awaited<ReturnType<typeof createDB>>;

type PurchaseModule = typeof import("../src/lib/purchases/master-purchase");
type ProductsRouteModule = typeof import("../src/app/api/v1/products/route");
type BuyRouteModule = typeof import("../src/app/api/v1/buy/route");

let db: MySQLDB;
let testPool: Pool;
let purchases: PurchaseModule;
let productsRoute: ProductsRouteModule;
let buyRoute: BuyRouteModule;

const schema = `
CREATE TABLE users (
  id VARCHAR(128) PRIMARY KEY,
  email VARCHAR(255) NULL,
  display_name VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  points DECIMAL(10,2) NOT NULL DEFAULT 0,
  role VARCHAR(50) NULL,
  is_admin TINYINT(1) NOT NULL DEFAULT 0,
  user_tier VARCHAR(50) NULL,
  tier_expires_at DATETIME(6) NULL,
  updated_at DATETIME(6) NULL
) ENGINE=InnoDB;

CREATE TABLE tenant_api_keys (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  api_key VARCHAR(255) NOT NULL UNIQUE,
  site_name VARCHAR(255) NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  is_site_suspended TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE products (
  id VARCHAR(128) PRIMARY KEY,
  site_id VARCHAR(50) DEFAULT 'main',
  is_local TINYINT(1) DEFAULT 0,
  type_id VARCHAR(255) NULL,
  name VARCHAR(255) NULL,
  image_url LONGTEXT NULL,
  details TEXT NULL,
  price DECIMAL(10,2) DEFAULT 0,
  price_vip DECIMAL(10,2) DEFAULT 0,
  price_walkin DECIMAL(10,2) NULL,
  cost_price DECIMAL(10,2) DEFAULT 0,
  stock INT DEFAULT 0,
  type_menu VARCHAR(255) NULL,
  category_id VARCHAR(128) NULL,
  badge VARCHAR(50) NULL,
  account_email VARCHAR(255) NULL,
  account_password VARCHAR(255) NULL,
  account_data JSON NULL,
  api_provider_id VARCHAR(128) NULL,
  is_published TINYINT(1) DEFAULT 1,
  created_at DATETIME(6) NULL,
  updated_at DATETIME(6) NULL,
  INDEX idx_products_type_id (type_id)
) ENGINE=InnoDB;

CREATE TABLE site_product_prices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site_id VARCHAR(50) NOT NULL,
  product_id VARCHAR(128) NOT NULL,
  retail_price DECIMAL(10,2) NULL,
  UNIQUE KEY idx_site_product (site_id, product_id)
) ENGINE=InnoDB;

CREATE TABLE api_providers (
  id VARCHAR(128) PRIMARY KEY,
  name VARCHAR(255) NULL,
  display_name VARCHAR(255) NULL,
  api_key VARCHAR(255) NULL,
  api_endpoint TEXT NULL,
  product_endpoint TEXT NULL,
  buy_endpoint TEXT NULL,
  history_endpoint TEXT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME(6) NULL,
  updated_at DATETIME(6) NULL
) ENGINE=InnoDB;

CREATE TABLE purchase_requests (
  id VARCHAR(36) PRIMARY KEY,
  tenant_id VARCHAR(36) NULL,
  scope VARCHAR(32) NOT NULL,
  site_id VARCHAR(50) NOT NULL,
  actor_id VARCHAR(128) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  request_fingerprint CHAR(64) NULL,
  product_type_id VARCHAR(255) NOT NULL,
  product_id VARCHAR(128) NULL,
  quantity INT NOT NULL,
  status VARCHAR(20) NOT NULL,
  processing_stage VARCHAR(32) NULL,
  processing_token VARCHAR(36) NULL,
  lease_expires_at DATETIME(6) NULL,
  reserved_amount DECIMAL(10,2) NULL,
  fulfillment_payload LONGTEXT NULL,
  order_id VARCHAR(128) NULL,
  response_status INT NULL,
  response_json LONGTEXT NULL,
  saved_response LONGTEXT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  UNIQUE KEY uq_purchase_requests_tenant_key (tenant_id, idempotency_key)
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
  is_local TINYINT(1) DEFAULT 0,
  UNIQUE KEY uq_orders_purchase_item (purchase_request_id, purchase_item_index)
) ENGINE=InnoDB;
`;

async function seedTenant(input: {
  tenantId: string;
  userId: string;
  apiKey: string;
  points?: number;
}): Promise<ValidatedApiKey> {
  await testPool.execute(
    `INSERT INTO users (
      id, email, display_name, is_active, points, updated_at
    ) VALUES (?, ?, ?, 1, ?, NOW(6))`,
    [
      input.userId,
      `${input.userId}@example.test`,
      input.userId,
      input.points ?? 100,
    ]
  );
  await testPool.execute(
    `INSERT INTO tenant_api_keys (
      id, user_id, api_key, site_name, is_enabled, is_site_suspended
    ) VALUES (?, ?, ?, ?, 1, 0)`,
    [input.tenantId, input.userId, input.apiKey, input.tenantId]
  );

  return {
    tenant_id: input.tenantId,
    user_id: input.userId,
    site_name: input.tenantId,
    is_site_suspended: false,
  };
}

async function seedProduct(input: {
  id: string;
  typeId: string;
  stock: number;
  accounts?: Array<{
    email?: string;
    password?: string;
    details?: string;
  }>;
  price?: number;
  providerId?: string;
}): Promise<void> {
  await testPool.execute(
    `INSERT INTO products (
      id, site_id, is_local, type_id, name, price, cost_price, stock,
      account_data, api_provider_id, is_published, created_at, updated_at
    ) VALUES (?, 'main', 0, ?, ?, ?, 1, ?, ?, ?, 1, NOW(6), NOW(6))`,
    [
      input.id,
      input.typeId,
      input.typeId,
      input.price ?? 10,
      input.stock,
      JSON.stringify(input.accounts ?? []),
      input.providerId ?? null,
    ]
  );
}

async function purchase(input: {
  auth: ValidatedApiKey;
  key: string;
  payload: PurchasePayload;
}): Promise<PurchaseResult> {
  const requestFingerprint = createPurchaseFingerprint(input.payload);
  const claim = await purchases.claimMasterPurchase({
    auth: input.auth,
    idempotencyKey: input.key,
    requestFingerprint,
    payload: input.payload,
  });

  if (claim.kind === "claimed") {
    return purchases.executeMasterPurchase({
      requestId: claim.requestId,
      processingToken: claim.processingToken,
      auth: input.auth,
      payload: input.payload,
    });
  }
  if (claim.decision.kind === "conflict") {
    return {
      status: 409,
      body: { ok: false, message: "Idempotency conflict" },
    };
  }
  if (claim.decision.kind === "replay") {
    return {
      status: claim.decision.status,
      body: claim.decision.body as PurchaseResult["body"],
      replayed: true,
    };
  }

  return purchases.waitForMasterPurchase({
    tenantId: input.auth.tenant_id,
    idempotencyKey: input.key,
    requestFingerprint,
  });
}

async function scalar(query: string, params: unknown[] = []): Promise<number> {
  const [rows] = await testPool.query(query, params);
  return Number((rows as Array<Record<string, unknown>>)[0].value);
}

before(async () => {
  db = await createDB({
    version: "8.4.x",
    dbName: "master_purchase_test",
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

  for (const statement of schema
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)) {
    await testPool.query(statement);
  }

  purchases = await import("../src/lib/purchases/master-purchase");
  productsRoute = await import("../src/app/api/v1/products/route");
  buyRoute = await import("../src/app/api/v1/buy/route");
});

beforeEach(async () => {
  await testPool.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of [
    "orders",
    "purchase_requests",
    "tenant_api_keys",
    "site_product_prices",
    "products",
    "users",
    "api_providers",
  ]) {
    await testPool.query(`DELETE FROM ${table}`);
  }
  await testPool.query("SET FOREIGN_KEY_CHECKS = 1");
});

after(async () => {
  const appPool = (await import("../src/lib/mysql")).default;
  await appPool.end();
  await testPool.end();
  await db.stop();
});

test("20 concurrent retries create and deliver one order", async () => {
  const auth = await seedTenant({
    tenantId: "tenant-a",
    userId: "user-a",
    apiKey: "key-a",
  });
  await seedProduct({
    id: "product-a",
    typeId: "sku-a",
    stock: 1,
    accounts: [
      { email: "one@example.test", password: "secret", details: "item-one" },
    ],
  });

  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      purchase({
        auth,
        key: "same-request",
        payload: { typeId: "sku-a", quantity: 1 },
      })
    )
  );

  assert.equal(results.every((result) => result.status === 200), true);
  assert.equal(
    new Set(results.map((result) => result.body.orderId)).size,
    1
  );
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM orders"), 1);
  assert.equal(
    await scalar("SELECT stock AS value FROM products WHERE id = 'product-a'"),
    0
  );
  assert.equal(
    await scalar("SELECT points AS value FROM users WHERE id = 'user-a'"),
    90
  );
});

test("same key with a different payload returns 409 without a new order", async () => {
  const auth = await seedTenant({
    tenantId: "tenant-a",
    userId: "user-a",
    apiKey: "key-a",
  });
  await seedProduct({
    id: "product-a",
    typeId: "sku-a",
    stock: 2,
    accounts: [{ details: "one" }, { details: "two" }],
  });

  const first = await purchase({
    auth,
    key: "payload-conflict",
    payload: { typeId: "sku-a", quantity: 1 },
  });
  const conflict = await purchase({
    auth,
    key: "payload-conflict",
    payload: { typeId: "sku-a", quantity: 2 },
  });

  assert.equal(first.status, 200);
  assert.equal(conflict.status, 409);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM orders"), 1);
});

test("legacy non-admin tenant pricing remains compatible", async () => {
  const auth = await seedTenant({
    tenantId: "tenant-a",
    userId: "user-a",
    apiKey: "key-a",
  });
  await seedProduct({
    id: "product-a",
    typeId: "sku-a",
    stock: 1,
    accounts: [{ details: "one" }],
    price: 10,
  });
  await testPool.execute(
    `INSERT INTO site_product_prices (site_id, product_id, retail_price)
     VALUES ('main', 'product-a', 7)`
  );

  const result = await purchase({
    auth,
    key: "site-price",
    payload: { typeId: "sku-a", quantity: 1 },
  });

  assert.equal(result.status, 200);
  assert.equal(
    await scalar("SELECT points AS value FROM users WHERE id = 'user-a'"),
    93
  );
});

test("one stock item with two different keys only permits one purchase", async () => {
  const auth = await seedTenant({
    tenantId: "tenant-a",
    userId: "user-a",
    apiKey: "key-a",
  });
  await seedProduct({
    id: "product-a",
    typeId: "sku-a",
    stock: 1,
    accounts: [{ details: "only-item" }],
  });

  const results = await Promise.all([
    purchase({
      auth,
      key: "buyer-attempt-1",
      payload: { typeId: "sku-a", quantity: 1 },
    }),
    purchase({
      auth,
      key: "buyer-attempt-2",
      payload: { typeId: "sku-a", quantity: 1 },
    }),
  ]);

  assert.deepEqual(
    results.map((result) => result.status).sort(),
    [200, 400]
  );
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM orders"), 1);
  assert.equal(
    await scalar("SELECT stock AS value FROM products WHERE id = 'product-a'"),
    0
  );
  assert.equal(
    await scalar("SELECT points AS value FROM users WHERE id = 'user-a'"),
    90
  );
});

test("retry after a lost response replays the original order", async () => {
  const auth = await seedTenant({
    tenantId: "tenant-a",
    userId: "user-a",
    apiKey: "key-a",
  });
  await seedProduct({
    id: "product-a",
    typeId: "sku-a",
    stock: 1,
    accounts: [{ details: "delivered-once" }],
  });

  const first = await purchase({
    auth,
    key: "lost-response",
    payload: { typeId: "sku-a", quantity: 1 },
  });
  const retry = await purchase({
    auth,
    key: "lost-response",
    payload: { typeId: "sku-a", quantity: 1 },
  });

  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  assert.equal(retry.replayed, true);
  assert.deepEqual(retry.body, first.body);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM orders"), 1);
});

test("concurrent retries call an external provider only once", async () => {
  let providerCalls = 0;
  const server = createServer((request, response) => {
    providerCalls += 1;
    request.resume();
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        ok: true,
        status: "success",
        message: "ok",
        data: {
          uid: 42,
          name: "external-sku",
          imageapi: "",
          textdb: "external-delivery",
          point: 10,
          date: new Date().toISOString(),
        },
      })
    );
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", resolve)
  );

  try {
    const address = server.address() as AddressInfo;
    await testPool.execute(
      `INSERT INTO api_providers (
        id, name, display_name, api_key, api_endpoint, buy_endpoint,
        is_active, created_at, updated_at
      ) VALUES ('provider-a', 'gafiwshop', 'Provider A', 'provider-secret',
        ?, ?, 1, NOW(6), NOW(6))`,
      [
        `http://127.0.0.1:${address.port}`,
        `http://127.0.0.1:${address.port}/buy`,
      ]
    );
    const auth = await seedTenant({
      tenantId: "tenant-a",
      userId: "user-a",
      apiKey: "key-a",
    });
    await seedProduct({
      id: "external-product",
      typeId: "external-sku",
      stock: 1,
      accounts: [],
      providerId: "provider-a",
    });

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        purchase({
          auth,
          key: "external-retry",
          payload: { typeId: "external-sku", quantity: 1 },
        })
      )
    );

    assert.equal(results.every((result) => result.status === 200), true);
    assert.equal(providerCalls, 1);
    assert.equal(await scalar("SELECT COUNT(*) AS value FROM orders"), 1);
    assert.equal(
      await scalar(
        "SELECT stock AS value FROM products WHERE id = 'external-product'"
      ),
      0
    );
    assert.equal(
      await scalar("SELECT points AS value FROM users WHERE id = 'user-a'"),
      90
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

test("the same idempotency key is isolated between tenants", async () => {
  const authA = await seedTenant({
    tenantId: "tenant-a",
    userId: "user-a",
    apiKey: "key-a",
  });
  const authB = await seedTenant({
    tenantId: "tenant-b",
    userId: "user-b",
    apiKey: "key-b",
  });
  await seedProduct({
    id: "product-a",
    typeId: "sku-a",
    stock: 2,
    accounts: [{ details: "one" }, { details: "two" }],
  });

  const [resultA, resultB] = await Promise.all([
    purchase({
      auth: authA,
      key: "shared-key",
      payload: { typeId: "sku-a", quantity: 1 },
    }),
    purchase({
      auth: authB,
      key: "shared-key",
      payload: { typeId: "sku-a", quantity: 1 },
    }),
  ]);

  assert.equal(resultA.status, 200);
  assert.equal(resultB.status, 200);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM orders"), 2);
});

test("products API returns database stock immediately after purchase", async () => {
  const auth = await seedTenant({
    tenantId: "tenant-a",
    userId: "user-a",
    apiKey: "key-a",
  });
  await seedProduct({
    id: "product-a",
    typeId: "sku-a",
    stock: 2,
    accounts: [{ details: "one" }, { details: "two" }],
  });

  const result = await purchase({
    auth,
    key: "fresh-stock",
    payload: { typeId: "sku-a", quantity: 1 },
  });
  const apiResponse = await productsRoute.GET(
    new Request("http://appbymari.test/api/v1/products", {
      headers: { "x-api-key": "key-a" },
    })
  );
  const apiBody = (await apiResponse.json()) as {
    data: Array<{
      type_id: string;
      stock: number;
      account_data?: unknown;
      account_email?: unknown;
      account_password?: unknown;
    }>;
  };
  const listedProduct = apiBody.data.find(
    (product) => product.type_id === "sku-a"
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.remainingStock, 1);
  assert.equal(
    apiResponse.headers.get("cache-control")?.includes("no-store"),
    true
  );
  assert.equal(
    listedProduct?.stock,
    1
  );
  assert.equal("account_data" in (listedProduct ?? {}), false);
  assert.equal("account_email" in (listedProduct ?? {}), false);
  assert.equal("account_password" in (listedProduct ?? {}), false);
});

test("legacy clients can purchase through the route without a key", async () => {
  const resolved = resolvePurchaseIdempotencyKey({
    headerKey: null,
    requestId: undefined,
  });
  const auth = await seedTenant({
    tenantId: "tenant-a",
    userId: "user-a",
    apiKey: "key-a",
  });
  await seedProduct({
    id: "product-a",
    typeId: "sku-a",
    stock: 1,
    accounts: [{ details: "legacy-item" }],
  });

  assert.equal(auth.tenant_id, "tenant-a");
  const { NextRequest } = await import("next/server");
  const apiResponse = await buyRoute.POST(
    new NextRequest("http://appbymari.test/api/v1/buy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "key-a",
      },
      body: JSON.stringify({ typeId: "sku-a", quantity: 1 }),
    })
  );
  const result = (await apiResponse.json()) as PurchaseResult["body"];

  assert.equal(resolved.isLegacy, true);
  assert.equal(apiResponse.status, 200);
  assert.equal(result.success, true);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM orders"), 1);
});

test("Idempotency-Key takes precedence over requestId", () => {
  const resolved = resolvePurchaseIdempotencyKey({
    headerKey: "header-key",
    requestId: "body-key",
  });

  assert.deepEqual(resolved, {
    key: "header-key",
    isLegacy: false,
  });
});

test("buy CORS allows legacy auth and idempotency headers", async () => {
  const response = await buyRoute.OPTIONS();
  const allowedHeaders =
    response.headers.get("access-control-allow-headers") || "";

  assert.equal(response.status, 204);
  assert.match(allowedHeaders, /Content-Type/i);
  assert.match(allowedHeaders, /x-api-key/i);
  assert.match(allowedHeaders, /Authorization/i);
  assert.match(allowedHeaders, /Idempotency-Key/i);
});
