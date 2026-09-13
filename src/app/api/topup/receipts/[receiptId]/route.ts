import { requireUser } from "@/lib/auth/server";
import { generateCashReceiptPdf } from "@/lib/receipts/pdf";
import { getTopupCashReceiptForUserById } from "@/lib/receipts/topup-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ receiptId: string }> },
) {
  const user = await requireUser();
  const { receiptId } = await params;
  const receipt = await getTopupCashReceiptForUserById(receiptId, user.id);
  if (!receipt) {
    return Response.json({ message: "ไม่พบใบเสร็จเติมพ้อยท์ที่สามารถดาวน์โหลดได้" }, { status: 404 });
  }

  try {
    const pdf = await generateCashReceiptPdf(receipt);
    return new Response(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="topup-receipt-${receipt.receiptNo}.pdf"`,
        "Content-Length": String(pdf.length),
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Top-up receipt PDF generation failed:", error);
    return Response.json({ message: "ไม่สามารถสร้างไฟล์ใบเสร็จเติมพ้อยท์ได้" }, { status: 500 });
  }
}
