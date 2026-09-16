import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildUserTargetScope,
  toAdminCreatedUser,
} from "../src/lib/admin/user-scope";
import {
  buildApiKeyScope,
  buildTargetUserScope,
  maskApiKey,
  toApiKeyMetadata,
  toOneTimeApiKeyResponse,
  type ApiKeyRow,
} from "../src/lib/admin/user-api-key";

test("user mutations preserve central visibility and tenant target scope", () => {
  assert.deepEqual(buildUserTargetScope("main", "user-main-or-child"), {
    whereClause: "id = ?",
    params: ["user-main-or-child"],
  });
  assert.deepEqual(buildUserTargetScope("child-a", "user-child"), {
    whereClause: "id = ? AND site_id = ?",
    params: ["user-child", "child-a"],
  });

  assert.deepEqual(buildTargetUserScope("child-a", "user-child"), {
    whereClause: "id = ? AND site_id = ?",
    params: ["user-child", "child-a"],
  });
  assert.deepEqual(buildTargetUserScope("main", "user-from-child"), {
    whereClause: "id = ?",
    params: ["user-from-child"],
  });
});

test("tenant API-key queries retain the target site predicate", () => {
  const tenantScope = buildApiKeyScope("child-a", "user-child");
  assert.deepEqual(tenantScope.params, ["user-child", "child-a"]);
  assert.match(tenantScope.whereClause, /tenant_api_keys\.user_id = \?/);
  assert.match(tenantScope.whereClause, /target_user\.site_id = \?/);

  const centralScope = buildApiKeyScope("main", "user-from-child");
  assert.deepEqual(centralScope, {
    whereClause: "tenant_api_keys.user_id = ?",
    params: ["user-from-child"],
  });
});

test("created-user Admin response omits password_hash and includes its target site", () => {
  const passwordHash = "hash-held-only-by-server";
  const response = toAdminCreatedUser(
    {
      id: "user-1",
      email: "member@example.test",
      password_hash: passwordHash,
      display_name: "Member",
      role: "user",
      is_admin: 0,
      user_tier: "normal",
      points: 0,
      is_active: 1,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      updated_at: new Date("2026-01-01T00:00:00.000Z"),
    },
    "child-a",
  );

  assert.equal("password_hash" in response, false);
  assert.equal(JSON.stringify(response).includes(passwordHash), false);
  assert.equal(response.site_id, "child-a");
});

test("normal API-key metadata is masked while explicit rotation remains one-time", () => {
  const fullKey = `sk_live_${"a".repeat(48)}`;
  const row = {
    id: "key-1",
    api_key: fullKey,
    site_name: "Child A",
    is_enabled: 1,
    is_site_suspended: 0,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
  } as ApiKeyRow;

  const metadata = toApiKeyMetadata(row);
  assert.equal(metadata.hasApiKey, true);
  assert.equal(metadata.api_key, maskApiKey(fullKey));
  assert.equal(metadata.maskedApiKey, maskApiKey(fullKey));
  assert.equal(JSON.stringify(metadata).includes(fullKey), false);
  assert.equal(metadata.api_key === fullKey, false);

  const oneTime = toOneTimeApiKeyResponse(row, fullKey);
  assert.equal(oneTime.api_key, fullKey);
  assert.equal(oneTime.oneTime, true);
});

test("tenant API-key migration declares and backfills the suspension flag", () => {
  const migration = readFileSync(
    new URL("../migrations/05_add_tenant_api_keys.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /is_site_suspended\s+TINYINT\(1\)\s+NOT NULL\s+DEFAULT\s+0/i);
  assert.match(migration, /INFORMATION_SCHEMA\.COLUMNS/i);
  assert.match(migration, /ALTER TABLE tenant_api_keys ADD COLUMN is_site_suspended/i);
});
