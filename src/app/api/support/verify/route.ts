import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server";
import pool from "@/lib/mysql";
import { extractProductDetails } from "@/lib/support/date-parser";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const identifier = (body.identifier || "").trim();
    const orderId = (body.orderId || "").trim();

    if (!identifier && !orderId) {
      return NextResponse.json(
        { ok: false, message: "กรุณาระบุ Email หรือ ลิงก์สินค้า" },
        { status: 400 }
      );
    }

    // 1. Query matching order from orders table
    let orderRow: any = null;

    if (orderId) {
      const [rows] = await pool.execute(
        "SELECT * FROM orders WHERE id = ? AND buyer_user_id = ? LIMIT 1",
        [orderId, user.id]
      );
      const list = rows as any[];
      if (list.length > 0) orderRow = list[0];
    }

    if (!orderRow && identifier) {
      const isEmail = identifier.includes("@");
      if (isEmail) {
        const [rows] = await pool.execute(
          `SELECT * FROM orders 
           WHERE buyer_user_id = ? 
             AND (account_email = ? OR product_details LIKE ?)
           ORDER BY created_at DESC 
           LIMIT 1`,
          [user.id, identifier, `%${identifier}%`]
        );
        const list = rows as any[];
        if (list.length > 0) orderRow = list[0];
      } else {
        // Search by link or token
        const [rows] = await pool.execute(
          `SELECT * FROM orders 
           WHERE buyer_user_id = ? 
             AND product_details LIKE ?
           ORDER BY created_at DESC 
           LIMIT 1`,
          [user.id, `%${identifier}%`]
        );
        const list = rows as any[];
        if (list.length > 0) orderRow = list[0];
      }
    }

    // If order not found in user's account
    if (!orderRow) {
      return NextResponse.json({
        ok: true,
        matched: false,
        warrantyStatus: "not_found",
        message: "ไม่พบประวัติการสั่งซื้อสำหรับสินค้านี้ในบัญชีของคุณ",
      });
    }

    // 2. Extract delivery info & warranty date
    const extracted = extractProductDetails(orderRow.product_details);

    // 3. Check previous support cases for this order or account
    const [caseRows] = await pool.execute(
      `SELECT id, case_code, status, admin_note, admin_response, handled_by_name, handled_at, created_at, claim_iteration
       FROM support_cases 
       WHERE user_id = ? 
         AND (order_id = ? OR (account_email IS NOT NULL AND account_email = ?))
       ORDER BY created_at DESC`,
      [user.id, orderRow.id, extracted.email || orderRow.account_email || identifier]
    );
    const existingCases = caseRows as any[];

    // Check if there is an active pending/in_progress case
    const activeCase = existingCases.find(c => c.status === "pending" || c.status === "in_progress");
    if (activeCase) {
      return NextResponse.json({
        ok: true,
        matched: true,
        hasActiveCase: true,
        activeCase: {
          id: activeCase.id,
          caseCode: activeCase.case_code,
          status: activeCase.status,
          createdAt: activeCase.created_at,
        },
        message: `สินค้านี้มีเคสที่กำลังดำเนินการอยู่แล้ว (${activeCase.case_code})`,
        order: {
          id: orderRow.id,
          productName: orderRow.product_name,
        }
      });
    }

    // Calculate claim iteration and previous case reference
    const resolvedCases = existingCases.filter(c => c.status === "resolved");
    const previousCase = resolvedCases[0] || null;
    const claimIteration = existingCases.length + 1;

    return NextResponse.json({
      ok: true,
      matched: true,
      hasActiveCase: false,
      order: {
        id: orderRow.id,
        productName: orderRow.product_name,
        productTypeId: orderRow.product_type_id,
        purchaseDate: orderRow.purchase_date,
        createdAt: orderRow.created_at,
      },
      extracted: {
        email: extracted.email || orderRow.account_email || (identifier.includes("@") ? identifier : null),
        password: extracted.password || orderRow.account_password,
        screenNumber: extracted.screenNumber,
        caseType: extracted.caseType,
        inviteLink: extracted.inviteLink,
      },
      warranty: extracted.warranty,
      reclaim: {
        claimIteration,
        isReclaim: claimIteration > 1,
        previousCaseId: previousCase?.id || null,
        previousCaseCode: previousCase?.case_code || null,
        previousAdminResponse: previousCase?.admin_response || null,
        previousAdminNote: previousCase?.admin_note || null,
        previousHandledByName: previousCase?.handled_by_name || null,
        previousHandledAt: previousCase?.handled_at || null,
      },
    });
  } catch (error) {
    console.error("Error in support verify API:", error);
    const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการตรวจสอบ";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
