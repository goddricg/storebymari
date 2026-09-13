import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/server";
import { getPurchaseCaseForUser } from "@/lib/purchase-cases/repository";
import { ReceiptDocument } from "@/components/receipts/receipt-document";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "บิลเงินสด", robots: { index: false, follow: false } };
}

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ caseOrderId: string }>;
}) {
  const user = await requireUser();
  const { caseOrderId } = await params;
  const purchaseCase = await getPurchaseCaseForUser(caseOrderId, user.id);
  if (!purchaseCase?.receipt || purchaseCase.status !== "COMPLETED") notFound();
  return <ReceiptDocument receipt={purchaseCase.receipt} />;
}
