import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config({ path: resolve(process.cwd(), ".env"), quiet: true });

const EXPECTED_TARGET = "storebymari.com";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function assertTarget() {
  const targetIndex = process.argv.indexOf("--target");
  const target = targetIndex >= 0 ? process.argv[targetIndex + 1] : "";
  if (target !== EXPECTED_TARGET) fail("target_acknowledgement_required");
}

function getDatabaseConfig() {
  if (process.env.NODE_ENV !== "production") fail("production_environment_required");

  const required = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];
  for (const key of required) {
    if (!process.env[key]?.trim()) fail(`missing_${key.toLowerCase()}`);
  }

  const port = Number(process.env.DB_PORT || "3306");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail("invalid_db_port");
  }

  return {
    host: process.env.DB_HOST.trim(),
    user: process.env.DB_USER.trim(),
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME.trim(),
    port,
  };
}

async function readOwnerInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));

  let encodedPayload = Buffer.concat(chunks).toString("ascii").trim();
  for (const chunk of chunks) chunk.fill(0);
  if (!encodedPayload) fail("input_incomplete");

  const decodedPayload = Buffer.from(encodedPayload, "base64");
  encodedPayload = "";

  try {
    const credentials = JSON.parse(decodedPayload.toString("utf8"));
    const email = normalizeEmail(credentials?.email);
    const password = typeof credentials?.password === "string" ? credentials.password : "";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("invalid_email");
    if (password.length < 8) fail("password_too_short");

    return { email, password };
  } catch (error) {
    if (error?.code) throw error;
    fail("input_invalid");
  } finally {
    decodedPayload.fill(0);
  }
}

function isReady(row, passwordMatches) {
  return (
    row?.role === "owner" &&
    Number(row?.is_admin) === 1 &&
    Number(row?.is_active) === 1 &&
    Number(row?.is_banned) === 0 &&
    passwordMatches
  );
}

async function preflight() {
  assertTarget();
  const config = getDatabaseConfig();
  const connection = await mysql.createConnection({ ...config, timezone: "+07:00", connectTimeout: 5000 });

  try {
    const [rows] = await connection.execute(
      `SELECT COUNT(*) AS owner_count
       FROM users
       WHERE site_id = 'main' AND role = 'owner' AND is_admin = 1
         AND is_active = 1 AND is_banned = 0`,
    );
    process.stdout.write(JSON.stringify({
      target: EXPECTED_TARGET,
      databaseConnectivity: "verified",
      ownerCount: Number(rows[0]?.owner_count ?? 0),
    }) + "\n");
  } finally {
    await connection.end();
  }
}

async function bootstrap() {
  assertTarget();
  const config = getDatabaseConfig();
  const { email, password } = await readOwnerInput();
  const primaryEmail = normalizeEmail(process.env.PRIMARY_SUPER_ADMIN_EMAIL);
  if (!primaryEmail || primaryEmail !== email) fail("primary_owner_email_mismatch");

  const connection = await mysql.createConnection({ ...config, timezone: "+07:00", connectTimeout: 5000 });
  let transactionOpen = false;
  let action = "created";

  try {
    await connection.beginTransaction();
    transactionOpen = true;

    const [rows] = await connection.execute(
      `SELECT id, password_hash, role, is_admin, is_active, is_banned
       FROM users
       WHERE email = ? AND site_id = 'main'
       LIMIT 2 FOR UPDATE`,
      [email],
    );

    if (rows.length > 1) fail("duplicate_owner_accounts");

    if (rows.length === 0) {
      const now = new Date();
      const passwordHash = await bcrypt.hash(password, 12);
      await connection.execute(
        `INSERT INTO users (
           id, email, password_hash, display_name, role, is_admin, is_active,
           is_banned, points, user_tier, site_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 'owner', 1, 1, 0, 0, 'walkin', 'main', ?, ?)`,
        [randomUUID(), email, passwordHash, "Owner", now, now],
      );
    } else {
      action = "promoted_and_password_updated";
      await connection.execute(
        `UPDATE users
         SET password_hash = ?, role = 'owner', is_admin = 1,
             is_active = 1, is_banned = 0, updated_at = ?
         WHERE id = ? AND site_id = 'main'`,
        [await bcrypt.hash(password, 12), new Date(), rows[0].id],
      );
    }

    await connection.commit();
    transactionOpen = false;

    const [verifiedRows] = await connection.execute(
      `SELECT password_hash, role, is_admin, is_active, is_banned
       FROM users
       WHERE email = ? AND site_id = 'main'
       LIMIT 2`,
      [email],
    );
    const passwordMatches = verifiedRows.length === 1
      ? await bcrypt.compare(password, verifiedRows[0].password_hash)
      : false;

    if (verifiedRows.length !== 1 || !isReady(verifiedRows[0], passwordMatches)) {
      fail("post_write_verification_failed");
    }

    process.stdout.write(JSON.stringify({
      target: EXPECTED_TARGET,
      site: "main",
      action,
      role: "owner",
      accountVerified: true,
    }) + "\n");
  } catch (error) {
    if (transactionOpen) await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    await connection.end();
  }
}

async function main() {
  try {
    if (process.argv.includes("--check")) {
      await preflight();
      return;
    }
    await bootstrap();
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "database_operation_failed";
    process.stderr.write(`PRODUCTION_OWNER_BOOTSTRAP_FAILED: ${code}\n`);
    process.exitCode = 1;
  }
}

await main();
