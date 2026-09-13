import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { createDB } from "mysql-memory-server";
import mysql, { type Pool } from "mysql2/promise";

type MySQLDB = Awaited<ReturnType<typeof createDB>>;
type TopupModule = typeof import("../src/lib/topup/repository");
type BonusModule = typeof import("../src/lib/topup/bonus-repository");
type TopupReceiptModule = typeof import("../src/lib/receipts/topup-repository");

let db: MySQLDB;
let testPool: Pool;
let topup: TopupModule;
let bonusRepository: BonusModule;
let topupReceipts: TopupReceiptModule;

const schema = `
CREATE TABLE users (
  id VARCHAR(128) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NULL,
  points DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_topup_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  topup_count INT NOT NULL DEFAULT 0,
  last_topup_at DATETIME(6) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  site_id VARCHAR(50) NOT NULL DEFAULT 'main',
  updated_at DATETIME(6) NULL
) ENGINE=InnoDB;

CREATE TABLE settings (
  id VARCHAR(36) PRIMARY KEY,
  \`key\` VARCHAR(255) NOT NULL,
  value TEXT NULL,
  site_id VARCHAR(50) NOT NULL,
  UNIQUE KEY uq_settings_site_key (site_id, \`key\`)
) ENGINE=InnoDB;

CREATE TABLE user_billing_profiles (
  site_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  full_name VARCHAR(255) NULL,
  tax_id VARCHAR(32) NULL,
  address_line1 TEXT NULL,
  address_line2 TEXT NULL,
  subdistrict VARCHAR(255) NULL,
  district VARCHAR(255) NULL,
  province VARCHAR(255) NULL,
  postal_code VARCHAR(20) NULL,
  phone VARCHAR(40) NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (site_id, user_id)
) ENGINE=InnoDB;

CREATE TABLE slip_history (
  id VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(128) NULL,
  transaction_id VARCHAR(255) NULL UNIQUE,
  amount DECIMAL(10,2) NOT NULL,
  bonus_rule_id VARCHAR(36) NULL,
  bonus_points DECIMAL(10,2) NOT NULL DEFAULT 0,
  credited_points DECIMAL(10,2) NULL,
  qr_payload TEXT NOT NULL,
  status VARCHAR(50) NOT NULL,
  source_type VARCHAR(20) NOT NULL DEFAULT 'SYSTEM',
  source_user_id VARCHAR(128) NULL,
  source_label VARCHAR(255) NULL,
  source_email VARCHAR(255) NULL,
  note VARCHAR(255) NULL,
  site_id VARCHAR(50) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  KEY idx_slip_history_site_transaction (site_id, transaction_id),
  KEY idx_slip_history_bonus_quota (site_id, user_id, bonus_rule_id, source_type, status, created_at)
) ENGINE=InnoDB;

CREATE TABLE topup_requests (
  id VARCHAR(36) PRIMARY KEY,
  site_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL,
  processing_token VARCHAR(36) NOT NULL,
  lease_expires_at DATETIME(6) NULL,
  transaction_id VARCHAR(255) NULL,
  amount DECIMAL(10,2) NULL,
  bonus_rule_id VARCHAR(36) NULL,
  bonus_points DECIMAL(10,2) NOT NULL DEFAULT 0,
  credited_points DECIMAL(10,2) NULL,
  bonus_award_finalized TINYINT(1) NOT NULL DEFAULT 1,
  verified_qr_payload TEXT NULL,
  verified_at DATETIME(6) NULL,
  response_status INT NULL,
  saved_response LONGTEXT NULL,
  error_code VARCHAR(64) NULL,
  failure_reason VARCHAR(255) NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  UNIQUE KEY uq_topup_requests_user_key (site_id, user_id, idempotency_key),
  KEY idx_topup_requests_status_updated (status, updated_at),
  KEY idx_topup_requests_transaction (site_id, transaction_id)
) ENGINE=InnoDB;

CREATE TABLE topup_bonus_rules (
  id VARCHAR(36) PRIMARY KEY,
  site_id VARCHAR(50) NOT NULL,
  trigger_amount DECIMAL(10,2) NOT NULL,
  bonus_points DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by VARCHAR(128) NULL,
  updated_by VARCHAR(128) NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  UNIQUE KEY uq_topup_bonus_rule_site_amount (site_id, trigger_amount)
) ENGINE=InnoDB;

CREATE TABLE topup_attempt_history (
  id VARCHAR(36) PRIMARY KEY,
  request_id VARCHAR(36) NOT NULL,
  site_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  transaction_id VARCHAR(255) NULL,
  amount DECIMAL(10,2) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'FAILED',
  response_status INT NULL,
  error_code VARCHAR(64) NULL,
  failure_reason VARCHAR(255) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  UNIQUE KEY uq_topup_attempt_request (request_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE topup_receipt_counters (
  site_id VARCHAR(50) NOT NULL,
  receipt_year INT NOT NULL,
  receipt_month INT NOT NULL,
  last_sequence INT NOT NULL DEFAULT 0,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (site_id, receipt_year, receipt_month)
) ENGINE=InnoDB;

CREATE TABLE topup_cash_receipts (
  id VARCHAR(36) PRIMARY KEY,
  site_id VARCHAR(50) NOT NULL,
  topup_request_id VARCHAR(36) NOT NULL,
  transaction_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  receipt_no VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL,
  issued_at DATETIME(6) NOT NULL,
  amount_paid DECIMAL(12,2) NOT NULL,
  base_points DECIMAL(12,2) NOT NULL,
  bonus_points DECIMAL(12,2) NOT NULL,
  credited_points DECIMAL(12,2) NOT NULL,
  bonus_rule_id VARCHAR(36) NULL,
  seller_snapshot LONGTEXT NOT NULL,
  buyer_snapshot LONGTEXT NOT NULL,
  lines_snapshot LONGTEXT NOT NULL,
  receipt_note VARCHAR(255) NULL,
  template_version VARCHAR(32) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  UNIQUE KEY uq_topup_receipt_request (site_id, topup_request_id),
  UNIQUE KEY uq_topup_receipt_no (site_id, receipt_no),
  UNIQUE KEY uq_topup_receipt_transaction (site_id, transaction_id)
) ENGINE=InnoDB;
`;

async function scalar(query: string, params: unknown[] = []): Promise<number> {
  const [rows] = await testPool.query(query, params);
  return Number((rows as Array<Record<string, unknown>>)[0].value);
}

async function seedUser(
  id: string,
  siteId = "main",
  points = 100
): Promise<void> {
  await testPool.execute(
    `INSERT INTO users (id, email, points, site_id, updated_at)
     VALUES (?, ?, ?, ?, NOW(6))`,
    [id, `${id}@example.test`, points, siteId]
  );
}

async function seedBonusRule(
  id: string,
  triggerAmount: number,
  bonusPoints: number,
  siteId = "main",
  isActive = true
): Promise<void> {
  await testPool.execute(
    `INSERT INTO topup_bonus_rules (
       id, site_id, trigger_amount, bonus_points, is_active,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, NOW(6), NOW(6))`,
    [id, siteId, triggerAmount, bonusPoints, isActive ? 1 : 0]
  );
}

async function finishClaim(input: {
  key: string;
  fingerprint: string;
  userId: string;
  siteId?: string;
  transactionId: string;
  amount?: number;
}) {
  const siteId = input.siteId ?? "main";
  const claim = await topup.claimTopupRequest({
    siteId,
    userId: input.userId,
    idempotencyKey: input.key,
    requestFingerprint: input.fingerprint,
  });

  if (claim.kind === "claimed") {
    const result = await topup.completeVerifiedTopup({
      requestId: claim.requestId,
      processingToken: claim.processingToken,
      siteId,
      userId: input.userId,
      transactionId: input.transactionId,
      amount: input.amount ?? 100,
      qrPayload: input.transactionId,
      minimumAmount: 49,
      message: "Top-up completed",
    });
    return { kind: "success", body: result.body } as const;
  }

  if (claim.decision.kind === "conflict") {
    return { kind: "conflict" } as const;
  }
  if (claim.decision.kind === "replay") {
    return { kind: "success", body: claim.decision.body } as const;
  }

  const decision = await topup.waitForTopupRequest({
    siteId,
    userId: input.userId,
    idempotencyKey: input.key,
    requestFingerprint: input.fingerprint,
  });
  if (decision.kind === "replay") {
    return { kind: "success", body: decision.body } as const;
  }
  return { kind: decision.kind } as const;
}

before(async () => {
  db = await createDB({
    version: "8.4.x",
    dbName: "topup_reliability_test",
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

  topup = await import("../src/lib/topup/repository");
  bonusRepository = await import("../src/lib/topup/bonus-repository");
  topupReceipts = await import("../src/lib/receipts/topup-repository");
});

beforeEach(async () => {
  await testPool.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of [
    "topup_cash_receipts",
    "topup_receipt_counters",
    "topup_attempt_history",
    "topup_requests",
    "slip_history",
    "topup_bonus_rules",
    "user_billing_profiles",
    "settings",
    "users",
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

test("20 concurrent retries credit one top-up and replay one response", async () => {
  await seedUser("user-a");
  const fingerprint = topup.createTopupFingerprint(new TextEncoder().encode("slip-a"));

  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      finishClaim({
        key: "same-topup",
        fingerprint,
        userId: "user-a",
        transactionId: "transaction-a",
      })
    )
  );

  assert.equal(results.every((result) => result.kind === "success"), true);
  assert.equal(new Set(results.map((result) => JSON.stringify(result))).size, 1);
  assert.equal(await scalar("SELECT points AS value FROM users WHERE id = 'user-a'"), 200);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM slip_history"), 1);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM topup_requests"), 1);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM topup_cash_receipts"), 1);
  assert.equal(
    await scalar("SELECT topup_count AS value FROM users WHERE id = 'user-a'"),
    1
  );
});

test("exact top-up bonus awards are snapshotted and keep cash totals separate", async () => {
  await seedUser("bonus-user");
  await seedBonusRule("bonus-500", 500, 10);
  await seedBonusRule("bonus-1000", 1000, 25);

  const firstClaim = await topup.claimTopupRequest({
    siteId: "main",
    userId: "bonus-user",
    idempotencyKey: "bonus-500-key",
    requestFingerprint: topup.createTopupFingerprint(new TextEncoder().encode("bonus-500-slip")),
  });
  if (firstClaim.kind !== "claimed") throw new Error("Expected the 500 baht claim");

  await topup.saveVerifiedTopup({
    requestId: firstClaim.requestId,
    processingToken: firstClaim.processingToken,
    transactionId: "bonus-500-transaction",
    amount: 500,
    qrPayload: "bonus-500-reference",
  });
  const first = await topup.completeVerifiedTopup({
    requestId: firstClaim.requestId,
    processingToken: firstClaim.processingToken,
    siteId: "main",
    userId: "bonus-user",
    transactionId: "bonus-500-transaction",
    amount: 500,
    qrPayload: "bonus-500-reference",
    minimumAmount: 49,
    message: "Top-up completed",
  });

  assert.equal(first.pointsAdded, 510);
  assert.equal(first.bonusPoints, 10);
  assert.equal(first.topupAmount, 500);
  assert.equal(await scalar("SELECT points AS value FROM users WHERE id = 'bonus-user'"), 610);
  assert.equal(await scalar("SELECT total_topup_amount AS value FROM users WHERE id = 'bonus-user'"), 500);
  assert.equal(await scalar("SELECT bonus_points AS value FROM slip_history WHERE transaction_id = 'bonus-500-transaction'"), 10);
  assert.equal(await scalar("SELECT credited_points AS value FROM slip_history WHERE transaction_id = 'bonus-500-transaction'"), 510);
  assert.equal(await scalar("SELECT amount_paid AS value FROM topup_cash_receipts WHERE transaction_id = 'bonus-500-transaction'"), 500);
  assert.equal(await scalar("SELECT base_points AS value FROM topup_cash_receipts WHERE transaction_id = 'bonus-500-transaction'"), 500);
  assert.equal(await scalar("SELECT bonus_points AS value FROM topup_cash_receipts WHERE transaction_id = 'bonus-500-transaction'"), 10);
  assert.equal(await scalar("SELECT credited_points AS value FROM topup_cash_receipts WHERE transaction_id = 'bonus-500-transaction'"), 510);
  const receipt = await topupReceipts.getTopupCashReceiptForUserById(first.topupReceiptId, "bonus-user", "main");
  assert.equal(receipt?.receiptNo, first.topupReceiptNo);
  assert.equal(receipt?.amountPaid, 500);
  assert.equal(receipt?.bonusPoints, 10);
  assert.equal(receipt?.creditedPoints, 510);
  assert.equal(await topupReceipts.getTopupCashReceiptForUserById(first.topupReceiptId, "other-user", "main"), null);

  const secondClaim = await topup.claimTopupRequest({
    siteId: "main",
    userId: "bonus-user",
    idempotencyKey: "bonus-1000-key",
    requestFingerprint: topup.createTopupFingerprint(new TextEncoder().encode("bonus-1000-slip")),
  });
  if (secondClaim.kind !== "claimed") throw new Error("Expected the 1000 baht claim");
  await topup.saveVerifiedTopup({
    requestId: secondClaim.requestId,
    processingToken: secondClaim.processingToken,
    transactionId: "bonus-1000-transaction",
    amount: 1000,
    qrPayload: "bonus-1000-reference",
  });
  const second = await topup.completeVerifiedTopup({
    requestId: secondClaim.requestId,
    processingToken: secondClaim.processingToken,
    siteId: "main",
    userId: "bonus-user",
    transactionId: "bonus-1000-transaction",
    amount: 1000,
    qrPayload: "bonus-1000-reference",
    minimumAmount: 49,
    message: "Top-up completed",
  });

  assert.equal(second.pointsAdded, 1025);
  assert.equal(second.bonusPoints, 25);
  assert.equal(await scalar("SELECT points AS value FROM users WHERE id = 'bonus-user'"), 1635);
  assert.equal(await scalar("SELECT total_topup_amount AS value FROM users WHERE id = 'bonus-user'"), 1500);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM topup_cash_receipts WHERE user_id = 'bonus-user'"), 2);
});

test("each exact promotion is limited to two awards per Bangkok day and resets at midnight", async () => {
  await seedUser("daily-limit-user", "main", 0);
  await seedBonusRule("daily-limit-100", 100, 5);

  const finishVerifiedTopup = async (input: {
    key: string;
    transactionId: string;
    completedAt: Date;
  }) => {
    const claim = await topup.claimTopupRequest({
      siteId: "main",
      userId: "daily-limit-user",
      idempotencyKey: input.key,
      requestFingerprint: topup.createTopupFingerprint(
        new TextEncoder().encode(input.transactionId),
      ),
    });
    if (claim.kind !== "claimed") throw new Error("Expected a new daily-limit claim");

    await topup.saveVerifiedTopup({
      requestId: claim.requestId,
      processingToken: claim.processingToken,
      transactionId: input.transactionId,
      amount: 100,
      qrPayload: input.transactionId,
    });
    return topup.completeVerifiedTopup({
      requestId: claim.requestId,
      processingToken: claim.processingToken,
      siteId: "main",
      userId: "daily-limit-user",
      transactionId: input.transactionId,
      amount: 100,
      qrPayload: input.transactionId,
      minimumAmount: 49,
      message: "Top-up completed",
      completedAt: input.completedAt,
    });
  };

  const first = await finishVerifiedTopup({
    key: "daily-limit-1",
    transactionId: "daily-limit-transaction-1",
    completedAt: new Date("2026-09-03T14:00:00.000Z"),
  });
  const second = await finishVerifiedTopup({
    key: "daily-limit-2",
    transactionId: "daily-limit-transaction-2",
    completedAt: new Date("2026-09-03T15:00:00.000Z"),
  });
  const third = await finishVerifiedTopup({
    key: "daily-limit-3",
    transactionId: "daily-limit-transaction-3",
    completedAt: new Date("2026-09-03T16:00:00.000Z"),
  });

  assert.equal(first.bonusPoints, 5);
  assert.equal(first.creditedPoints, 105);
  assert.equal(first.body.data?.bonusUsageCount, 1);
  assert.equal(second.bonusPoints, 5);
  assert.equal(second.creditedPoints, 105);
  assert.equal(second.body.data?.bonusUsageCount, 2);
  assert.equal(third.bonusPoints, 0);
  assert.equal(third.creditedPoints, 100);
  assert.equal(third.body.data?.bonusUsageCount, 2);
  assert.equal(third.body.data?.bonusLimitReached, true);

  const nextDay = await finishVerifiedTopup({
    key: "daily-limit-4",
    transactionId: "daily-limit-transaction-4",
    completedAt: new Date("2026-09-03T17:00:00.000Z"),
  });

  assert.equal(nextDay.bonusPoints, 5);
  assert.equal(nextDay.creditedPoints, 105);
  assert.equal(nextDay.body.data?.bonusUsageCount, 1);
  assert.equal(await scalar("SELECT points AS value FROM users WHERE id = 'daily-limit-user'"), 415);
  assert.equal(
    await scalar("SELECT COUNT(*) AS value FROM slip_history WHERE user_id = 'daily-limit-user' AND bonus_points > 0"),
    3,
  );
  assert.equal(
    await scalar("SELECT COUNT(*) AS value FROM slip_history WHERE user_id = 'daily-limit-user' AND bonus_points = 0"),
    1,
  );
});

test("daily promotion quota remains capped during concurrent completions", async () => {
  await seedUser("daily-limit-concurrent-user", "main", 0);
  await seedBonusRule("daily-limit-concurrent-100", 100, 5);

  const requests = await Promise.all(
    Array.from({ length: 3 }, async (_, index) => {
      const transactionId = `daily-limit-concurrent-transaction-${index + 1}`;
      const claim = await topup.claimTopupRequest({
        siteId: "main",
        userId: "daily-limit-concurrent-user",
        idempotencyKey: `daily-limit-concurrent-key-${index + 1}`,
        requestFingerprint: topup.createTopupFingerprint(
          new TextEncoder().encode(transactionId),
        ),
      });
      if (claim.kind !== "claimed") throw new Error("Expected a concurrent daily-limit claim");

      await topup.saveVerifiedTopup({
        requestId: claim.requestId,
        processingToken: claim.processingToken,
        transactionId,
        amount: 100,
        qrPayload: transactionId,
      });

      return {
        requestId: claim.requestId,
        processingToken: claim.processingToken,
        transactionId,
      };
    }),
  );

  const completions = await Promise.all(
    requests.map((request) =>
      topup.completeVerifiedTopup({
        requestId: request.requestId,
        processingToken: request.processingToken,
        siteId: "main",
        userId: "daily-limit-concurrent-user",
        transactionId: request.transactionId,
        amount: 100,
        qrPayload: request.transactionId,
        minimumAmount: 49,
        message: "Top-up completed",
        completedAt: new Date("2026-09-03T16:00:00.000Z"),
      }),
    ),
  );

  assert.deepEqual(
    completions.map((completion) => completion.bonusPoints).sort((a, b) => a - b),
    [0, 5, 5],
  );
  assert.equal(await scalar("SELECT points AS value FROM users WHERE id = 'daily-limit-concurrent-user'"), 310);
  assert.equal(
    await scalar("SELECT COUNT(*) AS value FROM slip_history WHERE user_id = 'daily-limit-concurrent-user' AND bonus_points > 0"),
    2,
  );
  assert.equal(
    await scalar("SELECT COUNT(*) AS value FROM slip_history WHERE user_id = 'daily-limit-concurrent-user' AND bonus_points = 0"),
    1,
  );
});

test("admin can create idempotent printable receipts for request and legacy top-up events", async () => {
  await seedUser("request-receipt-user");
  const requestCreatedAt = new Date("2026-08-29T04:00:00.000Z");
  const requestUpdatedAt = new Date("2026-08-29T05:00:00.000Z");
  await testPool.execute(
    `INSERT INTO topup_requests (
       id, site_id, user_id, idempotency_key, request_fingerprint, status,
       processing_token, transaction_id, amount, bonus_rule_id, bonus_points,
       credited_points, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "legacy-request-1",
      "main",
      "request-receipt-user",
      "legacy-request-key",
      "f".repeat(64),
      "SUCCEEDED",
      "legacy-processing-token",
      "legacy-request-transaction",
      1000,
      null,
      25,
      1025,
      requestCreatedAt,
      requestUpdatedAt,
    ],
  );

  const requestReceipt = await topupReceipts.ensureTopupCashReceiptForAdminEvent(
    "request:legacy-request-1",
    "main",
  );
  assert.equal(requestReceipt.created, true);
  assert.equal(requestReceipt.receipt.receiptNo, "TU-2026-08-0001");
  assert.equal(requestReceipt.receipt.amountPaid, 1000);
  assert.equal(requestReceipt.receipt.bonusPoints, 25);
  assert.equal(requestReceipt.receipt.creditedPoints, 1025);

  await seedUser("legacy-receipt-user");
  const createdAt = new Date("2026-08-29T05:00:00.000Z");
  await testPool.execute(
    `INSERT INTO slip_history (
       id, user_id, transaction_id, amount, bonus_rule_id, bonus_points,
       credited_points, qr_payload, status, source_type, site_id, note,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "legacy-slip-1",
      "legacy-receipt-user",
      "legacy-transaction-1",
      500,
      null,
      10,
      510,
      "legacy-qr-payload",
      "success",
      "SYSTEM",
      "main",
      "legacy top-up",
      createdAt,
      createdAt,
    ],
  );

  const first = await topupReceipts.ensureTopupCashReceiptForAdminEvent(
    "history:legacy-slip-1",
    "main",
  );
  assert.equal(first.created, true);
  assert.equal(first.receipt.receiptNo, "TU-2026-08-0002");
  assert.equal(first.receipt.amountPaid, 500);
  assert.equal(first.receipt.bonusPoints, 10);
  assert.equal(first.receipt.creditedPoints, 510);

  const second = await topupReceipts.ensureTopupCashReceiptForAdminEvent(
    "history:legacy-slip-1",
    "main",
  );
  assert.equal(second.created, false);
  assert.equal(second.receipt.id, first.receipt.id);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM topup_cash_receipts"), 2);

  await testPool.execute(
    `INSERT INTO slip_history (
       id, user_id, transaction_id, amount, qr_payload, status, source_type,
       site_id, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "legacy-manual-1",
      "legacy-receipt-user",
      "manual-legacy-transaction",
      200,
      "manual",
      "success",
      "ADMIN",
      "main",
      createdAt,
      createdAt,
    ],
  );
  const manualReceipt = await topupReceipts.ensureTopupCashReceiptForAdminEvent(
    "history:legacy-manual-1",
    "main",
  );
  assert.equal(manualReceipt.created, true);
  assert.equal(manualReceipt.receipt.amountPaid, 200);
  assert.equal(manualReceipt.receipt.bonusPoints, 0);
  assert.equal(manualReceipt.receipt.creditedPoints, 200);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM topup_cash_receipts"), 3);
});

test("admin bonus rule CRUD is site-scoped and archive preserves the rule", async () => {
  const created = await bonusRepository.createTopupBonusRule(
    "main",
    { triggerAmount: 500, bonusPoints: 10, isActive: true },
    "admin-main"
  );
  assert.equal(created.triggerAmount, 500);
  assert.equal(created.bonusPoints, 10);
  assert.equal((await bonusRepository.listTopupBonusRules("main", { activeOnly: true })).length, 1);
  assert.equal((await bonusRepository.listTopupBonusRules("child-shop", { activeOnly: true })).length, 0);

  const updated = await bonusRepository.updateTopupBonusRule(
    "main",
    created.id,
    { triggerAmount: 1000, bonusPoints: 25, isActive: true },
    "admin-main"
  );
  assert.equal(updated.triggerAmount, 1000);
  assert.equal(updated.bonusPoints, 25);

  await bonusRepository.archiveTopupBonusRule("main", created.id, "admin-main");
  assert.equal((await bonusRepository.listTopupBonusRules("main", { activeOnly: true })).length, 0);
  const archived = await bonusRepository.getTopupBonusRule("main", created.id);
  assert.equal(archived?.isActive, false);
  assert.equal(archived?.updatedBy, "admin-main");
});

test("admin can permanently delete a bonus rule without affecting other sites", async () => {
  const created = await bonusRepository.createTopupBonusRule(
    "main",
    { triggerAmount: 750, bonusPoints: 15, isActive: false },
    "admin-main"
  );
  await bonusRepository.createTopupBonusRule(
    "child-shop",
    { triggerAmount: 750, bonusPoints: 20, isActive: true },
    "admin-child"
  );

  await bonusRepository.deleteTopupBonusRule("main", created.id);

  assert.equal(await bonusRepository.getTopupBonusRule("main", created.id), null);
  assert.equal((await bonusRepository.listTopupBonusRules("main")).length, 0);
  assert.equal((await bonusRepository.listTopupBonusRules("child-shop")).length, 1);
});

test("a bonus rule edit after provider journaling does not change the retry award", async () => {
  await seedUser("snapshot-user");
  await seedBonusRule("snapshot-rule", 500, 10);
  const fingerprint = topup.createTopupFingerprint(new TextEncoder().encode("snapshot-slip"));
  const firstClaim = await topup.claimTopupRequest({
    siteId: "main",
    userId: "snapshot-user",
    idempotencyKey: "snapshot-key",
    requestFingerprint: fingerprint,
  });
  if (firstClaim.kind !== "claimed") throw new Error("Expected a new snapshot claim");

  await topup.saveVerifiedTopup({
    requestId: firstClaim.requestId,
    processingToken: firstClaim.processingToken,
    transactionId: "snapshot-transaction",
    amount: 500,
    qrPayload: "snapshot-reference",
  });
  await testPool.execute(
    "UPDATE topup_bonus_rules SET bonus_points = 99 WHERE id = ?",
    ["snapshot-rule"]
  );
  await topup.markTopupRequestFailed({
    requestId: firstClaim.requestId,
    processingToken: firstClaim.processingToken,
    status: 500,
    body: { success: false, error: "retryable database failure" },
    errorCode: "DATABASE_ERROR",
  });

  const retryClaim = await topup.claimTopupRequest({
    siteId: "main",
    userId: "snapshot-user",
    idempotencyKey: "snapshot-key",
    requestFingerprint: fingerprint,
  });
  if (retryClaim.kind !== "claimed" || !retryClaim.verified) {
    throw new Error("Expected the journaled verification to be reclaimable");
  }
  assert.equal(retryClaim.verified.bonusPoints, 10);

  const completed = await topup.completeVerifiedTopup({
    requestId: retryClaim.requestId,
    processingToken: retryClaim.processingToken,
    siteId: "main",
    userId: "snapshot-user",
    ...retryClaim.verified,
    minimumAmount: 49,
    message: "Top-up completed",
  });
  assert.equal(completed.pointsAdded, 510);
  assert.equal(await scalar("SELECT points AS value FROM users WHERE id = 'snapshot-user'"), 610);
});

test("same key with a different fingerprint conflicts without crediting again", async () => {
  await seedUser("user-a");
  const firstFingerprint = topup.createTopupFingerprint(new TextEncoder().encode("slip-a"));
  const secondFingerprint = topup.createTopupFingerprint(new TextEncoder().encode("slip-b"));

  const first = await finishClaim({
    key: "conflicting-topup",
    fingerprint: firstFingerprint,
    userId: "user-a",
    transactionId: "transaction-a",
  });
  const conflict = await finishClaim({
    key: "conflicting-topup",
    fingerprint: secondFingerprint,
    userId: "user-a",
    transactionId: "transaction-b",
  });

  assert.equal(first.kind, "success");
  assert.equal(conflict.kind, "conflict");
  assert.equal(await scalar("SELECT points AS value FROM users WHERE id = 'user-a'"), 200);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM slip_history"), 1);
});

test("a lost response can be retried and returns the saved response", async () => {
  await seedUser("user-a");
  const fingerprint = topup.createTopupFingerprint(new TextEncoder().encode("slip-a"));
  const first = await finishClaim({
    key: "lost-response",
    fingerprint,
    userId: "user-a",
    transactionId: "transaction-a",
  });
  const retry = await finishClaim({
    key: "lost-response",
    fingerprint,
    userId: "user-a",
    transactionId: "transaction-a",
  });

  assert.equal(first.kind, "success");
  assert.equal(retry.kind, "success");
  assert.deepEqual(retry, first);
  assert.equal(await scalar("SELECT points AS value FROM users WHERE id = 'user-a'"), 200);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM slip_history"), 1);
});

test("the same verified slip cannot credit through a second key", async () => {
  await seedUser("user-a");
  const fingerprint = topup.createTopupFingerprint(new TextEncoder().encode("slip-a"));
  const first = await finishClaim({
    key: "first-key",
    fingerprint,
    userId: "user-a",
    transactionId: "transaction-a",
  });
  const second = await finishClaim({
    key: "second-key",
    fingerprint,
    userId: "user-a",
    transactionId: "transaction-a",
  });

  assert.equal(first.kind, "success");
  assert.equal(second.kind, "success");
  assert.deepEqual(second, first);
  assert.equal(await scalar("SELECT points AS value FROM users WHERE id = 'user-a'"), 200);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM slip_history"), 1);
});

test("the same idempotency key is isolated by site", async () => {
  await seedUser("main-user", "main");
  await seedUser("child-user", "child-shop");
  const fingerprint = topup.createTopupFingerprint(new TextEncoder().encode("same-file"));

  const [mainResult, childResult] = await Promise.all([
    finishClaim({
      key: "shared-key",
      fingerprint,
      userId: "main-user",
      siteId: "main",
      transactionId: "main-transaction",
    }),
    finishClaim({
      key: "shared-key",
      fingerprint,
      userId: "child-user",
      siteId: "child-shop",
      transactionId: "child-transaction",
    }),
  ]);

  assert.equal(mainResult.kind, "success");
  assert.equal(childResult.kind, "success");
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM slip_history"), 2);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM topup_requests"), 2);
});

test("failed completion rolls back balance and history", async () => {
  await seedUser("user-a");
  const fingerprint = topup.createTopupFingerprint(new TextEncoder().encode("slip-a"));
  const claim = await topup.claimTopupRequest({
    siteId: "main",
    userId: "missing-user",
    idempotencyKey: "rollback-key",
    requestFingerprint: fingerprint,
  });
  if (claim.kind !== "claimed") {
    throw new Error("Expected a new top-up request claim");
  }

  await assert.rejects(() =>
    topup.completeVerifiedTopup({
      requestId: claim.requestId,
      processingToken: claim.processingToken,
      siteId: "main",
      userId: "missing-user",
      transactionId: "transaction-fail",
      amount: 100,
      qrPayload: "transaction-fail",
      minimumAmount: 49,
      message: "Top-up completed",
    })
  );

  assert.equal(await scalar("SELECT points AS value FROM users WHERE id = 'user-a'"), 100);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM slip_history"), 0);
});

test("inactive buyers are rejected before a top-up request is claimed", async () => {
  await seedUser("inactive-user");
  await testPool.execute(
    "UPDATE users SET is_active = 0 WHERE id = ? AND site_id = ?",
    ["inactive-user", "main"]
  );

  await assert.rejects(
    () => topup.assertTopupBuyerActive({ siteId: "main", userId: "inactive-user" }),
    (error: unknown) =>
      error instanceof Error && error.message === "Buyer account is unavailable."
  );
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM topup_requests"), 0);
});

test("provider verification is journaled and a failed local completion can recover", async () => {
  await seedUser("user-a");
  const fingerprint = topup.createTopupFingerprint(new TextEncoder().encode("slip-a"));
  const firstClaim = await topup.claimTopupRequest({
    siteId: "main",
    userId: "user-a",
    idempotencyKey: "journaled-topup",
    requestFingerprint: fingerprint,
  });
  if (firstClaim.kind !== "claimed") {
    throw new Error("Expected a new top-up request claim");
  }

  const verified = {
    transactionId: "transaction-journaled",
    amount: 75,
    qrPayload: "reference-journaled",
  };
  await topup.saveVerifiedTopup({
    requestId: firstClaim.requestId,
    processingToken: firstClaim.processingToken,
    ...verified,
  });
  await topup.markTopupRequestFailed({
    requestId: firstClaim.requestId,
    processingToken: firstClaim.processingToken,
    status: 500,
    body: { success: false, error: "retryable database failure" },
    errorCode: "DATABASE_ERROR",
  });
  assert.equal(
    await scalar("SELECT COUNT(*) AS value FROM topup_requests WHERE failure_reason = 'ระบบบันทึกข้อมูลขัดข้อง'"),
    1
  );
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM topup_attempt_history"), 1);

  const retryClaim = await topup.claimTopupRequest({
    siteId: "main",
    userId: "user-a",
    idempotencyKey: "journaled-topup",
    requestFingerprint: fingerprint,
  });
  if (retryClaim.kind !== "claimed") {
    throw new Error("Expected the failed request to be reclaimed");
  }
  assert.deepEqual(retryClaim.verified, {
    ...verified,
    bonusRuleId: null,
    bonusPoints: 0,
    creditedPoints: 75,
  });

  await topup.completeVerifiedTopup({
    requestId: retryClaim.requestId,
    processingToken: retryClaim.processingToken,
    siteId: "main",
    userId: "user-a",
    ...verified,
    minimumAmount: 49,
    message: "Top-up completed",
  });

  assert.equal(await scalar("SELECT points AS value FROM users WHERE id = 'user-a'"), 175);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM slip_history"), 1);
  assert.equal(
    await scalar("SELECT COUNT(*) AS value FROM topup_requests WHERE status = 'SUCCEEDED'"),
    1
  );
});

test("manual point credit writes success history and an automatic receipt", async () => {
  await seedUser("user-a", "main", 25);
  const connection = await testPool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      "UPDATE users SET points = points + ?, total_topup_amount = total_topup_amount + ?, topup_count = topup_count + 1, last_topup_at = NOW(6) WHERE id = ? AND site_id = ?",
      [75, 75, "user-a", "main"]
    );
    await topup.insertManualTopupHistory(connection, {
      userId: "user-a",
      siteId: "main",
      amount: 75,
    });
    await connection.commit();
  } finally {
    connection.release();
  }

  assert.equal(await scalar("SELECT points AS value FROM users WHERE id = 'user-a'"), 100);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM slip_history WHERE status = 'success'"), 1);
  assert.equal(await scalar("SELECT amount AS value FROM slip_history WHERE user_id = 'user-a'"), 75);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM slip_history WHERE source_type = 'ADMIN'"), 1);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM topup_cash_receipts WHERE user_id = 'user-a'"), 1);
  assert.equal(await scalar("SELECT amount_paid AS value FROM topup_cash_receipts WHERE user_id = 'user-a'"), 75);
  assert.equal(await scalar("SELECT bonus_points AS value FROM topup_cash_receipts WHERE user_id = 'user-a'"), 0);
  const listedReceipts = await topupReceipts.listTopupCashReceiptsForAdmin({
    siteId: "main",
    page: 1,
    limit: 20,
  });
  assert.equal(listedReceipts.total, 1);
  assert.equal(listedReceipts.rows[0]?.receipt.amountPaid, 75);
  assert.equal(listedReceipts.rows[0]?.sourceType, "ADMIN");
  assert.equal(listedReceipts.rows[0]?.receipt.lines[0]?.productName, topupReceipts.TOPUP_RECEIPT_PRODUCT_NAME);
});

test("admin and superadmin manual credits are excluded from top-up history", () => {
  assert.equal(topup.shouldRecordManualTopupHistory(true), false);
  assert.equal(topup.shouldRecordManualTopupHistory(false), true);
});
