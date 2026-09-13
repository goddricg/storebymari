const { randomBytes } = require("node:crypto");
const mysql = require("mysql2/promise");

const REQUIRED_CONFIG_KEYS = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];
const REQUIRED_TARGET = "storebymari.com";

function validateConfig(env) {
  if (env.DB_PROBE_TARGET !== REQUIRED_TARGET) {
    throw new Error(`DB probe blocked: set DB_PROBE_TARGET=${REQUIRED_TARGET} to acknowledge the target.`);
  }

  for (const key of REQUIRED_CONFIG_KEYS) {
    if (typeof env[key] !== "string" || env[key].trim() === "") {
      throw new Error(`DB probe configuration requires ${key}.`);
    }
  }

  let port = 3306;
  if (env.DB_PORT !== undefined && env.DB_PORT !== "") {
    port = Number(env.DB_PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("DB probe configuration requires DB_PORT to be a valid TCP port.");
    }
  }

  return {
    host: env.DB_HOST,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    port,
  };
}

async function runProductionDbProbe({ env = process.env, connectionFactory = mysql.createConnection } = {}) {
  const config = validateConfig(env);
  if (typeof connectionFactory !== "function") {
    throw new Error("DB probe requires a connection factory.");
  }

  let connection;
  let temporaryTableName;
  let transactionMayBeOpen = false;
  let failureStage;
  let cleanupFailed = false;
  let stage = "connection";

  try {
    connection = await connectionFactory(config);

    stage = "connectivity check";
    const [pingRows] = await connection.query("SELECT 1 AS probe_ok");
    if (!Array.isArray(pingRows) || Number(pingRows[0]?.probe_ok) !== 1) {
      throw new Error("Connectivity check did not return the expected result.");
    }

    stage = "identity check";
    const [identityRows] = await connection.query("SELECT DATABASE() AS current_database");
    if (!Array.isArray(identityRows) || identityRows[0]?.current_database !== config.database) {
      throw new Error("Connected database identity did not match the configured database.");
    }

    temporaryTableName = `codex_probe_${randomBytes(12).toString("hex")}`;
    stage = "temporary table setup";
    await connection.query(
      `CREATE TEMPORARY TABLE \`${temporaryTableName}\` (` +
        "probe_id CHAR(48) NOT NULL PRIMARY KEY, probe_value CHAR(48) NOT NULL)"
    );

    stage = "write round-trip";
    transactionMayBeOpen = true;
    await connection.beginTransaction();
    const marker = randomBytes(24).toString("hex");
    await connection.execute(
      `INSERT INTO \`${temporaryTableName}\` (probe_id, probe_value) VALUES (?, ?)`,
      [marker, marker]
    );
    const [roundTripRows] = await connection.execute(
      `SELECT probe_value FROM \`${temporaryTableName}\` WHERE probe_id = ?`,
      [marker]
    );
    if (!Array.isArray(roundTripRows) || roundTripRows[0]?.probe_value !== marker) {
      throw new Error("Temporary-table write round-trip did not return the inserted value.");
    }

    await connection.rollback();
    transactionMayBeOpen = false;
  } catch (_error) {
    // Driver errors can include connection details; retain only the safe stage label.
    failureStage = stage;
  } finally {
    if (connection) {
      if (transactionMayBeOpen) {
        try {
          await connection.rollback();
        } catch (_error) {
          cleanupFailed = true;
        }
      }

      if (temporaryTableName) {
        try {
          await connection.query(`DROP TEMPORARY TABLE IF EXISTS \`${temporaryTableName}\``);
        } catch (_error) {
          cleanupFailed = true;
        }
      }

      try {
        await connection.end();
      } catch (_error) {
        cleanupFailed = true;
      }
    }
  }

  if (failureStage) {
    throw new Error(`DB probe ${failureStage} failed; connection details redacted.`);
  }
  if (cleanupFailed) {
    throw new Error("DB probe cleanup failed; connection details redacted.");
  }

  return { ok: true };
}

module.exports = { runProductionDbProbe };

if (require.main === module) {
  runProductionDbProbe()
    .then(() => console.log("Production database probe passed for the acknowledged target."))
    .catch(() => {
      console.error("Production database probe failed; connection details redacted.");
      process.exitCode = 1;
    });
}
