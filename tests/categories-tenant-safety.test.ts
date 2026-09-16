import assert from "node:assert/strict";
import { test } from "node:test";

import pool from "../src/lib/mysql";
import {
  buildCategoryScopePredicate,
  createCategory,
  deleteCategory,
  getAllCategoriesIncludingInactive,
  updateCategory,
  type CategoryScope,
} from "../src/lib/categories/repository";

type QueryCall = {
  sql: string;
  params: unknown[];
};

type QueryResult = readonly [unknown, unknown?];

function mockPoolExecute(
  handler: (sql: string, params: unknown[]) => Promise<QueryResult> | QueryResult,
) {
  const calls: QueryCall[] = [];
  const originalExecute = pool.execute;

  (pool as unknown as { execute: unknown }).execute = async (
    sql: unknown,
    params: unknown[] = [],
  ) => {
    const call = { sql: String(sql), params };
    calls.push(call);
    return handler(call.sql, call.params);
  };

  return {
    calls,
    restore() {
      pool.execute = originalExecute;
    },
  };
}

const mainScope: CategoryScope = { siteId: "main", isLocal: false };
const childScope: CategoryScope = { siteId: "child1", isLocal: true };

test("category scope predicates separate shared, main-local, and child-local rows", () => {
  const childLocal = buildCategoryScopePredicate(childScope);
  assert.equal(childLocal.sql, "is_local = 1 AND site_id = ?");
  assert.deepEqual(childLocal.params, ["child1"]);

  const mainVisible = buildCategoryScopePredicate(mainScope);
  assert.match(mainVisible.sql, /COALESCE\(is_local, 0\) = 0/);
  assert.match(mainVisible.sql, /is_local = 1 AND site_id = \?/);
  assert.deepEqual(mainVisible.params, ["main"]);
  assert.doesNotMatch(mainVisible.sql, /child1/);

  const childShared = buildCategoryScopePredicate({ siteId: "child1", isLocal: false });
  assert.equal(childShared.sql, "COALESCE(is_local, 0) = 0");
  assert.deepEqual(childShared.params, []);

  const aliased = buildCategoryScopePredicate(childScope, "p");
  assert.equal(aliased.sql, "p.is_local = 1 AND p.site_id = ?");
  assert.deepEqual(aliased.params, ["child1"]);
});

test("category listing carries the trusted child site through the local predicate", async () => {
  const mocked = mockPoolExecute(() => [[], []]);
  try {
    await getAllCategoriesIncludingInactive(childScope);
  } finally {
    mocked.restore();
  }

  assert.equal(mocked.calls.length, 1);
  assert.match(mocked.calls[0].sql, /WHERE/i);
  assert.match(mocked.calls[0].sql, /is_local = 1 AND site_id = \?/);
  assert.deepEqual(mocked.calls[0].params, ["child1"]);
});

test("local category creation persists the explicit child site and local flag", async () => {
  const mocked = mockPoolExecute(() => [{ affectedRows: 1 }, []]);
  try {
    await createCategory("Child category", null, null, 0, true, childScope.siteId, true);
  } finally {
    mocked.restore();
  }

  assert.equal(mocked.calls.length, 1);
  assert.match(mocked.calls[0].sql, /site_id, is_local\)/);
  assert.deepEqual(mocked.calls[0].params.slice(-2), ["child1", 1]);
});

test("repository rejects a child-owned global category create before SQL", async () => {
  const mocked = mockPoolExecute(() => {
    throw new Error("SQL must not run");
  });
  try {
    await assert.rejects(
      createCategory("Unsafe category", null, null, 0, true, "child1", false),
      /หมวดหมู่ global ต้องสร้างด้วย site id ของ main เท่านั้น/,
    );
  } finally {
    mocked.restore();
  }

  assert.equal(mocked.calls.length, 0);
});

test("category update keeps the same local scope in lookup and final UPDATE", async () => {
  const current = {
    id: "child-category",
    name: "Before",
    description: null,
    image_url: null,
    display_order: 1,
    is_active: 1,
    created_at: new Date("2026-09-14T00:00:00.000Z"),
    updated_at: new Date("2026-09-14T00:00:00.000Z"),
    site_id: "child1",
    is_local: 1,
  };
  const mocked = mockPoolExecute(() => {
    if (mocked.calls.length === 1) return [[current], []];
    return [{ affectedRows: 1 }, []];
  });

  try {
    await updateCategory("child-category", { name: "After" }, childScope);
  } finally {
    mocked.restore();
  }

  assert.equal(mocked.calls.length, 2);
  for (const call of mocked.calls) {
    assert.match(call.sql, /is_local = 1 AND site_id = \?/);
    assert.equal(call.params.at(-1), "child1");
  }
  assert.deepEqual(mocked.calls[0].params, ["child-category", "child1"]);
  assert.deepEqual(mocked.calls[1].params.slice(-2), ["child-category", "child1"]);
});

test("category delete scopes both product-reference protection and final DELETE", async () => {
  const mocked = mockPoolExecute(() => {
    if (mocked.calls.length === 1) return [[], []];
    return [{ affectedRows: 1 }, []];
  });

  try {
    await deleteCategory("child-category", childScope);
  } finally {
    mocked.restore();
  }

  assert.equal(mocked.calls.length, 2);
  assert.match(mocked.calls[0].sql, /FROM products p/);
  assert.match(mocked.calls[0].sql, /p\.is_local = 1 AND p\.site_id = \?/);
  assert.deepEqual(mocked.calls[0].params, ["child-category", "child1"]);

  assert.match(mocked.calls[1].sql, /DELETE FROM categories/);
  assert.match(mocked.calls[1].sql, /is_local = 1 AND site_id = \?/);
  assert.deepEqual(mocked.calls[1].params, ["child-category", "child1"]);
});
