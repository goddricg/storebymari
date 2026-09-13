export type ReceiptSellerSnapshot = {
  name: string;
  address: string;
  email: string;
  phone: string;
  footer: string;
  logoUrl: string;
};

export type ReceiptBuyerSnapshot = {
  name: string;
  address: string | null;
  taxId: string | null;
  phone: string | null;
  email: string | null;
};

export type ReceiptLineSnapshot = {
  productTypeId: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

export type CashReceiptSummary = {
  id: string;
  siteId: string;
  caseOrderId: string;
  receiptNo: string;
  status: "ISSUED" | "VOIDED";
  issuedAt: string;
  totalAmount: number;
  seller: ReceiptSellerSnapshot;
  buyer: ReceiptBuyerSnapshot;
  lines: ReceiptLineSnapshot[];
  templateVersion: string;
};

/**
 * A top-up receipt uses the same artwork/renderer as a product cash receipt,
 * but keeps its source and financial meaning explicit. `totalAmount` is the
 * cash paid; the credit/bonus fields are points awarded to the account.
 */
export type TopupCashReceiptSummary = {
  id: string;
  siteId: string;
  sourceType: "TOPUP";
  caseOrderId: null;
  topupRequestId: string;
  transactionId: string;
  receiptNo: string;
  status: "ISSUED" | "VOIDED";
  issuedAt: string;
  totalAmount: number;
  amountPaid: number;
  basePoints: number;
  bonusPoints: number;
  creditedPoints: number;
  seller: ReceiptSellerSnapshot;
  buyer: ReceiptBuyerSnapshot;
  lines: ReceiptLineSnapshot[];
  templateVersion: string;
};

export type ReceiptDocumentSummary = CashReceiptSummary | TopupCashReceiptSummary;

export function isTopupReceiptSummary(
  receipt: ReceiptDocumentSummary,
): receipt is TopupCashReceiptSummary {
  return "sourceType" in receipt && receipt.sourceType === "TOPUP";
}

export function getReceiptReferenceNote(receipt: ReceiptDocumentSummary): string {
  return isTopupReceiptSummary(receipt)
    ? `อ้างอิง Top-up: ${receipt.transactionId}`
    : `อ้างอิง Case Order: ${receipt.caseOrderId}`;
}
