import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

import { RECEIPT_ARTWORK, RECEIPT_LAYOUT, RECEIPT_TYPOGRAPHY, type ReceiptLayoutBox } from "@/lib/receipts/layout";
import {
  getReceiptReferenceNote,
  isTopupReceiptSummary,
  type ReceiptDocumentSummary,
  type ReceiptLineSnapshot,
} from "@/lib/receipts/types";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const REFERENCE_WIDTH = RECEIPT_ARTWORK.referenceWidth;
const REFERENCE_HEIGHT = RECEIPT_ARTWORK.referenceHeight;
const LINES_PER_PAGE = RECEIPT_LAYOUT.table.rowCount;
const REFERENCE_ASSET = path.join(process.cwd(), "public", ...RECEIPT_ARTWORK.assetPath.replace(/^\/+/, "").split("/"));
const SIGNATURE_ASSET = path.join(process.cwd(), "public", "receipt-assets", "v2", "nn-signature.png");
const ITIM_FONT = path.join(process.cwd(), "public", "receipt-assets", "v3", "itim-regular.ttf");

const scaleX = PAGE_WIDTH / REFERENCE_WIDTH;
const scaleY = PAGE_HEIGHT / REFERENCE_HEIGHT;
const x = (value: number) => value * scaleX;
const y = (value: number) => value * scaleY;
const xp = (percent: number) => x((REFERENCE_WIDTH * percent) / 100);
const yp = (percent: number) => y((REFERENCE_HEIGHT * percent) / 100);
const cssSize = (value: number) => value * 0.75;

function fitText(doc: PDFKit.PDFDocument, value: string, maxWidth: number, size: number): string {
  doc.font(ITIM_FONT).fontSize(size);
  if (doc.widthOfString(value) <= maxWidth) return value;
  const chars = Array.from(value);
  let low = 0;
  let high = chars.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (doc.widthOfString(`${chars.slice(0, middle).join("")}…`) <= maxWidth) low = middle;
    else high = middle - 1;
  }
  return `${chars.slice(0, low).join("")}…`;
}

function drawText(
  doc: PDFKit.PDFDocument,
  value: string,
  box: ReceiptLayoutBox,
  options: { size: number; color?: string; align?: "left" | "right" | "center" } = { size: 8 },
) {
  const size = cssSize(options.size);
  const width = xp(box.width);
  const text = fitText(doc, value, width, size);
  doc
    .font(ITIM_FONT)
    .fontSize(size)
    .fillColor(options.color ?? "#542b3a")
    .text(text, xp(box.left), yp(box.top), {
      width,
      height: yp(box.height),
      align: options.align ?? "left",
      lineBreak: false,
      ellipsis: false,
    });
}

function drawTextAt(
  doc: PDFKit.PDFDocument,
  value: string,
  left: number,
  top: number,
  width: number,
  options: { size: number; color?: string; align?: "left" | "right" | "center" } = { size: 8 },
) {
  const size = cssSize(options.size);
  const text = fitText(doc, value, width, size);
  doc
    .font(ITIM_FONT)
    .fontSize(size)
    .fillColor(options.color ?? "#542b3a")
    .text(text, left, top, {
      width,
      align: options.align ?? "left",
      lineBreak: false,
      ellipsis: false,
    });
}

function formatMoney(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" }).format(new Date(value));
}

function formatSignatureDateParts(value: string): { day: string; month: string; year: string } {
  const parts = new Intl.DateTimeFormat("en-GB-u-ca-buddhist", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { day: get("day"), month: get("month"), year: get("year") };
}

function drawReference(doc: PDFKit.PDFDocument) {
  doc.image(REFERENCE_ASSET, 0, 0, { width: PAGE_WIDTH, height: PAGE_HEIGHT });
}

function drawReceiptMeta(doc: PDFKit.PDFDocument, receipt: ReceiptDocumentSummary) {
  const { meta } = RECEIPT_LAYOUT.firstPage;
  drawText(doc, receipt.receiptNo, meta.receiptNo, { size: RECEIPT_TYPOGRAPHY.metaReceiptNo, align: "right" });
  drawText(doc, formatDate(receipt.issuedAt), meta.date, { size: RECEIPT_TYPOGRAPHY.metaDate, align: "right" });
}

function drawBuyer(doc: PDFKit.PDFDocument, receipt: ReceiptDocumentSummary) {
  const { buyer } = RECEIPT_LAYOUT.firstPage;
  drawText(doc, receipt.buyer.name || "-", buyer.name, { size: RECEIPT_TYPOGRAPHY.buyer });
  drawText(doc, receipt.buyer.address || "", buyer.address, { size: RECEIPT_TYPOGRAPHY.buyer });
  drawText(doc, receipt.buyer.taxId || "", buyer.taxId, { size: RECEIPT_TYPOGRAPHY.buyer });
  drawText(doc, receipt.buyer.phone || "", buyer.phone, { size: RECEIPT_TYPOGRAPHY.buyer });
}

function drawItems(doc: PDFKit.PDFDocument, receipt: ReceiptDocumentSummary, lines: ReceiptLineSnapshot[]) {
  const box = RECEIPT_LAYOUT.firstPage.items;
  const columnWidths = RECEIPT_LAYOUT.table.columnRatios.map((ratio) => xp(box.width) * ratio);
  const rowHeight = yp(box.height) / LINES_PER_PAGE;
  const hideQuantity = isTopupReceiptSummary(receipt);
  lines.slice(0, LINES_PER_PAGE).forEach((line, index) => {
    const rowTop = yp(box.top) + rowHeight * index;
    const textTop = rowTop + (rowHeight - cssSize(RECEIPT_TYPOGRAPHY.items) * 1.15) / 2 + rowHeight * box.textOffset;
    let cursor = xp(box.left);
    const values = [String(index + 1), line.productName, hideQuantity ? "" : String(line.quantity), formatMoney(line.unitPrice), formatMoney(line.amount)];
    values.forEach((value, cellIndex) => {
      const cellWidth = columnWidths[cellIndex];
      const align = cellIndex === 1 ? "left" : cellIndex === 0 || cellIndex === 2 ? "center" : "right";
      drawTextAt(doc, value, cursor + (align === "left" ? x(2) : 0), textTop, cellWidth - x(4), {
        size: RECEIPT_TYPOGRAPHY.items,
        align,
      });
      cursor += cellWidth;
    });
  });
}

function drawSummary(doc: PDFKit.PDFDocument, receipt: ReceiptDocumentSummary) {
  const { summary } = RECEIPT_LAYOUT.firstPage;
  drawText(doc, getReceiptReferenceNote(receipt), summary.notes, { size: RECEIPT_TYPOGRAPHY.notes, color: "#75495a" });
  drawText(doc, formatMoney(receipt.totalAmount), summary.subtotal, { size: RECEIPT_TYPOGRAPHY.subtotal, align: "right" });
  drawText(doc, formatMoney(receipt.totalAmount), summary.total, { size: RECEIPT_TYPOGRAPHY.total, color: "#d8447b", align: "right" });
}

function drawSignature(doc: PDFKit.PDFDocument, receipt: ReceiptDocumentSummary) {
  const { signatures } = RECEIPT_LAYOUT.firstPage;
  const signature = signatures.signature;
  if (fs.existsSync(SIGNATURE_ASSET)) {
    doc.image(SIGNATURE_ASSET, xp(signature.left), yp(signature.top), {
      fit: [xp(signature.width), yp(signature.height)],
      align: "center",
      valign: "center",
    });
  }
  const date = formatSignatureDateParts(receipt.issuedAt);
  drawText(doc, date.day, signatures.dateDay, { size: RECEIPT_TYPOGRAPHY.signatureDate, align: "center" });
  drawText(doc, date.month, signatures.dateMonth, { size: RECEIPT_TYPOGRAPHY.signatureDate, align: "center" });
  drawText(doc, date.year, signatures.dateYear, { size: RECEIPT_TYPOGRAPHY.signatureDate, align: "center" });
}

function drawContinuationTable(
  doc: PDFKit.PDFDocument,
  receipt: ReceiptDocumentSummary,
  lines: ReceiptLineSnapshot[],
  left: number,
  top: number,
  width: number,
) {
  const columns = [0.08, 0.46, 0.15, 0.16, 0.15].map((ratio) => width * ratio);
  const rowHeight = y(48);
  const rows = Math.max(lines.length, 1);
  const height = rowHeight * (rows + 1);
  let cursor = left;
  doc.save().strokeColor("#f5b0c6").lineWidth(0.7);
  doc.rect(left, top, width, height).stroke();
  [0, ...columns.slice(0, -1).map((_, index) => columns.slice(0, index + 1).reduce((sum, item) => sum + item, 0))].forEach((offset) => {
    if (offset > 0) doc.moveTo(left + offset, top).lineTo(left + offset, top + height).stroke();
  });
  for (let row = 1; row <= rows; row += 1) {
    doc.moveTo(left, top + rowHeight * row).lineTo(left + width, top + rowHeight * row).stroke();
  }
  doc.restore();

  const labels = ["ลำดับ", "รายการสินค้า", "จำนวน", "ราคา/หน่วย", "จำนวนเงิน"];
  cursor = left;
  labels.forEach((label, index) => {
    drawTextAt(doc, label, cursor + x(3), top + y(12), columns[index] - x(6), { size: 8.5, align: index === 1 ? "left" : "center" });
    cursor += columns[index];
  });
  const hideQuantity = isTopupReceiptSummary(receipt);
  lines.forEach((line, row) => {
    cursor = left;
    const values = [String(row + 1), line.productName, hideQuantity ? "" : String(line.quantity), formatMoney(line.unitPrice), formatMoney(line.amount)];
    values.forEach((value, index) => {
      const align = index === 1 ? "left" : index < 3 ? "center" : "right";
      drawTextAt(doc, value, cursor + x(3), top + rowHeight * (row + 1) + y(12), columns[index] - x(6), { size: 8.5, align });
      cursor += columns[index];
    });
  });
}

function drawContinuationPage(doc: PDFKit.PDFDocument, receipt: ReceiptDocumentSummary, lines: ReceiptLineSnapshot[]) {
  drawReference(doc);
  const inset = x(25);
  const contentX = inset;
  const contentY = inset;
  const contentWidth = PAGE_WIDTH - inset * 2;
  const contentHeight = PAGE_HEIGHT - inset * 2;
  doc.save().roundedRect(contentX, contentY, contentWidth, contentHeight, x(22)).fillColor("#fffdfd").fill().lineWidth(1).strokeColor("#f28cae").stroke().restore();
  drawTextAt(doc, "รายการสินค้าเพิ่มเติม / Continued Items", contentX + x(30), contentY + y(30), contentWidth * 0.55, { size: 11, color: "#d8447b" });
  drawTextAt(doc, `Receipt No. ${receipt.receiptNo}`, contentX + contentWidth * 0.52, contentY + y(30), contentWidth * 0.43, { size: 9, color: "#d8447b", align: "right" });
  drawContinuationTable(doc, receipt, lines, contentX + x(30), contentY + y(75), contentWidth - x(60));
  const summaryTop = contentY + y(75) + y(48 * (Math.max(lines.length, 1) + 1)) + y(24);
  drawTextAt(doc, `ยอดสุทธิ / Net Total: ${formatMoney(receipt.totalAmount)} บาท`, contentX + contentWidth * 0.45, summaryTop, contentWidth * 0.5, { size: 11, color: "#d8447b", align: "right" });
}

function drawFirstPage(doc: PDFKit.PDFDocument, receipt: ReceiptDocumentSummary, lines: ReceiptLineSnapshot[]) {
  drawReference(doc);
  drawReceiptMeta(doc, receipt);
  drawBuyer(doc, receipt);
  drawItems(doc, receipt, lines);
  drawSummary(doc, receipt);
  drawSignature(doc, receipt);
}

export async function generateCashReceiptPdf(receipt: ReceiptDocumentSummary): Promise<Buffer> {
  if (!fs.existsSync(ITIM_FONT)) throw new Error("ไม่พบฟอนต์ Itim สำหรับสร้าง PDF");
  if (!fs.existsSync(REFERENCE_ASSET)) throw new Error("ไม่พบภาพต้นแบบบิลเงินสด");

  const pages: ReceiptLineSnapshot[][] = [];
  for (let index = 0; index < receipt.lines.length; index += LINES_PER_PAGE) {
    pages.push(receipt.lines.slice(index, index + LINES_PER_PAGE));
  }
  if (pages.length === 0) pages.push([]);

  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: true });
  const output = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  pages.forEach((lines, pageIndex) => {
    if (pageIndex > 0) doc.addPage({ size: "A4", margin: 0 });
    if (pageIndex === 0) drawFirstPage(doc, receipt, lines);
    else drawContinuationPage(doc, receipt, lines);
  });

  doc.end();
  return output;
}
