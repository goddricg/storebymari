import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

type ProbeEnv = Record<string, string | undefined>;
type Call = { method: string; sql?: string; params?: unknown[] };
type FakeConnection = {
  calls: Call[];
  query(sql: string): Promise<[unknown[], unknown[]]>;
  execute(sql: string, params?: unknown[]): Promise<[unknown[], unknown[]]>;
  beginTransaction(): Promise<void>;
  rollback(): Promise<void>;
  end(): Promise<void>;
};
type ProbeOptions = {
  env?: ProbeEnv;
  connectionFactory?: (config: Record<string, unknown>) => Promise<FakeConnection>;
};

const testRequire = createRequire(import.meta.url);
const { runProductionDbProbe } = testRequire("../scripts/probe-production-db.js") as {
  runProductionDbProbe(options?: ProbeOptions): Promise<{ ok: true }>;
};

const validEnv: ProbeEnv = {
  DB_PROBE_TARGET: "storebymari.com",
  DB_HOST: "fake-host",
  DB_USER: "fake-user",
  DB_PASSWORD: "fake-password",
  DB_NAME: "fake-database",
};

function createFakeConnection(options: { database?: string; failOnInsert?: boolean } = {}): FakeConnection {
  const calls: Call[] = [];
  let storedValue: unknown;
  const database = options.database ?? validEnv.DB_NAME;

  return {
    calls,
    async query(sql) {
      calls.push({ method: "query", sql });
      if (sql === "SELECT 1 AS probe_ok") return [[{ probe_ok: 1 }], []];
      if (sql === "SELECT DATABASE() AS current_database") {
        return [[{ current_database: database }], []];
      }
      return [[], []];
    },
    async execute(sql, params = []) {
      calls.push({ method: "execute", sql, params });
      if (sql.startsWith("INSERT INTO ")) {
        if (options.failOnInsert) throw new Error("fake password and host details");
        storedValue = params[1];
        return [[], []];
      }
      if (sql.startsWith("SELECT probe_value FROM ")) {
        return [[{ probe_value: storedValue }], []];
      }
      return [[], []];
    },
    async beginTransaction() {
      calls.push({ method: "beginTransaction" });
    },
    async rollback() {
      calls.push({ method: "rollback" });
    },
    async end() {
      calls.push({ method: "end" });
    },
  };
}

test("target and required-config guards run before connecting without echoing values", async () => {
  let factoryCalls = 0;
  const connectionFactory = async () => {
    factoryCalls += 1;
    return createFakeConnection();
  };

  await assert.rejects(
    runProductionDbProbe({ env: { ...validEnv, DB_PROBE_TARGET: "wrong-target" }, connectionFactory }),
    /DB_PROBE_TARGET=storebymari\.com/
  );
  await assert.rejects(
    runProductionDbProbe({ env: { ...validEnv, DB_PASSWORD: "" }, connectionFactory }),
    /DB_PASSWORD/
  );
  assert.equal(factoryCalls, 0);
});

test("database identity mismatch fails safely and closes the connection", async () => {
  const connection = createFakeConnection({ database: "other-database" });

  await assert.rejects(
    runProductionDbProbe({ env: validEnv, connectionFactory: async () => connection }),
    (error: Error) => {
      assert.match(error.message, /identity check failed/);
      assert.doesNotMatch(error.message, /fake-database|other-database/);
      return true;
    }
  );
  assert.deepEqual(connection.calls.map((call) => call.method), ["query", "query", "end"]);
});

test("write round-trip uses a temporary table, transaction, rollback, drop, and close", async () => {
  const connection = createFakeConnection();
  let receivedConfig: Record<string, unknown> | undefined;

  assert.deepEqual(
    await runProductionDbProbe({
      env: validEnv,
      connectionFactory: async (config) => {
        receivedConfig = config;
        return connection;
      },
    }),
    { ok: true }
  );

  assert.deepEqual(receivedConfig, {
    host: "fake-host",
    user: "fake-user",
    password: "fake-password",
    database: "fake-database",
    port: 3306,
  });
  assert.deepEqual(connection.calls.map((call) => call.method), [
    "query",
    "query",
    "query",
    "beginTransaction",
    "execute",
    "execute",
    "rollback",
    "query",
    "end",
  ]);

  const createCall = connection.calls[2];
  const insertCall = connection.calls[4];
  const selectCall = connection.calls[5];
  const dropCall = connection.calls[7];
  assert.match(createCall.sql ?? "", /^CREATE TEMPORARY TABLE `codex_probe_[a-f0-9]{24}`/);
  assert.match(dropCall.sql ?? "", /^DROP TEMPORARY TABLE IF EXISTS `codex_probe_[a-f0-9]{24}`$/);
  assert.equal(insertCall.params?.[0], selectCall.params?.[0]);
  assert.equal(insertCall.params?.[1], selectCall.params?.[0]);
});

test("failed write still attempts rollback, temporary-table drop, and close with redacted errors", async () => {
  const connection = createFakeConnection({ failOnInsert: true });

  await assert.rejects(
    runProductionDbProbe({ env: validEnv, connectionFactory: async () => connection }),
    (error: Error) => {
      assert.match(error.message, /write round-trip failed/);
      assert.doesNotMatch(error.message, /password|host details/);
      return true;
    }
  );
  assert.deepEqual(connection.calls.map((call) => call.method), [
    "query",
    "query",
    "query",
    "beginTransaction",
    "execute",
    "rollback",
    "query",
    "end",
  ]);
});
