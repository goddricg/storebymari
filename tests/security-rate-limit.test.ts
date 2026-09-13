import assert from "node:assert/strict";
import test from "node:test";

import { createRateLimiter } from "../src/lib/security/rate-limit";

test("rate limiter blocks requests after the configured window quota", () => {
  let now = 0;
  const limiter = createRateLimiter(() => now);

  assert.equal(limiter.consume("register:ip", 2, 60_000).allowed, true);
  assert.equal(limiter.consume("register:ip", 2, 60_000).allowed, true);
  assert.equal(limiter.consume("register:ip", 2, 60_000).allowed, false);

  now = 60_000;
  assert.equal(limiter.consume("register:ip", 2, 60_000).allowed, true);
});

test("rate limiter keeps separate scopes independent", () => {
  const limiter = createRateLimiter(() => 0);

  assert.equal(limiter.consume("login:one", 1, 60_000).allowed, true);
  assert.equal(limiter.consume("login:one", 1, 60_000).allowed, false);
  assert.equal(limiter.consume("login:two", 1, 60_000).allowed, true);
});
