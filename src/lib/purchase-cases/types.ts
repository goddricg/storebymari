import type {
  CashReceiptSummary,
  ReceiptLineSnapshot,
} from "@/lib/receipts/types";

export type PurchaseCaseStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED"
  | "CANCELLED";

export type PurchaseCaseItemSummary = ReceiptLineSnapshot & {
  id: string;
  lineIndex: number;
  orderIds: string[];
};

export type PurchaseCaseSummary = {
  id: string;
  siteId: string;
  caseOrderNo: string;
  buyerUserId: string;
  status: PurchaseCaseStatus;
  totalPoints: number;
  createdAt: string;
  completedAt: string | null;
  items: PurchaseCaseItemSummary[];
  receipt: CashReceiptSummary | null;
  buyerEmail?: string | null;
  buyerDisplayName?: string | null;
  siteName?: string | null;
};
