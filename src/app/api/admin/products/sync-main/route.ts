import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { findProductByTypeId, syncProductToFirestore } from "@/lib/products/repository";
import { getSiteId } from "@/lib/site";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";

export async function POST(request: NextRequest) {
  try {
    const { typeId, secret } = await request.json();
    
    // ตรวจสอบ Secret Key
    if (!secret || secret !== process.env.MAIN_SITE_SYNC_SECRET) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    // This endpoint writes the main-site realtime projection. Reject a
    // misrouted child deployment before reading a product or syncing it.
    if (getSiteId() !== "main") {
      return NextResponse.json({ success: false, message: "Main site only" }, { status: 403 });
    }

    if (!typeId) {
      return NextResponse.json({ success: false, message: "Missing typeId" }, { status: 400 });
    }

    const product = await findProductByTypeId(typeId);
    let syncResult: "success" | "failed" = product ? "success" : "failed";
    let reasonCode: string | null = product ? null : "PRODUCT_NOT_FOUND";
    if (product) {
      try {
        await syncProductToFirestore(product);
      } catch (syncError) {
        syncResult = "failed";
        reasonCode = "FIRESTORE_SYNC_FAILED";
        console.error("Firestore sync error:", syncError);
      }
    }

    await recordAdminAuditEvent({
      action: "PRODUCT_SYNC_MAIN",
      category: "system",
      severity: "high",
      entityType: "product",
      entityId: typeId,
      entityLabel: product?.name || typeId,
      result: syncResult,
      reasonCode,
      details: "Synchronized a product to the main-site projection",
      source: "system",
      ...getAdminAuditRequestContext(request),
    });

    (revalidateTag as any)("products");

    return NextResponse.json({ success: true, message: "Sync successful" });
  } catch (error) {
    console.error("Sync main site error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
