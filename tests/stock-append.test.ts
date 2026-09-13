import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { createDB } from "mysql-memory-server";
import mysql, { type Pool } from "mysql2/promise";

type MySQLDB = Awaited<ReturnType<typeof createDB>>;
type StockAppendModule = typeof import("../src/lib/products/stock-append");
type StockAccountEditModule = typeof import("../src/lib/products/stock-account-edit");
type StockAccountDeleteModule = typeof import("../src/lib/products/stock-account-delete");
type StockAccountBulkDeleteModule = typeof import("../src/lib/products/stock-account-bulk-delete");
type StockClearModule = typeof import("../src/lib/products/stock-clear");

let db: MySQLDB;
let testPool: Pool;
let stockAppend: StockAppendModule;
let stockAccountEdit: StockAccountEditModule;
let stockAccountDelete: StockAccountDeleteModule;
let stockAccountBulkDelete: StockAccountBulkDeleteModule;
let stockClear: StockClearModule;

const schema = `
CREATE TABLE products (
  id VARCHAR(128) PRIMARY KEY,
  site_id VARCHAR(50) NOT NULL DEFAULT 'main',
  is_local TINYINT(1) NOT NULL DEFAULT 0,
  type_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  image_url LONGTEXT NULL,
  details TEXT NULL,
  price DECIMAL(10,2) NULL,
  price_vip DECIMAL(10,2) NULL,
  cost_price DECIMAL(10,2) NULL,
  price_walkin DECIMAL(10,2) NULL,
  stock INT NULL DEFAULT 0,
  type_menu VARCHAR(255) NULL,
  category_id VARCHAR(128) NULL,
  account_email VARCHAR(255) NULL,
  account_password VARCHAR(255) NULL,
  account_data JSON NULL,
  stock_delivery_type VARCHAR(32) NOT NULL DEFAULT 'account-pool',
  is_published TINYINT(1) NOT NULL DEFAULT 1,
  api_provider_id VARCHAR(128) NULL,
  badge VARCHAR(50) NULL,
  created_at DATETIME(6) NULL,
  updated_at DATETIME(6) NULL,
  INDEX idx_products_type_id (type_id)
) ENGINE=InnoDB;

CREATE TABLE site_product_prices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site_id VARCHAR(50) NOT NULL,
  product_id VARCHAR(128) NOT NULL,
  retail_price DECIMAL(10,2) NULL,
  image_url LONGTEXT NULL,
  UNIQUE KEY uq_site_product (site_id, product_id)
) ENGINE=InnoDB;

CREATE TABLE stock_append_requests (
  id VARCHAR(36) PRIMARY KEY,
  site_id VARCHAR(50) NOT NULL,
  actor_id VARCHAR(128) NOT NULL,
  product_id VARCHAR(128) NOT NULL,
  type_id VARCHAR(255) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL,
  response_status INT NULL,
  saved_response LONGTEXT NULL,
  accepted_count INT NOT NULL DEFAULT 0,
  duplicate_count INT NOT NULL DEFAULT 0,
  invalid_count INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  UNIQUE KEY uq_stock_append_site_actor_key (site_id, actor_id, idempotency_key),
  KEY idx_stock_append_status_updated (site_id, status, updated_at)
) ENGINE=InnoDB;
`;

const account = (email: string, password: string, details = "ส่งมอบ") => ({
  email,
  password,
  details,
});

async function seedProduct(input: {
  id: string;
  siteId?: string;
  isLocal?: boolean;
  typeId?: string;
  name?: string;
  stock?: number;
  accounts?: Array<{ email: string; password: string; details: string }>;
  stockDeliveryType?: "account-pool" | "account-screen-pool" | "reusable-account-pool" | "invite-link-pool" | "reusable-link";
  providerId?: string | null;
  accountEmail?: string | null;
  accountPassword?: string | null;
}): Promise<void> {
  const accounts = input.accounts ?? [];
  await testPool.execute(
    `INSERT INTO products (
      id, site_id, is_local, type_id, name, stock, account_email, account_password,
      account_data, stock_delivery_type, api_provider_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6), NOW(6))`,
    [
      input.id,
      input.siteId ?? "main",
      input.isLocal ? 1 : 0,
      input.typeId ?? input.id,
      input.name ?? `Product ${input.id}`,
      input.stock ?? accounts.length,
      input.accountEmail ?? null,
      input.accountPassword ?? null,
      JSON.stringify(accounts),
      input.stockDeliveryType ?? "account-pool",
      input.providerId ?? null,
    ],
  );
}

async function append(input: {
  key: string;
  productId: string;
  rawInput: string;
  actorId?: string;
  siteId?: string;
  stockDeliveryType?: "account-pool" | "account-screen-pool" | "reusable-account-pool" | "invite-link-pool" | "reusable-link";
}) {
  return stockAppend.appendProductAccounts({
    productId: input.productId,
    typeId: input.productId,
    rawInput: input.rawInput,
    dataFormat: "long",
    separator: ",",
    actorId: input.actorId ?? "admin-a",
    siteId: input.siteId ?? "main",
    stockDeliveryType: input.stockDeliveryType,
    idempotencyKey: input.key,
  });
}

async function getProduct(id: string) {
  const [rows] = await testPool.query(
    "SELECT stock, account_data, account_email, account_password, api_provider_id FROM products WHERE id = ?",
    [id],
  );
  const row = (rows as Array<{
    stock: number;
    account_data: unknown;
    account_email: string | null;
    account_password: string | null;
    api_provider_id: string | null;
  }>)[0];
  return {
    stock: row.stock,
    account_data: typeof row.account_data === "string" ? JSON.parse(row.account_data) : row.account_data,
    account_email: row.account_email,
    account_password: row.account_password,
    api_provider_id: row.api_provider_id,
  };
}

before(async () => {
  db = await createDB({
    version: "8.4.x",
    dbName: "stock_append_test",
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
    connectionLimit: 40,
  });

  for (const statement of schema.split(";").map((item) => item.trim()).filter(Boolean)) {
    await testPool.query(statement);
  }

  stockAppend = await import("../src/lib/products/stock-append");
  stockAccountEdit = await import("../src/lib/products/stock-account-edit");
  stockAccountDelete = await import("../src/lib/products/stock-account-delete");
  stockAccountBulkDelete = await import("../src/lib/products/stock-account-bulk-delete");
  stockClear = await import("../src/lib/products/stock-clear");
});

beforeEach(async () => {
  await testPool.query("DELETE FROM stock_append_requests");
  await testPool.query("DELETE FROM site_product_prices");
  await testPool.query("DELETE FROM products");
});

after(async () => {
  const appPool = (await import("../src/lib/mysql")).default;
  await appPool.end();
  await testPool.end();
  await db.stop();
});

test("preview counts comma-delimited account blocks without splitting commas in details", () => {
  const preview = stockAppend.previewStockAppend({
    dataFormat: "long",
    separator: ",",
    rawInput: "Email: first@example.com\nPass: pass,with,comma\nNote: detail,with,comma\n,\nEmail: second@example.com\nPass: second-pass\nNote: second",
  });

  assert.equal(preview.detectedCount, 2);
  assert.equal(preview.validAccounts.length, 2);
  assert.equal(preview.invalidCount, 0);
});

test("20 concurrent requests with the same key append once and replay safely", async () => {
  await seedProduct({ id: "product-a", accounts: [account("old@example.com", "old")] });
  const input = {
    key: "same-key",
    productId: "product-a",
    rawInput: "Email: new@example.com\nPass: new-pass\nDetails: new",
  };

  const outcomes = await Promise.all(Array.from({ length: 20 }, () => append(input)));
  const success = outcomes.filter((outcome) => outcome.kind === "success");
  const replayed = success.filter((outcome) => outcome.body.replayed);
  const product = await getProduct("product-a");
  const accounts = product.account_data as unknown[];

  assert.equal(success.length, 20, JSON.stringify(outcomes));
  assert.equal(replayed.length, 19);
  assert.equal(product.stock, 2);
  assert.equal(accounts.length, 2);
  assert.equal(await scalar("SELECT COUNT(*) FROM stock_append_requests"), 1);
});

test("the same key with a different payload returns conflict without appending", async () => {
  await seedProduct({ id: "product-b" });
  await append({
    key: "payload-key",
    productId: "product-b",
    rawInput: "Email: one@example.com\nPass: one",
  });

  const outcome = await append({
    key: "payload-key",
    productId: "product-b",
    rawInput: "Email: two@example.com\nPass: two",
  });
  const product = await getProduct("product-b");

  assert.equal(outcome.kind, "conflict");
  assert.equal(product.stock, 1);
  assert.equal((product.account_data as unknown[]).length, 1);
});

test("different keys append different accounts without losing either request", async () => {
  await seedProduct({ id: "product-c", accounts: [account("old@example.com", "old")] });
  const outcomes = await Promise.all([
    append({ key: "key-one", productId: "product-c", rawInput: "Email: one@example.com\nPass: one" }),
    append({ key: "key-two", productId: "product-c", rawInput: "Email: two@example.com\nPass: two" }),
  ]);
  const product = await getProduct("product-c");
  const accounts = product.account_data as Array<{ email: string }>;

  assert.equal(outcomes.filter((outcome) => outcome.kind === "success").length, 2);
  assert.equal(product.stock, 3);
  assert.deepEqual(accounts.map((item) => item.email).sort(), [
    "old@example.com",
    "one@example.com",
    "two@example.com",
  ]);
});

test("duplicate account with a different key is skipped instead of duplicated", async () => {
  await seedProduct({ id: "product-d", accounts: [account("same@example.com", "same")] });
  const outcome = await append({
    key: "duplicate-key",
    productId: "product-d",
    rawInput: "Email: same@example.com\nPass: same\nDetails: ส่งมอบ",
  });
  const product = await getProduct("product-d");

  assert.equal(outcome.kind, "success");
  if (outcome.kind === "success") {
    assert.equal(outcome.body.addedCount, 0);
    assert.equal(outcome.body.duplicateCount, 1);
  }
  assert.equal(product.stock, 1);
  assert.equal((product.account_data as unknown[]).length, 1);
});

test("invite-link pool rejects the same link but accepts a different link", async () => {
  await seedProduct({
    id: "invite-link-product",
    stockDeliveryType: "invite-link-pool",
    accounts: [account("", "", "https://invite.example/one")],
  });

  const duplicate = await append({
    key: "invite-link-duplicate",
    productId: "invite-link-product",
    stockDeliveryType: "invite-link-pool",
    rawInput: "https://invite.example/one",
  });
  const different = await append({
    key: "invite-link-different",
    productId: "invite-link-product",
    stockDeliveryType: "invite-link-pool",
    rawInput: "https://invite.example/two",
  });

  assert.equal(duplicate.kind, "success");
  if (duplicate.kind === "success") assert.equal(duplicate.body.duplicateCount, 1);
  assert.equal(different.kind, "success");
  if (different.kind === "success") assert.equal(different.body.addedCount, 1);
  const product = await getProduct("invite-link-product");
  assert.equal(product.stock, 2);
});

test("reusable-link pool keeps repeated links as separate stock units", async () => {
  await seedProduct({
    id: "reusable-link-product",
    stockDeliveryType: "reusable-link",
    accounts: [account("", "", "https://invite.example/reusable")],
  });

  const outcome = await append({
    key: "reusable-link-repeat",
    productId: "reusable-link-product",
    stockDeliveryType: "reusable-link",
    rawInput: "https://invite.example/reusable,\n\nhttps://invite.example/reusable",
  });

  assert.equal(outcome.kind, "success");
  if (outcome.kind === "success") {
    assert.equal(outcome.body.addedCount, 2);
    assert.equal(outcome.body.duplicateCount, 0);
  }
  const product = await getProduct("reusable-link-product");
  assert.equal(product.stock, 3);
});

test("reusable-account pool keeps repeated credentials as separate stock units", async () => {
  await seedProduct({
    id: "reusable-account-product",
    stockDeliveryType: "reusable-account-pool",
    accounts: [account("shared@example.com", "shared-pass")],
  });

  const outcome = await append({
    key: "reusable-account-repeat",
    productId: "reusable-account-product",
    stockDeliveryType: "reusable-account-pool",
    rawInput: "Email: shared@example.com\nPass: shared-pass,\nEmail: shared@example.com\nPass: shared-pass",
  });

  assert.equal(outcome.kind, "success");
  if (outcome.kind === "success") {
    assert.equal(outcome.body.addedCount, 2);
    assert.equal(outcome.body.duplicateCount, 0);
  }
  const product = await getProduct("reusable-account-product");
  assert.equal(product.stock, 3);
  assert.equal((product.account_data as unknown[]).length, 3);
});

test("reusable-account pool can broaden an existing account pool without rejecting repeated credentials", async () => {
  await seedProduct({
    id: "reusable-account-upgrade-product",
    accounts: [account("shared@example.com", "shared-pass")],
  });

  const outcome = await append({
    key: "reusable-account-upgrade",
    productId: "reusable-account-upgrade-product",
    stockDeliveryType: "reusable-account-pool",
    rawInput: "Email: shared@example.com\nPass: shared-pass",
  });

  assert.equal(outcome.kind, "success");
  if (outcome.kind === "success") assert.equal(outcome.body.addedCount, 1);
  const product = await getProduct("reusable-account-upgrade-product");
  assert.equal(product.stock, 2);
});

test("reusable-account pool still detects a different idempotency payload", async () => {
  await seedProduct({
    id: "reusable-account-idempotency-product",
    stockDeliveryType: "reusable-account-pool",
  });

  await append({
    key: "reusable-account-payload-key",
    productId: "reusable-account-idempotency-product",
    stockDeliveryType: "reusable-account-pool",
    rawInput: "Email: first@example.com\nPass: first-pass",
  });
  const conflict = await append({
    key: "reusable-account-payload-key",
    productId: "reusable-account-idempotency-product",
    stockDeliveryType: "reusable-account-pool",
    rawInput: "Email: second@example.com\nPass: second-pass",
  });

  assert.equal(conflict.kind, "conflict");
  const product = await getProduct("reusable-account-idempotency-product");
  assert.equal(product.stock, 1);
});

test("an existing product cannot switch delivery type while it has stock", async () => {
  await seedProduct({
    id: "delivery-type-conflict-product",
    accounts: [account("legacy@example.com", "legacy-pass")],
  });

  await assert.rejects(
    () => append({
      key: "delivery-type-conflict",
      productId: "delivery-type-conflict-product",
      stockDeliveryType: "invite-link-pool",
      rawInput: "https://invite.example/new",
    }),
    (error: unknown) => error instanceof stockAppend.StockAppendError && error.code === "STOCK_DELIVERY_TYPE_CONFLICT",
  );
  const product = await getProduct("delivery-type-conflict-product");
  assert.equal(product.stock, 1);
});

test("Prime screen pool permits shared credentials across screens and migrates an existing account pool safely", async () => {
  await seedProduct({
    id: "prime-screen-product",
    name: "Prime Premium 30 Day",
    accounts: [
      account("", "", "mail : shared@example.com\npass : shared-pass\nscreen : จอ 1"),
    ],
  });

  const added = await append({
    key: "prime-screen-two",
    productId: "prime-screen-product",
    stockDeliveryType: "account-screen-pool",
    rawInput: "mail : shared@example.com\npass : shared-pass\nscreen : จอ 2",
  });
  assert.equal(added.kind, "success");
  if (added.kind === "success") {
    assert.equal(added.body.addedCount, 1);
    assert.equal(added.body.duplicateCount, 0);
  }

  const duplicate = await append({
    key: "prime-screen-two-duplicate",
    productId: "prime-screen-product",
    stockDeliveryType: "account-screen-pool",
    rawInput: "mail : shared@example.com\npass : shared-pass\nscreen : Screen 2",
  });
  assert.equal(duplicate.kind, "success");
  if (duplicate.kind === "success") {
    assert.equal(duplicate.body.addedCount, 0);
    assert.equal(duplicate.body.duplicateCount, 1);
  }

  const product = await getProduct("prime-screen-product");
  assert.equal(product.stock, 2);
  assert.equal((product.account_data as unknown[]).length, 2);
});

test("Netflix allows repeated credentials when the screen differs and rejects only the same screen", async () => {
  await seedProduct({
    id: "netflix-product",
    name: "Netflix Premium 30 Day",
    accounts: [
      account("", "", "User: shared@example.com\nPassword: shared-pass\nScreen: 1"),
      account("", "", "User: shared@example.com\nPassword: shared-pass\nScreen: 2"),
      account("", "", "User: shared@example.com\nPassword: shared-pass\nScreen: 3"),
      account("", "", "User: shared@example.com\nPassword: shared-pass\nScreen: 4"),
    ],
  });

  const fifth = await append({
    key: "netflix-screen-five",
    productId: "netflix-product",
    rawInput: "Email: shared@example.com\nPass: shared-pass\nScreen: 5",
  });
  assert.equal(fifth.kind, "success");
  if (fifth.kind === "success") {
    assert.equal(fifth.body.addedCount, 1);
    assert.equal(fifth.body.duplicateCount, 0);
  }

  const sameScreen = await append({
    key: "netflix-screen-five-duplicate",
    productId: "netflix-product",
    rawInput: "Email: shared@example.com\nPass: shared-pass\nScreen: 5",
  });
  assert.equal(sameScreen.kind, "success");
  if (sameScreen.kind === "success") {
    assert.equal(sameScreen.body.addedCount, 0);
    assert.equal(sameScreen.body.duplicateCount, 1);
  }

  const sameScreenWithPaddedNumber = await append({
    key: "netflix-screen-five-padded-duplicate",
    productId: "netflix-product",
    rawInput: "Email: shared@example.com\nPass: shared-pass\nScreen: 05",
  });
  assert.equal(sameScreenWithPaddedNumber.kind, "success");
  if (sameScreenWithPaddedNumber.kind === "success") {
    assert.equal(sameScreenWithPaddedNumber.body.addedCount, 0);
    assert.equal(sameScreenWithPaddedNumber.body.duplicateCount, 1);
  }

  const sixth = await append({
    key: "netflix-screen-six",
    productId: "netflix-product",
    rawInput: "Email: shared@example.com\nPass: shared-pass\nScreen: 6",
  });
  assert.equal(sixth.kind, "success");
  if (sixth.kind === "success") {
    assert.equal(sixth.body.addedCount, 1);
    assert.equal(sixth.body.duplicateCount, 0);
    assert.equal(sixth.body.rejectedCount, 0);
  }

  const product = await getProduct("netflix-product");
  assert.equal(product.stock, 6);
  assert.equal((product.account_data as unknown[]).length, 6);
});

test("Netflix account edits allow another screen but reject an existing screen", async () => {
  await seedProduct({
    id: "netflix-edit-product",
    name: "Netflix Premium 30 Day",
    accounts: [
      account("", "", "User: shared@example.com\nPassword: shared-pass\nScreen: 1"),
      account("", "", "User: shared@example.com\nPassword: shared-pass\nScreen: 2"),
    ],
  });

  const result = await stockAccountEdit.updateProductAccount({
    productId: "netflix-edit-product",
    typeId: "netflix-edit-product",
    accountIndex: 1,
    account: {
      email: "shared@example.com",
      password: "shared-pass",
      details: "Screen: 3",
    },
    siteId: "main",
  });
  assert.equal(result.remainingStock, 2);

  await assert.rejects(
    () => stockAccountEdit.updateProductAccount({
      productId: "netflix-edit-product",
      typeId: "netflix-edit-product",
      accountIndex: 0,
      account: {
        email: "shared@example.com",
        password: "shared-pass",
        details: "Screen: 3",
      },
      siteId: "main",
    }),
    (error: unknown) => error instanceof stockAccountEdit.StockAccountEditError && error.code === "DUPLICATE_ACCOUNT",
  );
});

test("provider stock cannot be mixed with manual account pool append", async () => {
  await seedProduct({ id: "provider-product", stock: 10, providerId: "provider-a" });

  await assert.rejects(
    () => append({
      key: "provider-key",
      productId: "provider-product",
      rawInput: "Email: blocked@example.com\nPass: blocked",
    }),
    (error: unknown) => error instanceof stockAppend.StockAppendError && error.code === "PRODUCT_NOT_ACCOUNT_POOL",
  );
  const product = await getProduct("provider-product");
  assert.equal(product.stock, 10);
  assert.equal((product.account_data as unknown[]).length, 0);
});

test("edits one account in place without changing list order or stock count", async () => {
  await seedProduct({
    id: "edit-product",
    accounts: [
      account("first@example.com", "first-pass"),
      account("second@example.com", "second-pass"),
      account("third@example.com", "third-pass"),
    ],
  });

  const result = await stockAccountEdit.updateProductAccount({
    productId: "edit-product",
    typeId: "edit-product",
    accountIndex: 1,
    account: {
      email: "updated@example.com",
      password: "updated-pass",
      details: "updated details",
    },
    siteId: "main",
  });
  const product = await getProduct("edit-product");
  const accounts = product.account_data as Array<{ email: string; password: string; details: string }>;

  assert.equal(result.accountIndex, 1);
  assert.equal(result.previousStock, 3);
  assert.equal(result.remainingStock, 3);
  assert.equal(product.stock, 3);
  assert.deepEqual(accounts.map((item) => item.email), [
    "first@example.com",
    "updated@example.com",
    "third@example.com",
  ]);
  assert.equal(accounts[1].password, "updated-pass");
  assert.equal(accounts[1].details, "updated details");
});

test("rejects an edit that would duplicate another account", async () => {
  await seedProduct({
    id: "duplicate-edit-product",
    accounts: [
      account("first@example.com", "first-pass"),
      account("second@example.com", "second-pass"),
    ],
  });

  await assert.rejects(
    () => stockAccountEdit.updateProductAccount({
      productId: "duplicate-edit-product",
      typeId: "duplicate-edit-product",
      accountIndex: 0,
      account: {
        email: "second@example.com",
        password: "second-pass",
        details: "changed details",
      },
      siteId: "main",
    }),
    (error: unknown) => error instanceof stockAccountEdit.StockAccountEditError && error.code === "DUPLICATE_ACCOUNT",
  );

  const product = await getProduct("duplicate-edit-product");
  assert.equal(product.stock, 2);
  assert.deepEqual((product.account_data as Array<{ email: string }>).map((item) => item.email), [
    "first@example.com",
    "second@example.com",
  ]);
});

test("serializes concurrent edits for different accounts without losing either change", async () => {
  await seedProduct({
    id: "concurrent-edit-product",
    accounts: [
      account("first@example.com", "first-pass"),
      account("second@example.com", "second-pass"),
    ],
  });

  await Promise.all([
    stockAccountEdit.updateProductAccount({
      productId: "concurrent-edit-product",
      typeId: "concurrent-edit-product",
      accountIndex: 0,
      account: { email: "first-updated@example.com", password: "first-new" },
      siteId: "main",
    }),
    stockAccountEdit.updateProductAccount({
      productId: "concurrent-edit-product",
      typeId: "concurrent-edit-product",
      accountIndex: 1,
      account: { email: "second-updated@example.com", password: "second-new" },
      siteId: "main",
    }),
  ]);

  const product = await getProduct("concurrent-edit-product");
  assert.equal(product.stock, 2);
  assert.deepEqual((product.account_data as Array<{ email: string }>).map((item) => item.email), [
    "first-updated@example.com",
    "second-updated@example.com",
  ]);
});

test("deletes only the expected Account and rejects a stale index retry", async () => {
  await seedProduct({
    id: "delete-product",
    accounts: [
      account("first@example.com", "first-pass"),
      account("second@example.com", "second-pass"),
      account("third@example.com", "third-pass"),
    ],
  });

  const expectedAccount = account("second@example.com", "second-pass");
  const result = await stockAccountDelete.deleteProductAccount({
    productId: "delete-product",
    typeId: "delete-product",
    accountIndex: 1,
    expectedAccount,
    siteId: "main",
  });
  assert.equal(result.remainingStock, 2);

  await assert.rejects(
    () => stockAccountDelete.deleteProductAccount({
      productId: "delete-product",
      typeId: "delete-product",
      accountIndex: 1,
      expectedAccount,
      siteId: "main",
    }),
    (error: unknown) => error instanceof stockAccountDelete.StockAccountDeleteError && error.code === "ACCOUNT_CHANGED",
  );

  const product = await getProduct("delete-product");
  assert.equal(product.stock, 2);
  assert.deepEqual((product.account_data as Array<{ email: string }>).map((item) => item.email), [
    "first@example.com",
    "third@example.com",
  ]);
});

test("deletes multiple selected Accounts in one transaction without index shifting", async () => {
  await seedProduct({
    id: "bulk-delete-product",
    accounts: [
      account("first@example.com", "first-pass"),
      account("second@example.com", "second-pass"),
      account("third@example.com", "third-pass"),
      account("fourth@example.com", "fourth-pass"),
    ],
  });

  const result = await stockAccountBulkDelete.deleteProductAccounts({
    productId: "bulk-delete-product",
    typeId: "bulk-delete-product",
    accounts: [
      { accountIndex: 0, expectedAccount: account("first@example.com", "first-pass") },
      { accountIndex: 2, expectedAccount: account("third@example.com", "third-pass") },
    ],
    siteId: "main",
  });
  const product = await getProduct("bulk-delete-product");

  assert.equal(result.deletedCount, 2);
  assert.deepEqual(result.deletedAccountIndexes, [0, 2]);
  assert.equal(result.previousStock, 4);
  assert.equal(result.remainingStock, 2);
  assert.deepEqual((product.account_data as Array<{ email: string }>).map((item) => item.email), [
    "second@example.com",
    "fourth@example.com",
  ]);
});

test("does not partially delete when one selected Account is stale", async () => {
  await seedProduct({
    id: "bulk-delete-stale-product",
    accounts: [
      account("first@example.com", "first-pass"),
      account("second@example.com", "second-pass"),
    ],
  });

  await assert.rejects(
    () => stockAccountBulkDelete.deleteProductAccounts({
      productId: "bulk-delete-stale-product",
      typeId: "bulk-delete-stale-product",
      accounts: [
        { accountIndex: 0, expectedAccount: account("first@example.com", "first-pass") },
        { accountIndex: 1, expectedAccount: account("changed@example.com", "changed-pass") },
      ],
      siteId: "main",
    }),
    (error: unknown) => error instanceof stockAccountDelete.StockAccountDeleteError && error.code === "ACCOUNT_CHANGED",
  );

  const product = await getProduct("bulk-delete-stale-product");
  assert.equal(product.stock, 2);
  assert.deepEqual((product.account_data as Array<{ email: string }>).map((item) => item.email), [
    "first@example.com",
    "second@example.com",
  ]);
});

test("clears all Account Pool stock and succeeds again when the product is already empty", async () => {
  await seedProduct({
    id: "clear-pool-product",
    accounts: [
      account("first@example.com", "first-pass"),
      account("second@example.com", "second-pass"),
    ],
  });

  const first = await stockClear.clearProductStock({
    productId: "clear-pool-product",
    typeId: "clear-pool-product",
    siteId: "main",
  });
  assert.equal(first.previousStock, 2);
  assert.equal(first.clearedAccountCount, 2);
  assert.equal(first.remainingStock, 0);

  const cleared = await getProduct("clear-pool-product");
  assert.equal(cleared.stock, 0);
  assert.deepEqual(cleared.account_data, []);
  assert.equal(cleared.account_email, null);
  assert.equal(cleared.account_password, null);

  const second = await stockClear.clearProductStock({
    productId: "clear-pool-product",
    typeId: "clear-pool-product",
    siteId: "main",
  });
  assert.equal(second.previousStock, 0);
  assert.equal(second.clearedAccountCount, 0);
  assert.equal(second.remainingStock, 0);
});

test("clears Static Account inventory while preserving Provider configuration", async () => {
  await seedProduct({
    id: "clear-static-product",
    stock: 7,
    accountEmail: "static@example.com",
    accountPassword: "static-pass",
  });

  const staticResult = await stockClear.clearProductStock({
    productId: "clear-static-product",
    typeId: "clear-static-product",
    siteId: "main",
  });
  assert.equal(staticResult.previousStock, 7);
  assert.equal(staticResult.clearedStaticAccount, true);

  const clearedStatic = await getProduct("clear-static-product");
  assert.equal(clearedStatic.stock, 0);
  assert.equal(clearedStatic.account_email, null);
  assert.equal(clearedStatic.account_password, null);

  await seedProduct({
    id: "clear-provider-product",
    stock: 12,
    providerId: "provider-a",
  });
  await stockClear.clearProductStock({
    productId: "clear-provider-product",
    typeId: "clear-provider-product",
    siteId: "main",
  });
  const clearedProvider = await getProduct("clear-provider-product");
  assert.equal(clearedProvider.stock, 0);
  assert.equal(clearedProvider.api_provider_id, "provider-a");
});

test("serializes concurrent Clear Stock requests and leaves a deterministic empty result", async () => {
  await seedProduct({
    id: "concurrent-clear-product",
    accounts: [account("first@example.com", "first-pass")],
  });

  const results = await Promise.all(
    Array.from({ length: 8 }, () => stockClear.clearProductStock({
      productId: "concurrent-clear-product",
      typeId: "concurrent-clear-product",
      siteId: "main",
    })),
  );
  assert.equal(results.length, 8);
  assert.ok(results.every((result) => result.remainingStock === 0));

  const product = await getProduct("concurrent-clear-product");
  assert.equal(product.stock, 0);
  assert.deepEqual(product.account_data, []);
});

async function scalar(query: string): Promise<number> {
  const [rows] = await testPool.query(query);
  return Number((rows as Array<Record<string, unknown>>)[0]["COUNT(*)"]);
}
