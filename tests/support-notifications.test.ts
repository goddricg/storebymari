import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import { after, before, beforeEach, test } from "node:test";
import { createDB } from "mysql-memory-server";
import mysql, { type Pool } from "mysql2/promise";

type MySQLDB = Awaited<ReturnType<typeof createDB>>;
type NotificationsModule = typeof import("../src/lib/support/notifications");

let db: MySQLDB;
let testPool: Pool;
let notifications: NotificationsModule;
let supportRepository: typeof import("../src/lib/support/repository");

function stubNextCacheForDirectNodeTest(): void {
  const testRequire = createRequire(`${process.cwd()}/tests/support-notifications.test.ts`);
  const nextCachePath = testRequire.resolve("next/cache");
  const nextCacheModule = new Module(nextCachePath);
  nextCacheModule.filename = nextCachePath;
  nextCacheModule.loaded = true;
  nextCacheModule.exports = {
    unstable_cache: <T extends (...args: never[]) => unknown>(callback: T): T => callback,
  };
  testRequire.cache[nextCachePath] = nextCacheModule;
}

const schema = `
CREATE TABLE users (
  id VARCHAR(128) PRIMARY KEY,
  site_id VARCHAR(50) NOT NULL,
  email VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NULL
) ENGINE=InnoDB;

CREATE TABLE support_cases (
  id VARCHAR(128) PRIMARY KEY,
  case_code VARCHAR(100) NOT NULL,
  user_id VARCHAR(128) NULL,
  product_name VARCHAR(255) NULL,
  case_type VARCHAR(100) NOT NULL,
  problem_description TEXT NULL,
  status VARCHAR(50) NOT NULL,
  site_id VARCHAR(50) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE support_case_notification_reads (
  site_id VARCHAR(50) NOT NULL,
  support_case_id VARCHAR(128) NOT NULL,
  admin_user_id VARCHAR(128) NOT NULL,
  read_at DATETIME(6) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (site_id, support_case_id, admin_user_id)
) ENGINE=InnoDB;
`;

async function scalar(query: string, params: unknown[] = []): Promise<number> {
  const [rows] = await testPool.query(query, params);
  return Number((rows as Array<{ value: number | string }>)[0]?.value ?? 0);
}

async function seedCase(input: {
  id: string;
  caseCode: string;
  siteId?: string;
  userId?: string | null;
  status?: "pending" | "resolved";
  createdAt: string;
  problemDescription?: string;
}) {
  await testPool.execute(
    `INSERT INTO support_cases (
       id, case_code, user_id, product_name, case_type, problem_description,
       status, site_id, created_at, updated_at
     ) VALUES (?, ?, ?, ?, 'screen', ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.caseCode,
      input.userId ?? null,
      "Netflix",
      input.problemDescription ?? "เปิดใช้งานไม่ได้",
      input.status ?? "pending",
      input.siteId ?? "main",
      input.createdAt,
      input.createdAt,
    ],
  );
}

before(async () => {
  db = await createDB({
    version: "8.4.x",
    dbName: "support_notification_test",
    downloadBinaryOnce: true,
    xEnabled: "OFF",
  });

  process.env.DB_HOST = "127.0.0.1";
  process.env.DB_USER = db.username;
  process.env.DB_PASSWORD = "";
  process.env.DB_NAME = db.dbName;
  process.env.DB_PORT = String(db.port);
  process.env.NEXT_PUBLIC_SITE_ID = "main";
  // Direct Node tests do not boot Next's request/cache runtime. Keep the data
  // assertions focused on MySQL queries and tenant scope without Next internals.
  stubNextCacheForDirectNodeTest();

  testPool = mysql.createPool({
    host: "127.0.0.1",
    user: db.username,
    password: "",
    database: db.dbName,
    port: db.port,
    connectionLimit: 10,
  });

  for (const statement of schema.split(";").map((item) => item.trim()).filter(Boolean)) {
    await testPool.query(statement);
  }

  notifications = await import("../src/lib/support/notifications");
  supportRepository = await import("../src/lib/support/repository");
});

beforeEach(async () => {
  await testPool.query("DELETE FROM support_case_notification_reads");
  await testPool.query("DELETE FROM support_cases");
  await testPool.query("DELETE FROM users");

  await testPool.execute(
    "INSERT INTO users (id, site_id, email, display_name) VALUES (?, ?, ?, ?), (?, ?, ?, ?)",
    [
      "user-a", "main", "a@example.com", "ลูกค้า A",
      "user-b", "main", "b@example.com", "ลูกค้า B",
    ],
  );

  await seedCase({
    id: "case-old",
    caseCode: "CASE-2026-00001",
    userId: "user-a",
    createdAt: "2026-09-06 10:00:00.000000",
  });
  await seedCase({
    id: "case-new",
    caseCode: "CASE-2026-00002",
    userId: "user-b",
    createdAt: "2026-09-06 11:00:00.000000",
    problemDescription: "รหัสผ่านใช้งานไม่ได้\nลองแล้วหลายเครื่อง",
  });
  await seedCase({
    id: "case-resolved",
    caseCode: "CASE-2026-00003",
    status: "resolved",
    createdAt: "2026-09-06 12:00:00.000000",
  });
  await seedCase({
    id: "case-child",
    caseCode: "CASE-2026-00004",
    siteId: "child1",
    createdAt: "2026-09-06 13:00:00.000000",
  });
});

after(async () => {
  const appPool = (await import("../src/lib/mysql")).default;
  await appPool.end();
  await testPool.end();
  await db.stop();
});

test("lists only pending cases in newest-first order and returns short safe details", async () => {
  const result = await notifications.getUnreadSupportCaseNotifications("admin-a", undefined, 20);

  assert.deepEqual(result.map((item) => item.id), ["case-child", "case-new", "case-old"]);
  assert.equal(result.find((item) => item.id === "case-new")?.reporterName, "ลูกค้า B");
  assert.equal(result.find((item) => item.id === "case-new")?.problemDescription, "รหัสผ่านใช้งานไม่ได้ ลองแล้วหลายเครื่อง");
  assert.equal(result.some((item) => item.id === "case-resolved"), false);
});

test("marks a notification read for one admin without hiding it from another admin", async () => {
  const marked = await notifications.markSupportCaseNotificationRead("admin-a", "case-new");
  assert.deepEqual(marked, { caseId: "case-new", caseCode: "CASE-2026-00002" });

  const adminA = await notifications.getUnreadSupportCaseNotifications("admin-a");
  const adminB = await notifications.getUnreadSupportCaseNotifications("admin-b");

  assert.equal(adminA.some((item) => item.id === "case-new"), false);
  assert.equal(adminB.some((item) => item.id === "case-new"), true);
  assert.equal(await notifications.countUnreadSupportCaseNotifications("admin-a"), 2);
  assert.equal(await notifications.countUnreadSupportCaseNotifications("admin-b"), 3);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM support_case_notification_reads"), 1);
});

test("marking the same notification twice is idempotent and child scope stays isolated", async () => {
  await notifications.markSupportCaseNotificationRead("admin-a", "case-new");
  await notifications.markSupportCaseNotificationRead("admin-a", "case-new");

  const childNotifications = await notifications.getUnreadSupportCaseNotifications(
    "admin-a",
    { siteId: "child1" },
  );

  assert.deepEqual(childNotifications.map((item) => item.id), ["case-child"]);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM support_case_notification_reads"), 1);
  assert.equal(
    await notifications.markSupportCaseNotificationRead("admin-a", "case-new", { siteId: "child1" }),
    null,
  );
});

test("summarizes blank and multiline problem descriptions", () => {
  assert.equal(notifications.summarizeSupportCaseProblem("  \n  "), "ผู้ใช้แจ้งปัญหา");
  assert.equal(notifications.summarizeSupportCaseProblem("one\ntwo\tthree"), "one two three");
  assert.equal(notifications.summarizeSupportCaseProblem("123456789", 5), "12345…");
});

test("counts resolved support cases across the central site and within a child site", async () => {
  assert.equal(await supportRepository.countResolvedSupportCases(), 1);

  await seedCase({
    id: "case-child-resolved",
    caseCode: "CASE-2026-00005",
    siteId: "child1",
    status: "resolved",
    createdAt: "2026-09-06 14:00:00.000000",
  });

  assert.equal(await supportRepository.countResolvedSupportCases(), 2);
  process.env.NEXT_PUBLIC_SITE_ID = "child1";
  assert.equal(await supportRepository.countResolvedSupportCases(), 1);
  process.env.NEXT_PUBLIC_SITE_ID = "main";
});
