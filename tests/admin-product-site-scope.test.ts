import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { createDB } from "mysql-memory-server";
import mysql, { type Pool } from "mysql2/promise";
import type { ExternalProduct } from "../src/lib/products/types";

type MySQLDB = Awaited<ReturnType<typeof createDB>>;
type ProductRepository = typeof import("../src/lib/products/repository");

let db: MySQLDB;
let testPool: Pool;
let products: ProductRepository;

const schema = `
CREATE TABLE users (
  id VARCHAR(128) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  is_api_enabled TINYINT(1) NOT NULL DEFAULT 0,
  site_id VARCHAR(50) NOT NULL DEFAULT 'main'
) ENGINE=InnoDB;

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
  price_vip DECIMAL(10,2) NULL,
  price_walkin DECIMAL(10,2) NULL,
  image_url LONGTEXT NULL,
  UNIQUE KEY uq_site_product (site_id, product_id)
) ENGINE=InnoDB;

CREATE TABLE orders (
  id VARCHAR(128) PRIMARY KEY,
  product_type_id VARCHAR(255) NULL
) ENGINE=InnoDB;
`;

async function firstRow<T extends Record<string, unknown>>(
  query: string,
  params: unknown[] = [],
): Promise<T> {
  const [rows] = await testPool.query(query, params);
  return (rows as T[])[0];
}

async function scalar(query: string, params: unknown[] = []): Promise<number> {
  return Number((await firstRow<{ value: unknown }>(query, params)).value);
}

async function seedUser(): Promise<void> {
  await testPool.execute(
    `INSERT INTO users (id, email, is_api_enabled, site_id)
     VALUES ('main-master', 'master@example.test', 1, 'main')`,
  );
}

async function seedProduct(input: {
  id: string;
  siteId: string;
  isLocal: boolean;
  typeId: string;
  name: string;
  price?: number;
  priceVip?: number;
  stock?: number;
}): Promise<void> {
  await testPool.execute(
    `INSERT INTO products (
       id, site_id, is_local, type_id, name, price, price_vip, stock,
       account_data, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6), NOW(6))`,
    [
      input.id,
      input.siteId,
      input.isLocal ? 1 : 0,
      input.typeId,
      input.name,
      input.price ?? 100,
      input.priceVip ?? 10,
      input.stock ?? 5,
      JSON.stringify([]),
    ],
  );
}

async function seedDuplicateTypeProducts(): Promise<void> {
  await seedProduct({
    id: "global-product",
    siteId: "main",
    isLocal: false,
    typeId: "shared-sku",
    name: "Shared product",
    price: 100,
    priceVip: 10,
  });
  await seedProduct({
    id: "child-product",
    siteId: "child-shop",
    isLocal: true,
    typeId: "shared-sku",
    name: "Child product",
    price: 200,
    priceVip: 20,
  });
  await seedProduct({
    id: "other-product",
    siteId: "other-shop",
    isLocal: true,
    typeId: "shared-sku",
    name: "Other product",
    price: 300,
    priceVip: 30,
  });
}

async function productRow(id: string): Promise<Record<string, unknown>> {
  const [rows] = await testPool.query("SELECT * FROM products WHERE id = ?", [id]);
  return (rows as Array<Record<string, unknown>>)[0];
}

before(async () => {
  db = await createDB({
    version: "8.4.x",
    dbName: "admin_product_site_scope_test",
    downloadBinaryOnce: true,
    xEnabled: "OFF",
  });

  process.env.DB_HOST = "127.0.0.1";
  process.env.DB_USER = db.username;
  process.env.DB_PASSWORD = "";
  process.env.DB_NAME = db.dbName;
  process.env.DB_PORT = String(db.port);
  process.env.NEXT_PUBLIC_SITE_ID = "child-shop";
  process.env.NEXT_PUBLIC_CHILD_SITE_MASTER_EMAIL = "master@example.test";

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

  products = await import("../src/lib/products/repository");
});

beforeEach(async () => {
  await testPool.query("DELETE FROM orders");
  await testPool.query("DELETE FROM site_product_prices");
  await testPool.query("DELETE FROM products");
  await testPool.query("DELETE FROM users");
  await seedUser();
});

after(async () => {
  const appPool = (await import("../src/lib/mysql")).default;
  await appPool.end();
  await testPool.end();
  await db.stop();
});

test("Admin update uses the authorized child product id and cannot reopen a foreign local row", async () => {
  await seedDuplicateTypeProducts();

  await products.updateProduct(
    "shared-sku",
    { name: "Child product updated", stock: 7 },
    false,
    "child-product",
  );

  assert.equal((await productRow("child-product")).name, "Child product updated");
  assert.equal((await productRow("global-product")).name, "Shared product");
  assert.equal((await productRow("other-product")).name, "Other product");

  await assert.rejects(
    products.updateProduct(
      "shared-sku",
      { name: "Foreign mutation" },
      false,
      "other-product",
    ),
    /ไม่พบสินค้าที่ต้องการแก้ไข/,
  );
  assert.equal((await productRow("other-product")).name, "Other product");
});

test("Child edits to a shared product stay in the site overlay and do not rewrite the canonical row", async () => {
  await seedDuplicateTypeProducts();

  await products.updateProduct(
    "shared-sku",
    { name: "Must not replace shared name", price: 177, imageUrl: "/child-image.png" },
    false,
    "global-product",
  );

  const global = await productRow("global-product");
  assert.equal(global.name, "Shared product");
  assert.equal(Number(global.price), 100);

  const overlay = await firstRow<{ retail_price: number; image_url: string }>(
    "SELECT retail_price, image_url FROM site_product_prices WHERE site_id = ? AND product_id = ?",
    ["child-shop", "global-product"],
  );
  assert.equal(Number(overlay.retail_price), 177);
  assert.equal(overlay.image_url, "/child-image.png");
});

test("Existing force-stock callers can still update a shared row without crossing into another site", async () => {
  await seedProduct({
    id: "global-only-product",
    siteId: "main",
    isLocal: false,
    typeId: "global-only-sku",
    name: "Global only",
    stock: 5,
  });
  await seedProduct({
    id: "other-global-only-product",
    siteId: "other-shop",
    isLocal: true,
    typeId: "global-only-sku",
    name: "Other local",
    stock: 9,
  });

  await products.updateProduct("global-only-sku", { stock: 4 }, true);

  assert.equal(Number((await productRow("global-only-product")).stock), 4);
  assert.equal(Number((await productRow("other-global-only-product")).stock), 9);
});

test("Delete uses the scoped row identity and leaves same-type products in other sites untouched", async () => {
  await seedDuplicateTypeProducts();

  await assert.rejects(
    products.deleteProduct("shared-sku", "other-product"),
    /ไม่พบสินค้า/,
  );
  await assert.rejects(
    products.deleteProduct("shared-sku", "global-product"),
    /ไม่สามารถลบสินค้าหลักจากเว็บลูกได้/,
  );
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM products"), 3);

  await products.deleteProduct("shared-sku", "child-product");
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM products WHERE id = ?", ["child-product"]), 0);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM products WHERE id = ?", ["global-product"]), 1);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM products WHERE id = ?", ["other-product"]), 1);
});

test("Bulk profit updates only globally visible products for the trusted child site", async () => {
  await seedDuplicateTypeProducts();

  const result = await products.applyGlobalProfit("amount", 5, "child-shop");
  assert.equal(result.length, 2);
  assert.equal(Number((await productRow("global-product")).price), 15);
  assert.equal(Number((await productRow("child-product")).price), 25);
  assert.equal(Number((await productRow("other-product")).price), 300);
});

test("External sync updates or creates only the current site's catalog scope", async () => {
  await seedDuplicateTypeProducts();

  const item: ExternalProduct = {
    type_id: "shared-sku",
    name: "Synced child product",
    imageapi: "/synced.png",
    details: "synced",
    price: 999,
    pricevip: 25,
    pricewalkin: 30,
    stock: 8,
    type_menu: "streaming",
  };
  await products.upsertProductsFromExternal([item], "provider-child", "child-shop");

  assert.equal((await productRow("child-product")).name, "Synced child product");
  assert.equal((await productRow("global-product")).name, "Shared product");
  assert.equal((await productRow("other-product")).name, "Other product");

  await products.upsertProductsFromExternal(
    [{ ...item, name: "Synced main product" }],
    "provider-main",
    "main",
  );
  assert.equal((await productRow("global-product")).name, "Synced main product");
  assert.equal((await productRow("child-product")).name, "Synced child product");
  assert.equal((await productRow("other-product")).name, "Other product");

  await products.upsertProductsFromExternal([
    { ...item, type_id: "new-child-sku", name: "New child product" },
  ], "provider-child", "child-shop");
  const [rows] = await testPool.query(
    "SELECT site_id, is_local FROM products WHERE type_id = ?",
    ["new-child-sku"],
  );
  assert.deepEqual((rows as Array<Record<string, unknown>>)[0], {
    site_id: "child-shop",
    is_local: 1,
  });
});

test("Legacy type-id write helpers also require an in-scope selected row", async () => {
  await seedDuplicateTypeProducts();

  await products.updateProductPrice("shared-sku", 111, "child-product");
  await products.updateProductPublishStatus("shared-sku", false, "child-product");
  await products.updateProductBadge("shared-sku", "recommended", "child-product");

  const child = await productRow("child-product");
  assert.equal(Number(child.price), 111);
  assert.equal(Number(child.is_published), 0);
  assert.equal(child.badge, "recommended");
  assert.equal(Number((await productRow("global-product")).price), 100);
  assert.equal(Number((await productRow("global-product")).is_published), 1);

  await assert.rejects(
    products.updateProductPrice("shared-sku", 777, "other-product"),
    /ไม่พบสินค้า/,
  );
  assert.equal(Number((await productRow("other-product")).price), 300);
});
