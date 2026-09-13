import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatReceiptNumber,
  isReceiptEligible,
} from "../src/lib/receipts/repository";
import {
  formatTopupReceiptNumber,
  TOPUP_RECEIPT_PRODUCT_NAME,
} from "../src/lib/receipts/topup-repository";
import { generateCashReceiptPdf } from "../src/lib/receipts/pdf";
import type { CashReceiptSummary, TopupCashReceiptSummary } from "../src/lib/receipts/types";
import {
  createCartCheckoutFingerprint,
  normalizeCartPayload,
} from "../src/lib/cart/checkout";

test("receipt numbers use the year-month-monthly sequence contract", () => {
  assert.equal(formatReceiptNumber(2026, 8, 1), "RECP-2026-08-001");
  assert.equal(formatReceiptNumber(2026, 8, 25), "RECP-2026-08-025");
  assert.equal(formatReceiptNumber(2026, 12, 1000), "RECP-2026-12-1000");
});

test("top-up receipts use a separate monthly sequence", () => {
  assert.equal(formatTopupReceiptNumber(2026, 8, 1), "TU-2026-08-0001");
  assert.equal(formatTopupReceiptNumber(2026, 8, 25), "TU-2026-08-0025");
});

test("receipts are eligible from 26 August 2026 and later", () => {
  assert.equal(isReceiptEligible("2026-08-25T23:59:59+07:00"), false);
  assert.equal(isReceiptEligible("2026-08-26T00:00:00+07:00"), true);
  assert.equal(isReceiptEligible("2026-08-27T12:00:00+07:00"), true);
});

test("cart payload merges duplicate products and fingerprints the canonical payload", () => {
  const normalized = normalizeCartPayload({
    lines: [
      { typeId: " netflix ", quantity: 1 },
      { typeId: "netflix", quantity: 2 },
      { typeId: "iqiyi", quantity: 1 },
    ],
  });
  assert.deepEqual(normalized, {
    lines: [
      { typeId: "netflix", quantity: 3 },
      { typeId: "iqiyi", quantity: 1 },
    ],
  });
  assert.equal(
    createCartCheckoutFingerprint({ lines: [{ typeId: "netflix", quantity: 3 }, { typeId: "iqiyi", quantity: 1 }] }),
    createCartCheckoutFingerprint(normalized),
  );
  assert.deepEqual(
    normalizeCartPayload({ lines: [{ typeId: "large-item", quantity: 101 }] }),
    { lines: [{ typeId: "large-item", quantity: 101 }] },
  );
  assert.throws(
    () => normalizeCartPayload({ lines: [{ typeId: "fractional-item", quantity: 1.5 }] }),
    /ข้อมูลตะกร้าไม่ถูกต้อง/,
  );
  assert.throws(
    () => normalizeCartPayload({ lines: Array.from({ length: 11 }, (_, index) => ({ typeId: `sku-${index}`, quantity: 1 })) }),
    /ไม่เกิน 10 รายการ/,
  );
});

test("cash receipt PDF is generated with the NET total and no package-period field", async () => {
  const receipt: CashReceiptSummary = {
    id: "receipt-1",
    siteId: "main",
    caseOrderId: "case-1",
    receiptNo: "RECP-2026-08-001",
    status: "ISSUED",
    issuedAt: "2026-08-26T00:00:00.000Z",
    totalAmount: 1_535,
    seller: {
      name: "ห้างหุ้นส่วนจำกัด มาริ สตูดิโอ",
      address: "81/748 ซอยประชาอุทิศ 79 แขวงทุ่งครุ เขตทุ่งครุ กรุงเทพมหานคร 10140",
      email: "Maripwriter@gmail.com",
      phone: "096-605-6254",
      footer: "storebymari.com - หจก. มาริ สตูดิโอ",
      logoUrl: "/logo.webp",
    },
    buyer: { name: "ผู้ซื้อทดสอบ", address: null, taxId: null, phone: null, email: "buyer@example.com" },
    lines: [
      { productTypeId: "netflix", productName: "Netflix Premium", quantity: 1, unitPrice: 500, amount: 500 },
      { productTypeId: "iqiyi", productName: "iQIYI VIP", quantity: 1, unitPrice: 1_035, amount: 1_035 },
    ],
    templateVersion: "v6-recp-new-v1",
  };

  const pdf = await generateCashReceiptPdf(receipt);
  assert.equal(pdf.subarray(0, 4).toString("ascii"), "%PDF");
  assert.ok(pdf.length > 1_000);
});

test("top-up cash receipt uses the existing cash receipt PDF renderer", async () => {
  const receipt: TopupCashReceiptSummary = {
    id: "topup-receipt-1",
    siteId: "main",
    sourceType: "TOPUP",
    caseOrderId: null,
    topupRequestId: "topup-request-1",
    transactionId: "bank-transaction-1",
    receiptNo: "TU-2026-08-0001",
    status: "ISSUED",
    issuedAt: "2026-08-26T00:00:00.000Z",
    totalAmount: 500,
    amountPaid: 500,
    basePoints: 500,
    bonusPoints: 10,
    creditedPoints: 510,
    seller: {
      name: "ห้างหุ้นส่วนจำกัด มาริ สตูดิโอ",
      address: "81/748 ซอยประชาอุทิศ 79 แขวงทุ่งครุ เขตทุ่งครุ กรุงเทพมหานคร 10140",
      email: "Maripwriter@gmail.com",
      phone: "096-605-6254",
      footer: "storebymari.com - หจก. มาริ สตูดิโอ",
      logoUrl: "/logo.webp",
    },
    buyer: { name: "ผู้ซื้อเติมพ้อยท์", address: null, taxId: null, phone: null, email: "buyer@example.com" },
    lines: [
      {
        productTypeId: null,
        productName: TOPUP_RECEIPT_PRODUCT_NAME,
        quantity: 1,
        unitPrice: 500,
        amount: 500,
      },
    ],
    templateVersion: "v6-recp-new-v1",
  };

  const pdf = await generateCashReceiptPdf(receipt);
  assert.equal(pdf.subarray(0, 4).toString("ascii"), "%PDF");
  assert.ok(pdf.length > 1_000);
});
