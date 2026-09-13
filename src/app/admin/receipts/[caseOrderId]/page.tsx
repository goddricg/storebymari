import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireSuperAdmin } from "@/lib/auth/server";
import { getPurchaseCaseForAdmin } from "@/lib/purchase-cases/repository";
import { ReceiptDocument } from "@/components/receipts/receipt-document";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "บิลเงินสด | Admin", robots: { index: false, follow: false } };
}

export default async function AdminReceiptPage({
  params,
}: {
  params: Promise<{ caseOrderId: string }>;
}) {
  await requireSuperAdmin();
  const { caseOrderId } = await params;
  const purchaseCase = await getPurchaseCaseForAdmin(caseOrderId);
  if (!purchaseCase?.receipt || purchaseCase.status !== "COMPLETED") notFound();
  return <ReceiptDocument receipt={purchaseCase.receipt} />;
}
