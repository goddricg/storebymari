import assert from "node:assert/strict";
import { test } from "node:test";

import { RECEIPT_ARTWORK, RECEIPT_LAYOUT, RECEIPT_LAYOUT_CSS_VARS, RECEIPT_TYPOGRAPHY } from "../src/lib/receipts/layout";

function assertBox(name: string, box: { top: number; left: number; width: number; height: number }) {
  assert.ok(box.left >= 0 && box.top >= 0, `${name} starts inside the page`);
  assert.ok(box.left + box.width <= 100, `${name} does not exceed the page width`);
  assert.ok(box.top + box.height <= 100, `${name} does not exceed the page height`);
}

test("receipt artwork keeps an A4 reference ratio and uses the new master asset", () => {
  const artworkRatio = RECEIPT_ARTWORK.referenceWidth / RECEIPT_ARTWORK.referenceHeight;
  const a4Ratio = 210 / 297;

  assert.ok(Math.abs(artworkRatio - a4Ratio) < 0.002);
  assert.equal(RECEIPT_ARTWORK.assetPath, "/receipt-assets/v3/recp-new-v1.png");
  assert.equal(RECEIPT_ARTWORK.referenceWidth, 1055);
  assert.equal(RECEIPT_ARTWORK.referenceHeight, 1491);
});

test("all V3 first-page overlay boxes stay inside the artwork coordinate system", () => {
  const { firstPage } = RECEIPT_LAYOUT;
  Object.entries(firstPage.meta).forEach(([name, box]) => assertBox(`meta.${name}`, box));
  Object.entries(firstPage.buyer).forEach(([name, box]) => assertBox(`buyer.${name}`, box));
  assertBox("table", firstPage.table);
  assertBox("items", firstPage.items);
  Object.entries(firstPage.summary).forEach(([name, box]) => assertBox(`summary.${name}`, box));
  Object.entries(firstPage.signatures).forEach(([name, box]) => assertBox(`signatures.${name}`, box));
});

test("CSS overlay variables mirror the shared V3 receipt layout", () => {
  assert.equal(RECEIPT_LAYOUT_CSS_VARS["--receipt-meta-no-left"], `${RECEIPT_LAYOUT.firstPage.meta.receiptNo.left}%`);
  assert.equal(RECEIPT_LAYOUT_CSS_VARS["--receipt-meta-date-top"], `${RECEIPT_LAYOUT.firstPage.meta.date.top}%`);
  assert.equal(RECEIPT_LAYOUT_CSS_VARS["--receipt-buyer-tax-left"], `${RECEIPT_LAYOUT.firstPage.buyer.taxId.left}%`);
  assert.equal(RECEIPT_LAYOUT_CSS_VARS["--receipt-items-height"], `${RECEIPT_LAYOUT.firstPage.items.height}%`);
  assert.equal(RECEIPT_LAYOUT_CSS_VARS["--receipt-table-col-product"], `${RECEIPT_LAYOUT.table.columnRatios[1] * 100}%`);
});

test("receipt typography and signature scale follow the requested visual settings", () => {
  assert.deepEqual(RECEIPT_TYPOGRAPHY, {
    metaReceiptNo: 11,
    metaDate: 11,
    buyer: 12,
    items: 11,
    notes: 11,
    subtotal: 11,
    total: 13,
    signatureDate: 11,
  });
  assert.equal(RECEIPT_LAYOUT.firstPage.buyer.name.left, 28.0);
  assert.equal(RECEIPT_LAYOUT.firstPage.buyer.name.top, 29.05);
  assert.equal(RECEIPT_LAYOUT.firstPage.buyer.phone.left, 22.0);
  assert.equal(RECEIPT_LAYOUT.firstPage.buyer.phone.top, 38.6);
  assert.equal(RECEIPT_LAYOUT.firstPage.items.top, 46.4);
  assert.equal(RECEIPT_LAYOUT.firstPage.items.textOffset, 0.2);
  assert.equal(RECEIPT_LAYOUT_CSS_VARS["--receipt-items-text-offset"], "20%");
  assert.equal(RECEIPT_LAYOUT.firstPage.summary.notes.top, 83.25);
  assert.equal(RECEIPT_LAYOUT.firstPage.summary.subtotal.top, 81.15);
  assert.equal(RECEIPT_LAYOUT.firstPage.summary.total.top, 85.8);
  assert.deepEqual(RECEIPT_LAYOUT.firstPage.signatures.signature, { top: 91.5, left: 23.1, width: 12, height: 2.52 });
  assert.equal(RECEIPT_LAYOUT_CSS_VARS["--receipt-font-total"], "13px");
});

test("the additional downward nudge stays inside the artwork lines and footer spacing", () => {
  const { firstPage } = RECEIPT_LAYOUT;
  assert.ok(firstPage.items.top + firstPage.items.height <= firstPage.table.top + firstPage.table.height);
  assert.ok(firstPage.summary.total.top + firstPage.summary.total.height <= firstPage.signatures.signature.top);
  assert.ok(firstPage.items.textOffset < 0.5, "item text stays within the row rather than crossing into the next line");
  assert.ok(
    firstPage.signatures.signature.top + firstPage.signatures.signature.height <= firstPage.signatures.dateDay.top,
  );
});
