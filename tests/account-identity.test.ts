import assert from "node:assert/strict";
import { test } from "node:test";

import { getAccountIdentity } from "../src/lib/products/account-identity";
import {
  canUpgradeStockDeliveryType,
  getStockDeliveryIdentity,
  getStockDeliveryIdentityIssue,
  parseStockDeliveryType,
} from "../src/lib/products/stock-delivery-type";

test("Netflix allows the same credentials on different screens", () => {
  const first = getAccountIdentity(
    { email: "shared@example.com", password: "shared-pass", details: "Screen: 1" },
    "Netflix Premium 30 Day",
  );
  const second = getAccountIdentity(
    { email: "shared@example.com", password: "shared-pass", details: "Screen: 2" },
    "Netflix Premium 30 Day",
  );

  assert.notEqual(first, second);
});

test("Netflix treats equivalent screen formats as the same screen", () => {
  const plain = getAccountIdentity(
    { email: "shared@example.com", password: "shared-pass", details: "จอ 4" },
    "Netflix Premium 30 Day",
  );
  const padded = getAccountIdentity(
    { email: "shared@example.com", password: "shared-pass", details: "Screen: 04" },
    "Netflix Premium 30 Day",
  );

  assert.equal(plain, padded);
});

test("screen pool accepts the same credentials when the screen differs", () => {
  const first = getStockDeliveryIdentity(
    { email: "shared@example.com", password: "shared-pass", details: "screen : จอ 1" },
    "Prime Premium 30 Day",
    "account-screen-pool",
  );
  const second = getStockDeliveryIdentity(
    { email: "shared@example.com", password: "shared-pass", details: "screen : จอ 2" },
    "Prime Premium 30 Day",
    "account-screen-pool",
  );
  const padded = getStockDeliveryIdentity(
    { email: "shared@example.com", password: "shared-pass", details: "Screen: 02" },
    "Prime Premium 30 Day",
    "account-screen-pool",
  );

  assert.notEqual(first, second);
  assert.equal(second, padded);
});

test("screen pool reports a missing screen instead of silently accepting an ambiguous account", () => {
  const identity = getStockDeliveryIdentity(
    { email: "shared@example.com", password: "shared-pass", details: "Prime account" },
    "Prime Premium 30 Day",
    "account-screen-pool",
  );

  assert.notEqual(identity, null);
  assert.match(
    getStockDeliveryIdentityIssue(
      { email: "shared@example.com", password: "shared-pass", details: "Prime account" },
      "Prime Premium 30 Day",
      "account-screen-pool",
    ) ?? "",
    /ไม่พบหมายเลขจอ/,
  );
});

test("Netflix still separates different credentials on the same screen", () => {
  const first = getAccountIdentity(
    { email: "first@example.com", password: "same-pass", details: "Screen: 1" },
    "Netflix Premium 30 Day",
  );
  const second = getAccountIdentity(
    { email: "second@example.com", password: "same-pass", details: "Screen: 1" },
    "Netflix Premium 30 Day",
  );

  assert.notEqual(first, second);
});

test("Invite Link Pool identifies the URL instead of admin notes", () => {
  const first = getStockDeliveryIdentity(
    { email: "", password: "", details: "Canva invite\nhttps://invite.example/token-1" },
    "Canva EDU",
    "invite-link-pool",
  );
  const second = getStockDeliveryIdentity(
    { email: "", password: "", details: "ส่งให้ลูกค้าแล้ว\nhttps://invite.example/token-1" },
    "Canva EDU",
    "invite-link-pool",
  );

  assert.equal(first, second);
});

test("Reusable Link does not reject repeated link values", () => {
  assert.equal(
    getStockDeliveryIdentity(
      { email: "", password: "", details: "https://invite.example/reusable" },
      "Canva EDU",
      "reusable-link",
    ),
    null,
  );
});

test("Reusable Account Pool does not reject repeated credentials", () => {
  assert.equal(
    getStockDeliveryIdentity(
      { email: "shared@example.com", password: "shared-pass", details: "same account" },
      "Spotify Premium",
      "reusable-account-pool",
    ),
    null,
  );
});

test("Reusable Account Pool is a recognized delivery type and safe account-pool upgrade", () => {
  assert.equal(parseStockDeliveryType("reusable-account-pool"), "reusable-account-pool");
  assert.equal(
    canUpgradeStockDeliveryType("account-pool", "reusable-account-pool"),
    true,
  );
  assert.equal(
    canUpgradeStockDeliveryType("account-screen-pool", "reusable-account-pool"),
    true,
  );
});
