import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

const EXPECTED_TARGET = "storebymari.com";
const SITE_ID = "main";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function getDatabaseConfig() {
  if (process.env.NODE_ENV && process.env.NODE_ENV !== "production") {
    fail("production_environment_required");
  }
  if (process.env.PRODUCTION_ACCOUNT_TARGET !== EXPECTED_TARGET) {
    fail("target_acknowledgement_required");
  }

  for (const key of ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"]) {
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

function getAccountInput() {
  const email = normalizeEmail(process.env.PRODUCTION_ACCOUNT_EMAIL);
  const password = typeof process.env.PRODUCTION_ACCOUNT_PASSWORD === "string"
    ? process.env.PRODUCTION_ACCOUNT_PASSWORD
    : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("invalid_email");
  if (password.length < 8) fail("password_too_short");

  return { email, password };
}

async function provision() {
  const config = getDatabaseConfig();
  const { email, password } = getAccountInput();
  const connection = await mysql.createConnection({
    ...config,
    timezone: "+07:00",
    connectTimeout: 5000,
  });
  let transactionOpen = false;
  let action = "created";

  try {
    await connection.beginTransaction();
    transactionOpen = true;

    const [rows] = await connection.execute(
      `SELECT id, password_hash, role, is_admin, is_active, is_banned
       FROM users
       WHERE email = ? AND site_id = ?
       LIMIT 2 FOR UPDATE`,
      [email, SITE_ID],
    );

    if (rows.length > 1) fail("duplicate_accounts");

    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();

    if (rows.length === 0) {
      await connection.execute(
        `INSERT INTO users (
           id, email, password_hash, display_name, is_admin, role, is_active,
           is_banned, points, user_tier, site_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 0, 'user', 1, 0, 0, 'walkin', ?, ?, ?)`,
        [randomUUID(), email, passwordHash, "StoreByMari User", SITE_ID, now, now],
      );
    } else {
      action = "password_reset_and_reactivated";
      await connection.execute(
        `UPDATE users
         SET password_hash = ?, is_active = 1, is_banned = 0, updated_at = ?
         WHERE id = ? AND site_id = ?`,
        [passwordHash, now, rows[0].id, SITE_ID],
      );
    }

    await connection.commit();
    transactionOpen = false;

    const [verifiedRows] = await connection.execute(
      `SELECT password_hash, role, is_admin, is_active, is_banned
       FROM users
       WHERE email = ? AND site_id = ?
       LIMIT 2`,
      [email, SITE_ID],
    );
    const verified = verifiedRows.length === 1
      && await bcrypt.compare(password, verifiedRows[0].password_hash)
      && Number(verifiedRows[0].is_active) === 1
      && Number(verifiedRows[0].is_banned) === 0;

    if (!verified) fail("post_write_verification_failed");

    process.stdout.write(JSON.stringify({
      target: EXPECTED_TARGET,
      site: SITE_ID,
      action,
      accountVerified: true,
      role: verifiedRows[0].role || "user",
      isAdmin: Number(verifiedRows[0].is_admin) === 1,
    }) + "\n");
  } catch (error) {
    if (transactionOpen) await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    await connection.end();
  }
}

try {
  await provision();
} catch (error) {
  const code = typeof error?.code === "string" ? error.code : "database_operation_failed";
  process.stderr.write(`PRODUCTION_ACCOUNT_PROVISION_FAILED: ${code}\n`);
  process.exitCode = 1;
}
