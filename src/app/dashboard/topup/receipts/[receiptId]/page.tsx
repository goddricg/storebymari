import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ReceiptDocument } from "@/components/receipts/receipt-document";
import { requireUser } from "@/lib/auth/server";
import { getTopupCashReceiptForUserById } from "@/lib/receipts/topup-repository";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "ใบเสร็จเติมพ้อยท์", robots: { index: false, follow: false } };
}

export default async function TopupReceiptPage({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
  const user = await requireUser();
  const { receiptId } = await params;
  const receipt = await getTopupCashReceiptForUserById(receiptId, user.id);
  if (!receipt) notFound();
  return <ReceiptDocument receipt={receipt} />;
}
