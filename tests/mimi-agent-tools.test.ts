import assert from "node:assert/strict";
import { test } from "node:test";
import { executeMimiTool, getMimiToolDeclarations, type MimiToolDependencies } from "../src/lib/mimi/agent-tools";

const admin = { audience: "admin" as const, siteId: "main" };
const customer = { audience: "customer" as const, siteId: "child1" };
const now = () => new Date("2026-09-10T18:00:00Z");
function mock(rows: Record<string, unknown>[] = []) {
  const calls: { sql: string; params: (string | number)[] }[] = [];
  const deps: MimiToolDependencies = { now, query: async (sql, params) => { calls.push({ sql, params }); return rows; } };
  return { calls, deps };
}

test("customer declarations and execution prohibit private database tools", async () => {
  const { calls, deps } = mock();
  assert.deepEqual(getMimiToolDeclarations("customer").map(tool => tool.name), ["search_products", "show_product_cards", "list_categories", "search_knowledge"]);
  for (const name of ["list_orders", "find_customers", "list_support_cases", "list_topup_statuses", "execute_sql", "get_revenue"]) {
    assert.equal((await executeMimiTool(name, {}, customer, deps)).status, "forbidden");
  }
  assert.equal(calls.length, 0);
});

test("guest LINE tier cannot execute internal tools even when a model requests one", async () => {
  const { calls, deps } = mock();
  const result = await executeMimiTool("list_orders", {}, { audience: "admin", siteId: "main", tier: "E" }, deps);
  assert.equal(result.status, "forbidden");
  assert.equal(calls.length, 0);
});

test("tenant override, unknown fields, invalid pagination and malformed dates fail before querying", async () => {
  const { calls, deps } = mock();
  for (const args of [{ siteId: "other" }, { limit: -1 }, { limit: "5" }, { offset: 10001 }, { startDate: "2026-02-30" }, { startDate: "2026-09-10", endDate: "2026-09-09" }, { startDate: "2024-01-01", endDate: "2026-01-01" }, { groupBy: "profit" }]) {
    assert.equal((await executeMimiTool("summarize_orders", args, admin, deps)).status, "error");
  }
  assert.equal(calls.length, 0);
});

test("product lookup scopes tenant, escapes wildcard search, computes authoritative stock and removes inventory", async () => {
  const { calls, deps } = mock([
    { id: "p1", name: "Example", stock: 99, account_data: JSON.stringify([{ email: "synthetic@example.test", password: "secret" }]), account_email: null, account_password: null, api_provider_id: null, selling_price: "49", cost_price: 20 },
    { id: "p2", stock: 99, account_data: "[]", account_email: null, account_password: null, api_provider_id: null, selling_price: "30" },
    { id: "p3", stock: 8, account_data: "[]", account_email: null, account_password: null, api_provider_id: "provider", selling_price: "10" },
  ]);
  const result = await executeMimiTool("search_products", { query: "A_%" }, customer, deps);
  assert.equal(result.status, "ok");
  const data = result.data as { items: { stock: number; sellingPrice: number }[] };
  assert.deepEqual(data.items.map(item => item.stock), [1, 0, 8]);
  assert.equal(data.items[0].sellingPrice, 49);
  assert.deepEqual(calls[0].params.slice(0, 3), ["child1", "child1", "%A!_!%%"]);
  assert.match(calls[0].sql, /p\.site_id = \?/);
  assert.doesNotMatch(JSON.stringify(result), /secret|synthetic|account_data|cost_price|provider/);
});

test("database error cannot become an empty success or expose raw error", async () => {
  const failed = await executeMimiTool("search_products", {}, customer, { now, query: async () => { throw new Error("password=private"); } });
  assert.equal(failed.status, "error");
  assert.equal(failed.data, undefined);
  assert.doesNotMatch(JSON.stringify(failed), /private/);
  const empty = await executeMimiTool("search_products", {}, customer, mock().deps);
  assert.equal(empty.status, "ok");
  assert.deepEqual((empty.data as { items: unknown[] }).items, []);
});

test("order summaries use Thai calendar boundaries, independent total and count-only projections", async () => {
  const calls: { sql: string; params: (string | number)[] }[] = [];
  const result = await executeMimiTool("summarize_orders", { groupBy: "product", limit: 1 }, admin, { now, query: async (sql, params) => {
    calls.push({ sql, params });
    return calls.length === 1 ? [{ total: 15, purchaseCases: 9 }] : [{ label: "A", count: 10 }, { label: "B", count: 5 }];
  } });
  const data = result.data as { total: number; hasMore: boolean; items: unknown[]; range: { startDate: string } };
  assert.equal(data.total, 15);
  assert.equal(data.items.length, 1);
  assert.equal(data.hasMore, true);
  assert.equal(data.range.startDate, "2026-09-11");
  assert.deepEqual(calls[0].params, ["main", "2026-09-11 00:00:00", "2026-09-12 00:00:00"]);
  for (const call of calls) {
    assert.match(call.sql, /site_id = \?/);
    assert.doesNotMatch(call.sql, /price|profit|revenue|cost|account_password/i);
  }
});

test("exact order and customer lookup do not silently restrict to today's records", async () => {
  const { calls, deps } = mock([{ id: "order", price: 100, raw_response: "secret", buyer_email: "private@example.test" }]);
  const result = await executeMimiTool("list_orders", { orderId: "case-id" }, admin, deps);
  assert.equal(result.status, "ok");
  assert.doesNotMatch(calls[0].sql, /created_at >=/);
  assert.deepEqual(calls[0].params.slice(0, 3), ["main", "case-id", "case-id"]);
  assert.doesNotMatch(JSON.stringify(result), /price|secret|private/);
});

test("case and customer output allowlists exclude financial, free-text and credential fields", async () => {
  const { calls, deps } = mock([{ id: "x", status: "pending", points: 100, admin_response: "password secret", problem_description: "cost 99", password_hash: "hash", total_topup_amount: 88 }]);
  for (const [tool, args] of [["list_support_cases", { caseId: "C1" }], ["find_customers", { query: "Test" }]] as const) {
    const result = await executeMimiTool(tool, args, admin, deps);
    assert.equal(result.status, "ok");
    assert.doesNotMatch(JSON.stringify(result), /points|password|secret|cost|topup|hash/);
  }
  calls.forEach(call => assert.match(call.sql, /site_id = \?/));
});

test("knowledge reads only saved active site-scoped rules, without initialization or fabricated defaults", async () => {
  const { calls, deps } = mock([{ value: JSON.stringify([
    { id: "r1", isActive: true, category: "troubleshooting", situation: "Netflix screen", guidance: "Check assigned profile", createdBy: "private" },
    { id: "r2", isActive: false, situation: "Netflix", guidance: "Outdated" },
  ]) }]);
  const result = await executeMimiTool("search_knowledge", { query: "Netflix" }, customer, deps);
  assert.equal(result.status, "ok");
  assert.equal((result.data as { total: number }).total, 1);
  assert.doesNotMatch(JSON.stringify(result), /private|Outdated/);
  assert.match(calls[0].sql, /^SELECT/);
  assert.deepEqual(calls[0].params, ["child1", "child1", "child1"]);
  const empty = await executeMimiTool("search_knowledge", {}, customer, mock().deps);
  assert.deepEqual((empty.data as { items: unknown[] }).items, []);
});


test("topup status is available without loading or returning amounts or payment payloads", async () => {
  const {calls, deps} = mock([{id:"r",status:"SUCCEEDED", amount:500, failure_reason:"private", saved_response:"secret"}]);
  const result = await executeMimiTool("list_topup_statuses", {requestId:"r"}, admin, deps);
  assert.equal(result.status, "ok");
  assert.doesNotMatch(calls[0].sql, /amount|balance|failure_reason|saved_response/);
  assert.doesNotMatch(JSON.stringify(result), /500|private|secret/);
});
