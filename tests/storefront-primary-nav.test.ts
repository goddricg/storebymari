import assert from "node:assert/strict";
import { test } from "node:test";

import { isStorefrontPrimaryLinkActive } from "../src/lib/storefront-primary-nav";

test("the home link is active only on the home route", () => {
  assert.equal(isStorefrontPrimaryLinkActive("/", "/"), true);
  assert.equal(isStorefrontPrimaryLinkActive("/products", "/"), false);
});

test("an in-page contact link does not also mark the home page active", () => {
  assert.equal(isStorefrontPrimaryLinkActive("/", "/#support"), false);
  assert.equal(isStorefrontPrimaryLinkActive("/products", "/#support"), false);
});

test("route links match their route and nested pages without matching similar prefixes", () => {
  assert.equal(isStorefrontPrimaryLinkActive("/support/check", "/support/check"), true);
  assert.equal(isStorefrontPrimaryLinkActive("/support/check/case-1", "/support/check"), true);
  assert.equal(isStorefrontPrimaryLinkActive("/support/checker", "/support/check"), false);
});

