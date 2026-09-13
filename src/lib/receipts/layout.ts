export type ReceiptLayoutBox = Readonly<{
  top: number;
  left: number;
  width: number;
  height: number;
}>;

/**
 * The artwork is the visual master for both the browser receipt and the
 * server-generated PDF. Keep its reference coordinate system explicit so
 * overlay geometry can be shared instead of being retyped in each renderer.
 */
export const RECEIPT_ARTWORK = {
  assetPath: "/receipt-assets/v3/recp-new-v1.png",
  referenceWidth: 1055,
  referenceHeight: 1491,
} as const;

export const RECEIPT_TYPOGRAPHY = {
  metaReceiptNo: 11,
  metaDate: 11,
  buyer: 12,
  items: 11,
  notes: 11,
  subtotal: 11,
  total: 13,
  signatureDate: 11,
} as const;

export const RECEIPT_LAYOUT = {
  firstPage: {
    meta: {
      receiptNo: { top: 21.7, left: 78.6, width: 15.2, height: 2.1 },
      date: { top: 24.85, left: 73.5, width: 15.2, height: 2.1 },
    },
    buyer: {
      name: { top: 29.05, left: 28.0, width: 67.5, height: 2.4 },
      address: { top: 31.9, left: 21.5, width: 73.0, height: 2.4 },
      taxId: { top: 35.1, left: 31.7, width: 63.0, height: 2.4 },
      phone: { top: 38.6, left: 22.0, width: 73.0, height: 2.4 },
    },
    table: { top: 42.25, left: 3.55, width: 92.85, height: 35.45 },
    // Keep the item overlay inside the table and nudge each row's text 20% into its line.
    items: { top: 46.4, left: 4.6, width: 90.7, height: 31.25, textOffset: 0.2 },
    summary: {
      notes: { top: 83.25, left: 5.8, width: 42.8, height: 4.4 },
      subtotal: { top: 81.15, left: 74.0, width: 19.0, height: 2.5 },
      total: { top: 85.8, left: 74.0, width: 19.0, height: 2.5 },
    },
    signatures: {
      signature: { top: 91.5, left: 23.1, width: 12.0, height: 2.52 },
      dateDay: { top: 95.95, left: 23.6, width: 3.7, height: 1.8 },
      dateMonth: { top: 95.95, left: 28.8, width: 3.7, height: 1.8 },
      dateYear: { top: 95.95, left: 34.0, width: 5.0, height: 1.8 },
    },
    footer: { bottom: 0, left: 35, width: 30, height: 2.9 },
  },
  table: {
    columnRatios: [0.083, 0.439, 0.147, 0.156, 0.175],
    rowCount: 10,
  },
} as const;

const percent = (value: number) => `${value}%`;
const pixels = (value: number) => `${value}px`;

/** CSS variables consumed by the receipt overlay stylesheet. */
export const RECEIPT_LAYOUT_CSS_VARS = {
  "--receipt-font-meta-no": pixels(RECEIPT_TYPOGRAPHY.metaReceiptNo),
  "--receipt-font-meta-date": pixels(RECEIPT_TYPOGRAPHY.metaDate),
  "--receipt-font-buyer": pixels(RECEIPT_TYPOGRAPHY.buyer),
  "--receipt-font-items": pixels(RECEIPT_TYPOGRAPHY.items),
  "--receipt-font-notes": pixels(RECEIPT_TYPOGRAPHY.notes),
  "--receipt-font-subtotal": pixels(RECEIPT_TYPOGRAPHY.subtotal),
  "--receipt-font-total": pixels(RECEIPT_TYPOGRAPHY.total),
  "--receipt-font-signature-date": pixels(RECEIPT_TYPOGRAPHY.signatureDate),
  "--receipt-meta-no-top": percent(RECEIPT_LAYOUT.firstPage.meta.receiptNo.top),
  "--receipt-meta-no-left": percent(RECEIPT_LAYOUT.firstPage.meta.receiptNo.left),
  "--receipt-meta-no-width": percent(RECEIPT_LAYOUT.firstPage.meta.receiptNo.width),
  "--receipt-meta-no-height": percent(RECEIPT_LAYOUT.firstPage.meta.receiptNo.height),
  "--receipt-meta-date-top": percent(RECEIPT_LAYOUT.firstPage.meta.date.top),
  "--receipt-meta-date-left": percent(RECEIPT_LAYOUT.firstPage.meta.date.left),
  "--receipt-meta-date-width": percent(RECEIPT_LAYOUT.firstPage.meta.date.width),
  "--receipt-meta-date-height": percent(RECEIPT_LAYOUT.firstPage.meta.date.height),
  "--receipt-buyer-name-top": percent(RECEIPT_LAYOUT.firstPage.buyer.name.top),
  "--receipt-buyer-name-left": percent(RECEIPT_LAYOUT.firstPage.buyer.name.left),
  "--receipt-buyer-name-width": percent(RECEIPT_LAYOUT.firstPage.buyer.name.width),
  "--receipt-buyer-name-height": percent(RECEIPT_LAYOUT.firstPage.buyer.name.height),
  "--receipt-buyer-address-top": percent(RECEIPT_LAYOUT.firstPage.buyer.address.top),
  "--receipt-buyer-address-left": percent(RECEIPT_LAYOUT.firstPage.buyer.address.left),
  "--receipt-buyer-address-width": percent(RECEIPT_LAYOUT.firstPage.buyer.address.width),
  "--receipt-buyer-address-height": percent(RECEIPT_LAYOUT.firstPage.buyer.address.height),
  "--receipt-buyer-tax-top": percent(RECEIPT_LAYOUT.firstPage.buyer.taxId.top),
  "--receipt-buyer-tax-left": percent(RECEIPT_LAYOUT.firstPage.buyer.taxId.left),
  "--receipt-buyer-tax-width": percent(RECEIPT_LAYOUT.firstPage.buyer.taxId.width),
  "--receipt-buyer-tax-height": percent(RECEIPT_LAYOUT.firstPage.buyer.taxId.height),
  "--receipt-buyer-phone-top": percent(RECEIPT_LAYOUT.firstPage.buyer.phone.top),
  "--receipt-buyer-phone-left": percent(RECEIPT_LAYOUT.firstPage.buyer.phone.left),
  "--receipt-buyer-phone-width": percent(RECEIPT_LAYOUT.firstPage.buyer.phone.width),
  "--receipt-buyer-phone-height": percent(RECEIPT_LAYOUT.firstPage.buyer.phone.height),
  "--receipt-lines-top": percent(RECEIPT_LAYOUT.firstPage.table.top),
  "--receipt-lines-left": percent(RECEIPT_LAYOUT.firstPage.table.left),
  "--receipt-lines-width": percent(RECEIPT_LAYOUT.firstPage.table.width),
  "--receipt-lines-height": percent(RECEIPT_LAYOUT.firstPage.table.height),
  "--receipt-items-top": percent(RECEIPT_LAYOUT.firstPage.items.top),
  "--receipt-items-left": percent(RECEIPT_LAYOUT.firstPage.items.left),
  "--receipt-items-width": percent(RECEIPT_LAYOUT.firstPage.items.width),
  "--receipt-items-height": percent(RECEIPT_LAYOUT.firstPage.items.height),
  "--receipt-items-text-offset": percent(RECEIPT_LAYOUT.firstPage.items.textOffset * 100),
  "--receipt-summary-notes-top": percent(RECEIPT_LAYOUT.firstPage.summary.notes.top),
  "--receipt-summary-notes-left": percent(RECEIPT_LAYOUT.firstPage.summary.notes.left),
  "--receipt-summary-notes-width": percent(RECEIPT_LAYOUT.firstPage.summary.notes.width),
  "--receipt-summary-notes-height": percent(RECEIPT_LAYOUT.firstPage.summary.notes.height),
  "--receipt-summary-subtotal-top": percent(RECEIPT_LAYOUT.firstPage.summary.subtotal.top),
  "--receipt-summary-subtotal-left": percent(RECEIPT_LAYOUT.firstPage.summary.subtotal.left),
  "--receipt-summary-subtotal-width": percent(RECEIPT_LAYOUT.firstPage.summary.subtotal.width),
  "--receipt-summary-subtotal-height": percent(RECEIPT_LAYOUT.firstPage.summary.subtotal.height),
  "--receipt-summary-total-top": percent(RECEIPT_LAYOUT.firstPage.summary.total.top),
  "--receipt-summary-total-left": percent(RECEIPT_LAYOUT.firstPage.summary.total.left),
  "--receipt-summary-total-width": percent(RECEIPT_LAYOUT.firstPage.summary.total.width),
  "--receipt-summary-total-height": percent(RECEIPT_LAYOUT.firstPage.summary.total.height),
  "--receipt-signature-top": percent(RECEIPT_LAYOUT.firstPage.signatures.signature.top),
  "--receipt-signature-left": percent(RECEIPT_LAYOUT.firstPage.signatures.signature.left),
  "--receipt-signature-width": percent(RECEIPT_LAYOUT.firstPage.signatures.signature.width),
  "--receipt-signature-height": percent(RECEIPT_LAYOUT.firstPage.signatures.signature.height),
  "--receipt-signature-date-day-top": percent(RECEIPT_LAYOUT.firstPage.signatures.dateDay.top),
  "--receipt-signature-date-day-left": percent(RECEIPT_LAYOUT.firstPage.signatures.dateDay.left),
  "--receipt-signature-date-day-width": percent(RECEIPT_LAYOUT.firstPage.signatures.dateDay.width),
  "--receipt-signature-date-day-height": percent(RECEIPT_LAYOUT.firstPage.signatures.dateDay.height),
  "--receipt-signature-date-month-left": percent(RECEIPT_LAYOUT.firstPage.signatures.dateMonth.left),
  "--receipt-signature-date-year-left": percent(RECEIPT_LAYOUT.firstPage.signatures.dateYear.left),
  "--receipt-footer-left": percent(RECEIPT_LAYOUT.firstPage.footer.left),
  "--receipt-footer-width": percent(RECEIPT_LAYOUT.firstPage.footer.width),
  "--receipt-footer-height": percent(RECEIPT_LAYOUT.firstPage.footer.height),
  "--receipt-table-col-index": percent(RECEIPT_LAYOUT.table.columnRatios[0] * 100),
  "--receipt-table-col-product": percent(RECEIPT_LAYOUT.table.columnRatios[1] * 100),
  "--receipt-table-col-quantity": percent(RECEIPT_LAYOUT.table.columnRatios[2] * 100),
  "--receipt-table-col-unit": percent(RECEIPT_LAYOUT.table.columnRatios[3] * 100),
  "--receipt-table-col-amount": percent(RECEIPT_LAYOUT.table.columnRatios[4] * 100),
} as const;
