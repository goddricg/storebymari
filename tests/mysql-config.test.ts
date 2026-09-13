import assert from "node:assert/strict";
import { after, before, test } from "node:test";

type MysqlModule = typeof import("../src/lib/mysql");

let mysqlModule: MysqlModule;
const originalEnv = new Map<string, string | undefined>();
const envKeys = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME", "DB_PORT"];

before(async () => {
  for (const key of envKeys) originalEnv.set(key, process.env[key]);
  process.env.DB_HOST = "127.0.0.1";
  process.env.DB_USER = "test-user";
  process.env.DB_PASSWORD = "";
  process.env.DB_NAME = "test-database";
  process.env.DB_PORT = "3307";
  mysqlModule = await import("../src/lib/mysql");
});

after(async () => {
  await mysqlModule.default.end();
  for (const key of envKeys) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("requires an explicit host, user, and database name", () => {
  assert.throws(
    () => mysqlModule.getMysqlConfig({ DB_USER: "user", DB_NAME: "database" }),
    /DB_HOST/
  );
  assert.throws(
    () => mysqlModule.getMysqlConfig({ DB_HOST: "host", DB_NAME: "database" }),
    /DB_USER/
  );
  assert.throws(
    () => mysqlModule.getMysqlConfig({ DB_HOST: "host", DB_USER: "user" }),
    /DB_NAME/
  );
});

test("accepts an empty password outside production and applies a safe port default", () => {
  assert.deepEqual(
    mysqlModule.getMysqlConfig({
      DB_HOST: " host ",
      DB_USER: " user ",
      DB_PASSWORD: "",
      DB_NAME: " database ",
    }),
    {
      host: "host",
      user: "user",
      password: "",
      database: "database",
      port: 3306,
    }
  );
});

test("requires a non-empty production password and rejects malformed ports", () => {
  assert.throws(
    () => mysqlModule.getMysqlConfig({
      NODE_ENV: "production",
      DB_HOST: "host",
      DB_USER: "user",
      DB_PASSWORD: "",
      DB_NAME: "database",
    }),
    /DB_PASSWORD/
  );

  for (const DB_PORT of ["0", "65536", "3306oops", "1.5"]) {
    assert.throws(
      () => mysqlModule.getMysqlConfig({
        DB_HOST: "host",
        DB_USER: "user",
        DB_PASSWORD: "password",
        DB_NAME: "database",
        DB_PORT,
      }),
      /DB_PORT/
    );
  }
});

test("returns a complete config without exposing or deriving credentials", () => {
  assert.deepEqual(
    mysqlModule.getMysqlConfig({
      DB_HOST: "db.internal",
      DB_USER: "store_user",
      DB_PASSWORD: " configured password ",
      DB_NAME: "store_database",
      DB_PORT: "3306",
    }),
    {
      host: "db.internal",
      user: "store_user",
      password: " configured password ",
      database: "store_database",
      port: 3306,
    }
  );
});
