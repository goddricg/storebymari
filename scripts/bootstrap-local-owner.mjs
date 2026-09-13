import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

const expectedLocalDatabase = {
  NODE_ENV: "development",
  DB_HOST: "127.0.0.1",
  DB_PORT: "3307",
  DB_NAME: "storebymari_demo",
};

function assertLocalOnlyTarget() {
  for (const [key, expected] of Object.entries(expectedLocalDatabase)) {
    if (process.env[key] !== expected) {
      const error = new Error("unsafe_local_target");
      error.code = "unsafe_local_target";
      throw error;
    }
  }
  if (!process.env.DB_USER || !process.env.DB_PASSWORD) {
    const error = new Error("local_database_credentials_missing");
    error.code = "local_database_credentials_missing";
    throw error;
  }
}

async function connectLocalDatabase() {
  assertLocalOnlyTarget();
  return mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT),
    connectTimeout: 3000,
    timezone: "+07:00",
  });
}

async function preflight() {
  const connection = await connectLocalDatabase();
  try {
    await connection.query("SELECT COUNT(*) AS count FROM users WHERE site_id = 'main'");
    process.stdout.write("LOCAL_OWNER_PREFLIGHT_OK\n");
  } finally {
    await connection.end();
  }
}

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const encodedPayload = Buffer.concat(chunks).toString("ascii").trim();
  for (const chunk of chunks) chunk.fill(0);
  if (!encodedPayload) {
    const error = new Error("input_incomplete");
    error.code = "input_incomplete";
    throw error;
  }
  let credentials;
  const decodedPayload = Buffer.from(encodedPayload, "base64");
  try {
    credentials = JSON.parse(decodedPayload.toString("utf8"));
  } catch {
    const error = new Error("input_invalid");
    error.code = "input_invalid";
    throw error;
  } finally {
    decodedPayload.fill(0);
  }
  const email = typeof credentials?.email === "string"
    ? credentials.email.trim().toLowerCase()
    : "";
  const password = typeof credentials?.password === "string"
    ? credentials.password
    : process.env.DB_PASSWORD;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error("invalid_email");
    error.code = "invalid_email";
    throw error;
  }
  if (password.length < 8) {
    const error = new Error("password_too_short");
    error.code = "password_too_short";
    throw error;
  }
  return { email, password };
}

async function verifyLocalAdminAccess(email, password) {
  const result = {
    loginApi: "not_verified",
    adminUsersApi: "not_run",
    adminPage: "not_run",
  };

  try {
    const loginResponse = await fetch("http://127.0.0.1:3000/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(15000),
    });
    const loginBody = await loginResponse.json();
    if (
      !loginResponse.ok ||
      loginBody?.user?.role !== "superadmin" ||
      !loginBody?.token
    ) {
      result.loginApi = `failed_${loginResponse.status}`;
      return result;
    }

    result.loginApi = "verified";
    const authorization = { authorization: `Bearer ${loginBody.token}` };
    const adminApiResponse = await fetch("http://127.0.0.1:3000/api/admin/users", {
      headers: authorization,
      signal: AbortSignal.timeout(15000),
    });
    result.adminUsersApi = adminApiResponse.ok
      ? "verified"
      : `failed_${adminApiResponse.status}`;
    await adminApiResponse.body?.cancel();

    const adminPageResponse = await fetch("http://127.0.0.1:3000/admin", {
      headers: authorization,
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
    });
    result.adminPage = adminPageResponse.status === 200
      ? "verified"
      : `failed_${adminPageResponse.status}`;
    await adminPageResponse.body?.cancel();

    loginBody.token = undefined;
    return result;
  } catch {
    result.loginApi = result.loginApi === "verified" ? result.loginApi : "unavailable";
    return result;
  }
}

async function createOrPromoteLocalOwner() {
  const { email, password } = await readInput();
  const connection = await connectLocalDatabase();
  let action = "created";
  let passwordHash = "";

  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT id, password_hash, role, is_admin, is_active, is_banned
       FROM users WHERE email = ? AND site_id = ? LIMIT 2 FOR UPDATE`,
      [email, "main"],
    );

    if (rows.length > 1) {
      const error = new Error("duplicate_local_owner_accounts");
      error.code = "duplicate_local_owner_accounts";
      throw error;
    }

    if (rows.length === 0) {
      passwordHash = await bcrypt.hash(password, 10);
      const now = new Date();
      await connection.execute(
        `INSERT INTO users (
          id, email, password_hash, display_name, role, is_admin, is_active,
          points, user_tier, site_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(), email, passwordHash, "Owner", "superadmin", 1, 1,
          0, "walkin", "main", now, now,
        ],
      );
    } else {
      const existing = rows[0];
      if (
        typeof existing.password_hash !== "string" ||
        !(await bcrypt.compare(password, existing.password_hash))
      ) {
        const error = new Error("existing_account_password_mismatch");
        error.code = "existing_account_password_mismatch";
        throw error;
      }

      passwordHash = existing.password_hash;
      const isReady =
        existing.role === "superadmin" &&
        Number(existing.is_admin) === 1 &&
        Number(existing.is_active) === 1 &&
        Number(existing.is_banned) === 0;
      if (isReady) {
        action = "already_ready";
      } else {
        action = "promoted";
        await connection.execute(
          `UPDATE users
           SET display_name = 'Owner', role = 'superadmin', is_admin = 1,
               is_active = 1, is_banned = 0, updated_at = ?
           WHERE id = ? AND site_id = ?`,
          [new Date(), existing.id, "main"],
        );
      }
    }

    await connection.commit();

    const [verifiedRows] = await connection.execute(
      `SELECT password_hash, role, is_admin, is_active, is_banned
       FROM users WHERE email = ? AND site_id = ? LIMIT 2`,
      [email, "main"],
    );
    const verified =
      verifiedRows.length === 1 &&
      verifiedRows[0].role === "superadmin" &&
      Number(verifiedRows[0].is_admin) === 1 &&
      Number(verifiedRows[0].is_active) === 1 &&
      Number(verifiedRows[0].is_banned) === 0 &&
      (await bcrypt.compare(password, verifiedRows[0].password_hash));
    if (!verified) {
      const error = new Error("post_write_verification_failed");
      error.code = "post_write_verification_failed";
      throw error;
    }

    const access = await verifyLocalAdminAccess(email, password);
    process.stdout.write(
      `${JSON.stringify({ action, role: "superadmin", site: "main", accountVerified: true, ...access })}\n`,
    );
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    passwordHash = "";
    await connection.end();
  }
}

async function main() {
  try {
    if (process.argv.includes("--check")) {
      await preflight();
      return;
    }
    await createOrPromoteLocalOwner();
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "bootstrap_failed";
    process.stderr.write(`LOCAL_OWNER_BOOTSTRAP_FAILED: ${code}\n`);
    process.exitCode = 1;
  }
}

await main();
