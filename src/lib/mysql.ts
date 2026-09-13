import mysql from "mysql2/promise";

type MysqlGlobal = typeof globalThis & {
  __storeByMariMysqlPool?: ReturnType<typeof mysql.createPool>;
};

export type MysqlConfig = {
  host: string;
  user: string;
  password: string;
  database: string;
  port: number;
};

type MysqlConfigOptions = {
  allowMissing?: boolean;
};

/**
 * Read the runtime database configuration without falling back to a local or
 * previously deployed database.  Passwords are intentionally not trimmed so
 * that a deliberately configured leading/trailing space remains valid.
 */
export function getMysqlConfig(
  env: Record<string, string | undefined> = process.env,
  options: MysqlConfigOptions = {},
): MysqlConfig {
  const requiredKeys = ["DB_HOST", "DB_USER", "DB_NAME"] as const;
  const missing = requiredKeys.filter((key) => !env[key]?.trim());
  const allowMissing = options.allowMissing === true;
  if (missing.length > 0 && !allowMissing) {
    throw new Error(`Database configuration is missing: ${missing.join(", ")}`);
  }

  const password = env.DB_PASSWORD ?? "";
  if (!allowMissing && env.NODE_ENV === "production" && password.length === 0) {
    throw new Error("Database configuration is missing: DB_PASSWORD");
  }

  const portText = env.DB_PORT?.trim() || "3306";
  if (!/^\d+$/.test(portText)) {
    throw new Error("Database configuration requires DB_PORT to be a valid TCP port");
  }
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Database configuration requires DB_PORT to be a valid TCP port");
  }

  return {
    host: env.DB_HOST?.trim() ?? "",
    user: env.DB_USER?.trim() ?? "",
    password,
    database: env.DB_NAME?.trim() ?? "",
    port,
  };
}

const globalForMysql = globalThis as MysqlGlobal;
const mysqlConfig = getMysqlConfig(process.env, {
  // Pure unit tests and local tooling can import helpers without a live DB;
  // production remains fail-fast and never receives credential fallbacks.
  allowMissing: process.env.NODE_ENV !== "production",
});

const pool =
  globalForMysql.__storeByMariMysqlPool ??
  mysql.createPool({
    ...mysqlConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: "+07:00",
  });

// Next.js can re-evaluate server modules during development hot reload. Reuse
// the same pool so each reload does not reserve another set of DB connections.
if (process.env.NODE_ENV !== "production") {
  globalForMysql.__storeByMariMysqlPool = pool;
}

export default pool;
