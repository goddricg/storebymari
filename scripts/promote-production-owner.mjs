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

function getTargetEmail() {
  const email = normalizeEmail(process.env.PRIMARY_SUPER_ADMIN_EMAIL);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("invalid_primary_owner_email");
  return email;
}

function getDatabaseConfig() {
  if (process.env.NODE_ENV && process.env.NODE_ENV !== "production") {
    fail("production_environment_required");
  }
  if (process.env.OWNER_PROMOTION_TARGET?.trim().toLowerCase() !== EXPECTED_TARGET) {
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

function isReady(row) {
  return (
    row?.role === "owner" &&
    Number(row?.is_admin) === 1 &&
    Number(row?.is_active) === 1 &&
    Number(row?.is_banned) === 0
  );
}

async function promote() {
  const config = getDatabaseConfig();
  const email = getTargetEmail();
  const connection = await mysql.createConnection({
    ...config,
    timezone: "+07:00",
    connectTimeout: 5000,
  });
  let transactionOpen = false;

  try {
    await connection.beginTransaction();
    transactionOpen = true;

    const [rows] = await connection.execute(
      `SELECT id, role, is_admin, is_active, is_banned
       FROM users
       WHERE email = ? AND site_id = ?
       LIMIT 2 FOR UPDATE`,
      [email, SITE_ID],
    );

    if (rows.length === 0) fail("target_account_not_found");
    if (rows.length > 1) fail("duplicate_target_accounts");
    if (Number(rows[0].is_active) !== 1 || Number(rows[0].is_banned) !== 0) {
      fail("target_account_not_active");
    }

    await connection.execute(
      `UPDATE users
       SET role = 'owner', is_admin = 1, updated_at = ?
       WHERE id = ? AND site_id = ?`,
      [new Date(), rows[0].id, SITE_ID],
    );

    await connection.commit();
    transactionOpen = false;

    const [verifiedRows] = await connection.execute(
      `SELECT role, is_admin, is_active, is_banned
       FROM users
       WHERE email = ? AND site_id = ?
       LIMIT 2`,
      [email, SITE_ID],
    );

    if (verifiedRows.length !== 1 || !isReady(verifiedRows[0])) {
      fail("post_write_verification_failed");
    }

    process.stdout.write(JSON.stringify({
      target: EXPECTED_TARGET,
      site: SITE_ID,
      role: "owner",
      isAdmin: true,
      accountVerified: true,
      passwordChanged: false,
    }) + "\n");
  } catch (error) {
    if (transactionOpen) await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    await connection.end();
  }
}

try {
  await promote();
} catch (error) {
  const code = typeof error?.code === "string" ? error.code : "database_operation_failed";
  process.stderr.write(`PRODUCTION_OWNER_PROMOTION_FAILED: ${code}\n`);
  process.exitCode = 1;
}
