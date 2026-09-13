import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getTopupFailureReason,
  getTopupSourceLabel,
  getTopupStatusLabel,
  parseSavedTopupError,
} from "../src/lib/topup/history";

test("top-up failure codes have clear Thai explanations", () => {
  assert.equal(getTopupFailureReason("DUPLICATE_SLIP"), "สลิปซ้ำ");
  assert.equal(getTopupFailureReason("INVALID_QR", "สลิปเสียหรือสลิปปลอม"), "สลิปเสียหรือสลิปปลอม");
  assert.equal(getTopupFailureReason("INVALID_ACCOUNT"), "บัญชีผู้รับเงินไม่ตรงกับระบบ");
  assert.equal(getTopupFailureReason("API_ERROR"), "ระบบตรวจสอบสลิปขัดข้องชั่วคราว");
});

test("top-up history labels identify status and transaction source", () => {
  assert.equal(getTopupStatusLabel("success"), "สำเร็จ");
  assert.equal(getTopupStatusLabel("failed"), "ไม่สำเร็จ");
  assert.equal(getTopupStatusLabel("pending"), "กำลังตรวจสอบ");
  assert.equal(getTopupSourceLabel({ sourceType: "SYSTEM" }), "ผ่านระบบตรวจสอบสลิป");
  assert.equal(
    getTopupSourceLabel({ sourceType: "ADMIN", sourceLabel: "เจ้าของร้าน" }),
    "ผ่าน Admin: เจ้าของร้าน"
  );
});

test("saved top-up response errors are read without exposing malformed payloads", () => {
  assert.equal(parseSavedTopupError('{"success":false,"error":"สลิปซ้ำ"}'), "สลิปซ้ำ");
  assert.equal(parseSavedTopupError("not-json"), null);
  assert.equal(parseSavedTopupError(null), null);
  assert.equal(getTopupFailureReason("UNKNOWN", "provider timeout"), "ไม่สามารถตรวจสอบรายการได้");
});
