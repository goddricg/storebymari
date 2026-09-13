import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createDB } from "mysql-memory-server";
import mysql, { type Pool } from "mysql2/promise";
import { executeMimiTool, type MimiToolDependencies } from "../src/lib/mimi/agent-tools";

let db: Awaited<ReturnType<typeof createDB>>;
let pool: Pool;
let deps: MimiToolDependencies;
const context = {audience: "admin" as const, siteId: "main"};

before(async () => {
  // An isolated disposable server, never the configured application database.
  db = await createDB({version:"8.4.x", dbName:"mimi_agent_test", downloadBinaryOnce:true, xEnabled:"OFF"});
  pool = mysql.createPool({host:"127.0.0.1", user:db.username, password:"", port:db.port, database:db.dbName});
  await pool.query(`CREATE TABLE orders (
    id VARCHAR(64) PRIMARY KEY, site_id VARCHAR(64), case_order_id VARCHAR(64),
    product_name VARCHAR(100), buyer_user_id VARCHAR(64), created_at DATETIME
  )`);
  await pool.query(`INSERT INTO orders VALUES
    ('1','main','checkout-a','Netflix','u1','2026-09-09 23:59:59'),
    ('2','main','checkout-b','Netflix','u1','2026-09-10 00:00:00'),
    ('3','main','checkout-b','Netflix','u1','2026-09-10 23:59:59'),
    ('4','main','checkout-c','Netflix','u1','2026-09-11 00:00:00'),
    ('5','child1','checkout-d','Netflix','u1','2026-09-10 12:00:00')`);
  await pool.query("CREATE TABLE settings (`key` VARCHAR(100), value TEXT, site_id VARCHAR(64))");
  for (const site of ["main", "child1"]) {
    await pool.execute("INSERT INTO settings VALUES ('mimi_knowledge_base', ?, ?)", [JSON.stringify([
      {id:site, isActive:true, category:"troubleshooting", situation:"Netflix", guidance:`guide-${site}`},
    ]),site]);
  }
  deps = {
    now: () => new Date("2026-09-10T05:00:00Z"),
    query: async (sql, params) => {
      const [rows] = await pool.execute(sql, params);
      return rows as Record<string, unknown>[];
    },
  };
});
after(async () => { if (pool) await pool.end(); if (db) await db.stop(); });

test("real MySQL excludes neighboring days and tenants and counts checkout cases separately", async () => {
  const result = await executeMimiTool("summarize_orders", {product:"Netflix",startDate:"2026-09-10",limit:1},context,deps);
  assert.equal(result.status,"ok");
  const data = result.data as {total:number;purchaseCases:number;items:{label:string;count:number}[]};
  assert.equal(data.total,2);
  assert.equal(data.purchaseCases,1);
  assert.deepEqual(data.items,[{label:"Netflix",count:2}]);
});
test("real MySQL prepared search treats SQL and wildcard payload as literal text", async () => {
  const result = await executeMimiTool("summarize_orders",{product:"%' OR 1=1 --"},context,deps);
  assert.equal(result.status,"ok");
  assert.equal((result.data as {total:number}).total,0);
});
test("real MySQL knowledge lookup isolates site-scoped saved guidance", async () => {
  const result = await executeMimiTool("search_knowledge",{query:"Netflix"},context,deps);
  assert.equal(result.status,"ok");
  assert.match(JSON.stringify(result.data),/guide-main/);
  assert.doesNotMatch(JSON.stringify(result.data),/guide-child1/);
});
