import assert from "node:assert/strict";
import test from "node:test";

import {
  canAccessAdminSettings,
  isMainSiteOnlySettingKey,
  canManageGlobalApiProvider,
  canReadApiProviderMetadata,
  canViewGlobalProviderBalance,
  canManageGlobalGiftConfig,
  canUseMainSiteMimiAutopilot,
} from "../src/lib/auth/access-policies";
import {
  toSafeApiProvider,
} from "../src/lib/api-providers/presentation";
import {
  GET as getPublicSettings,
} from "../src/app/api/settings/public/route";
import { isSafePublicSettingKey } from "../src/lib/settings/public-api";
import { resolveSchedulerSiteId } from "../src/lib/ai/mimi-promo-scheduler";
import { NextRequest } from "next/server";

const admin = { role: "admin" as const, isAdmin: true };
const superadmin = { role: "superadmin" as const, isAdmin: true };
const owner = { role: "owner" as const, isAdmin: true };
const user = { role: "user" as const, isAdmin: false };

test("settings policy mirrors visible main/child boundaries", () => {
  assert.equal(isMainSiteOnlySettingKey("site_theme_pack"), true);
  assert.equal(isMainSiteOnlySettingKey("ranking_enabled"), true);
  assert.equal(isMainSiteOnlySettingKey("mimi_promo_scheduler_enabled"), true);
  assert.equal(isMainSiteOnlySettingKey("discord_webhook_topup"), true);
  assert.equal(isMainSiteOnlySettingKey("theme_color"), false);
  assert.equal(isMainSiteOnlySettingKey("site_title"), false);

  assert.equal(canAccessAdminSettings("main", superadmin), true);
  assert.equal(canAccessAdminSettings("main", owner), true);
  assert.equal(canAccessAdminSettings("main", admin), false);
  assert.equal(canAccessAdminSettings("main", user), false);
  assert.equal(canAccessAdminSettings("child1", admin), true);
  assert.equal(canAccessAdminSettings("child1", admin, "site_title"), true);
  assert.equal(canAccessAdminSettings("child1", admin, "ranking_enabled"), false);
  assert.equal(canAccessAdminSettings("child1", admin, "mimi_promo_scheduler_enabled"), false);
});

test("global provider and gift surfaces require main-site SuperAdmin", () => {
  assert.equal(canManageGlobalApiProvider("main", superadmin), true);
  assert.equal(canManageGlobalApiProvider("main", owner), true);
  assert.equal(canManageGlobalApiProvider("main", admin), false);
  assert.equal(canManageGlobalApiProvider("child1", superadmin), false);
  assert.equal(canManageGlobalApiProvider("child1", admin), false);

  assert.equal(canViewGlobalProviderBalance("main", superadmin), true);
  assert.equal(canViewGlobalProviderBalance("child1", superadmin), false);
  assert.equal(canManageGlobalGiftConfig("main", superadmin), true);
  assert.equal(canManageGlobalGiftConfig("child1", superadmin), false);
  assert.equal(canManageGlobalGiftConfig("main", admin), false);
});

test("provider metadata read keeps the visible child report usable without credentials", () => {
  assert.equal(canReadApiProviderMetadata("child1", admin), true);
  assert.equal(canReadApiProviderMetadata("child1", superadmin), true);
  assert.equal(canReadApiProviderMetadata("main", superadmin), true);
  assert.equal(canReadApiProviderMetadata("main", admin), false);
  assert.equal(canReadApiProviderMetadata("child1", user), false);

  const safeProvider = toSafeApiProvider({
    id: "provider-test",
    name: "provider-test",
    displayName: "Provider Test",
    apiKey: "test-only-provider-key",
    apiEndpoint: "https://provider.example.test/api",
    productEndpoint: null,
    buyEndpoint: null,
    historyEndpoint: null,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });

  assert.equal(safeProvider.apiKey, null);
  assert.equal(safeProvider.hasApiKey, true);
  assert.equal(JSON.stringify(safeProvider).includes("test-only-provider-key"), false);
});

test("MIMI autopilot is main-site scoped while preserving main Admin access", () => {
  assert.equal(canUseMainSiteMimiAutopilot("main", admin), true);
  assert.equal(canUseMainSiteMimiAutopilot("main", superadmin), true);
  assert.equal(canUseMainSiteMimiAutopilot("child1", admin), false);
  assert.equal(canUseMainSiteMimiAutopilot("child1", superadmin), false);
  assert.equal(canUseMainSiteMimiAutopilot("main", user), false);
});

test("public settings use an exact safe-key allowlist", () => {
  assert.equal(isSafePublicSettingKey("site_title"), true);
  assert.equal(isSafePublicSettingKey("discount_percentage"), true);
  assert.equal(isSafePublicSettingKey(" home_movie_poster_6 "), true);
  assert.equal(isSafePublicSettingKey("bank_account_name"), true);
  assert.equal(isSafePublicSettingKey("minimum_topup_amount"), true);
  assert.equal(isSafePublicSettingKey("slip2go_api_secret"), false);
  assert.equal(isSafePublicSettingKey("discord_webhook_topup"), false);
  assert.equal(isSafePublicSettingKey("PROVISION_OWNER_TOKEN"), false);
  assert.equal(isSafePublicSettingKey("not-a-setting"), false);
});

test("public settings endpoint rejects unsafe keys before reading settings", async () => {
  const response = await getPublicSettings(
    new NextRequest(
      "https://storebymari.example.test/api/settings/public?keys=site_title,slip2go_api_secret",
    ),
  );

  assert.equal(response.status, 400);
  assert.equal((await response.json()).message, "ขอได้เฉพาะ setting ที่เปิดเผยต่อสาธารณะเท่านั้น");
});

test("scheduler defaults to the current deployment and rejects cross-site overrides", () => {
  assert.equal(resolveSchedulerSiteId(undefined, "child1"), "child1");
  assert.equal(resolveSchedulerSiteId(" child1 ", "child1"), "child1");
  assert.equal(resolveSchedulerSiteId("", "child1"), "child1");
  assert.throws(
    () => resolveSchedulerSiteId("main", "child1"),
    /must match the current deployment/,
  );
});
