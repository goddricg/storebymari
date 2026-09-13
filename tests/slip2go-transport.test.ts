import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isRetryableSlip2GoHttpStatus,
  Slip2GoTransportError,
} from "../src/lib/slip/slip2go-api";
import { ErrorCodes, SlipVerificationError } from "../src/lib/slip/types";

test("classifies transient Slip2Go HTTP failures as retryable", () => {
  for (const status of [undefined, 408, 425, 429, 500, 502, 503, 504]) {
    assert.equal(isRetryableSlip2GoHttpStatus(status), true);
  }

  for (const status of [400, 401, 403, 404, 422]) {
    assert.equal(isRetryableSlip2GoHttpStatus(status), false);
  }
});

test("preserves safe provider transport metadata without exposing credentials", () => {
  const error = new Slip2GoTransportError(
    "timeout of 20000ms exceeded",
    "timeout",
    undefined,
    "ECONNABORTED",
    true
  );

  assert.equal(error.name, "Slip2GoTransportError");
  assert.equal(error.kind, "timeout");
  assert.equal(error.axiosCode, "ECONNABORTED");
  assert.equal(error.retryable, true);
  assert.equal("secretKey" in error, false);
});

test("retryable verification errors retain their API error code", () => {
  const error = new SlipVerificationError(
    "provider unavailable",
    ErrorCodes.API_ERROR,
    503,
    { retryable: true }
  );

  assert.equal(error.code, ErrorCodes.API_ERROR);
  assert.equal(error.statusCode, 503);
  assert.equal(error.retryable, true);
});
