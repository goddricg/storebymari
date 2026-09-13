import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ReceiptDocument } from "@/components/receipts/receipt-document";
import { requireSuperAdmin } from "@/lib/auth/server";
import { getTopupCashReceiptForAdminById } from "@/lib/receipts/topup-repository";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "ใบเสร็จเติมพ้อยท์ | Admin", robots: { index: false, follow: false } };
}

export default async function AdminTopupReceiptPage({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
  await requireSuperAdmin();
  const { receiptId } = await params;
  const receipt = await getTopupCashReceiptForAdminById(receiptId);
  if (!receipt) notFound();
  return <ReceiptDocument receipt={receipt} />;
}
