import type { CSSProperties } from "react";
import "./receipt.css";

import { ReceiptPrintButton } from "@/components/receipts/receipt-print-button";
import { RECEIPT_ARTWORK, RECEIPT_LAYOUT_CSS_VARS } from "@/lib/receipts/layout";
import {
  getReceiptReferenceNote,
  isTopupReceiptSummary,
  type ReceiptDocumentSummary,
  type ReceiptLineSnapshot,
} from "@/lib/receipts/types";

const RECEIPT_SIGNATURE_ASSET = "/receipt-assets/v2/nn-signature.png";
const RECEIPT_LINES_PER_PAGE = 10;
const RECEIPT_LAYOUT_STYLE = RECEIPT_LAYOUT_CSS_VARS as CSSProperties;

function formatMoney(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function formatSignatureDateParts(value: string) {
  const parts = new Intl.DateTimeFormat("en-GB-u-ca-buddhist", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { day: get("day"), month: get("month"), year: get("year") };
}

function splitLines(lines: ReceiptLineSnapshot[]): ReceiptLineSnapshot[][] {
  if (lines.length === 0) return [[]];
  const pages: ReceiptLineSnapshot[][] = [];
  for (let index = 0; index < lines.length; index += RECEIPT_LINES_PER_PAGE) {
    pages.push(lines.slice(index, index + RECEIPT_LINES_PER_PAGE));
  }
  return pages;
}

function ReceiptItemsOverlay({ lines, hideQuantity }: { lines: ReceiptLineSnapshot[]; hideQuantity: boolean }) {
  return (
    <section className="receipt-v3-items" aria-label="รายการสินค้า">
      {Array.from({ length: RECEIPT_LINES_PER_PAGE }, (_, index) => {
        const line = lines[index];
        return (
          <div className="receipt-v3-item-row" key={`${line?.productTypeId ?? "blank"}-${index}`}>
            <span className="receipt-v3-item-index">{line ? index + 1 : ""}</span>
            <span className="receipt-v3-item-product">{line?.productName ?? ""}</span>
            <span className="receipt-v3-item-quantity">{line && !hideQuantity ? line.quantity : ""}</span>
            <span className="receipt-v3-item-unit">{line ? formatMoney(line.unitPrice) : ""}</span>
            <span className="receipt-v3-item-amount">{line ? formatMoney(line.amount) : ""}</span>
          </div>
        );
      })}
    </section>
  );
}

function ReceiptBuyerOverlay({ receipt }: { receipt: ReceiptDocumentSummary }) {
  return (
    <section className="receipt-v3-buyer" aria-label="ข้อมูลผู้ซื้อ">
      <span className="receipt-v3-buyer-value receipt-v3-buyer-name">{receipt.buyer.name || "-"}</span>
      <span className="receipt-v3-buyer-value receipt-v3-buyer-address">{receipt.buyer.address || ""}</span>
      <span className="receipt-v3-buyer-value receipt-v3-buyer-tax">{receipt.buyer.taxId || ""}</span>
      <span className="receipt-v3-buyer-value receipt-v3-buyer-phone">{receipt.buyer.phone || ""}</span>
    </section>
  );
}

function ReceiptSummaryOverlay({ receipt }: { receipt: ReceiptDocumentSummary }) {
  return (
    <section className="receipt-v3-summary" aria-label="สรุปยอดบิล">
      <p className="receipt-v3-summary-notes">{getReceiptReferenceNote(receipt)}</p>
      <strong className="receipt-v3-summary-value receipt-v3-summary-subtotal">{formatMoney(receipt.totalAmount)}</strong>
      <strong className="receipt-v3-summary-value receipt-v3-summary-total">{formatMoney(receipt.totalAmount)}</strong>
    </section>
  );
}

function ReceiptSignatureOverlay({ receipt }: { receipt: ReceiptDocumentSummary }) {
  const date = formatSignatureDateParts(receipt.issuedAt);
  return (
    <section className="receipt-v3-signatures" aria-label="ลายเซ็นและวันที่ผู้รับเงิน">
      <img className="receipt-v3-signature-image" src={RECEIPT_SIGNATURE_ASSET} alt="ลายเซ็นอิเล็กทรอนิกส์ของผู้รับเงิน" />
      <span className="receipt-v3-signature-date receipt-v3-signature-day">{date.day}</span>
      <span className="receipt-v3-signature-date receipt-v3-signature-month">{date.month}</span>
      <span className="receipt-v3-signature-date receipt-v3-signature-year">{date.year}</span>
    </section>
  );
}

function ReceiptContinuation({
  receipt,
  lines,
  isLastPage,
  hideQuantity,
}: {
  receipt: ReceiptDocumentSummary;
  lines: ReceiptLineSnapshot[];
  isLastPage: boolean;
  hideQuantity: boolean;
}) {
  return (
    <section className="receipt-v3-continuation-content" aria-label="รายการสินค้าเพิ่มเติม">
      <div className="receipt-v3-continuation-heading">
        <span>รายการสินค้าเพิ่มเติม / Continued Items</span>
        <span>Receipt No. {receipt.receiptNo}</span>
      </div>
      <table className="receipt-v3-continuation-table">
        <thead>
          <tr><th>ลำดับ</th><th>รายการสินค้า</th><th>จำนวน</th><th>ราคา/หน่วย</th><th>จำนวนเงิน</th></tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={`${line.productTypeId ?? "item"}-${index}`}>
              <td>{index + 1}</td><td>{line.productName}</td><td>{hideQuantity ? "" : line.quantity}</td><td>{formatMoney(line.unitPrice)}</td><td>{formatMoney(line.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {isLastPage ? <p className="receipt-v3-continuation-total">ยอดสุทธิ / Net Total: <strong>{formatMoney(receipt.totalAmount)} บาท</strong></p> : null}
    </section>
  );
}

function ReceiptV3Sheet({
  receipt,
  lines,
  pageIndex,
  pageCount,
}: {
  receipt: ReceiptDocumentSummary;
  lines: ReceiptLineSnapshot[];
  pageIndex: number;
  pageCount: number;
}) {
  const isFirstPage = pageIndex === 0;
  const hideQuantity = isTopupReceiptSummary(receipt);

  return (
    <article
      className={`receipt-v3-sheet ${isFirstPage ? "receipt-v3-sheet-first" : "receipt-v3-sheet-continuation"}`}
      style={RECEIPT_LAYOUT_STYLE}
      aria-label={`บิลเงินสด ${receipt.receiptNo}`}
    >
      <img className="receipt-v3-art" src={RECEIPT_ARTWORK.assetPath} alt="" aria-hidden="true" />
      {isFirstPage ? (
        <>
          <div className="receipt-v3-meta" aria-label="ข้อมูล Receipt">
            <strong className="receipt-v3-meta-no">{receipt.receiptNo}</strong>
            <strong className="receipt-v3-meta-date">{formatDate(receipt.issuedAt)}</strong>
          </div>
          <ReceiptBuyerOverlay receipt={receipt} />
          <ReceiptItemsOverlay lines={lines} hideQuantity={hideQuantity} />
          <ReceiptSummaryOverlay receipt={receipt} />
          {pageCount === 1 ? <ReceiptSignatureOverlay receipt={receipt} /> : null}
        </>
      ) : (
        <ReceiptContinuation
          receipt={receipt}
          lines={lines}
          isLastPage={pageIndex === pageCount - 1}
          hideQuantity={hideQuantity}
        />
      )}
    </article>
  );
}

export function ReceiptDocument({ receipt }: { receipt: ReceiptDocumentSummary }) {
  const pages = splitLines(receipt.lines);

  return (
    <div data-receipt-page className="receipt-v3-page">
      <div className="receipt-no-print receipt-v3-toolbar">
        <ReceiptPrintButton />
      </div>
      <div className="receipt-v3-pages">
        {pages.map((lines, pageIndex) => (
          <ReceiptV3Sheet
            key={`${receipt.id}-${pageIndex}`}
            receipt={receipt}
            lines={lines}
            pageIndex={pageIndex}
            pageCount={pages.length}
          />
        ))}
      </div>
    </div>
  );
}
