import { requireUser } from "@/lib/auth/server";
import { getCashReceiptForCase } from "@/lib/receipts/repository";
import { generateCashReceiptPdf } from "@/lib/receipts/pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ caseOrderId: string }> },
) {
  const user = await requireUser();
  const { caseOrderId } = await params;
  const receipt = await getCashReceiptForCase(caseOrderId, user.id);

  if (!receipt) {
    return Response.json({ message: "ไม่พบ Receipt ที่สามารถดาวน์โหลดได้" }, { status: 404 });
  }

  try {
    const pdf = await generateCashReceiptPdf(receipt);
    return new Response(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="receipt-${receipt.receiptNo}.pdf"`,
        "Content-Length": String(pdf.length),
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Receipt PDF generation failed:", error);
    return Response.json({ message: "ไม่สามารถสร้างไฟล์ Receipt PDF ได้" }, { status: 500 });
  }
}
