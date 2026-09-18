import pool from "@/lib/mysql";
import { AdminTierLevel, AdminTierProfile } from "@/lib/mimi/admin-tiers";

export interface MimiShopOverview {
  totalUsers: number;
  newUsersToday: number;
  totalOrders: number;
  ordersToday: number;
  revenueToday: number;
  totalRevenue: number;
  totalProfit?: number; // Tier SSS only
  totalCost?: number; // Tier SSS only
  pendingSupportCases: number;
  outOfStockProductsCount: number;
  topupCountToday: number;
  topupAmountToday: number;
}

export interface MimiTopSeller {
  productName: string;
  salesCount: number;
  totalRevenue: number;
}

export interface MimiCategoryInfo {
  id: string;
  name: string;
  description: string | null;
}

export interface MimiProductStockInfo {
  id: string;
  name: string;
  price: number;
  priceVip: number;
  costPrice?: number; // Tier SSS only
  stock: number;
  stockDeliveryType: string;
  details: string | null;
  badge: string | null;
}

export interface MimiBonusRuleInfo {
  triggerAmount: number;
  bonusPoints: number;
}

export interface MimiGiftInfo {
  baseProductName: string;
  giftProductName: string;
}

export interface MimiUserInfo {
  id: string;
  email: string;
  displayName: string | null;
  points: number;
  userTier: string;
  totalTopupAmount: number;
  topupCount: number;
  createdAt: string;
  isActive: boolean;
  isBanned: boolean;
}

export interface MimiOrderInfo {
  id: string;
  caseOrderId: string | null;
  productName: string;
  price: number;
  costPrice?: number;
  profit?: number;
  purchaseDate: string | null;
  buyerEmail: string | null;
  buyerDisplayName: string | null;
  typeMenu: string | null;
}

export interface MimiSupportCaseInfo {
  caseCode: string;
  productName: string | null;
  caseType: string;
  status: string;
  problemDescription: string;
  adminResponse: string | null;
  createdAt: string;
}

// ==========================================
// 1. Overview & Finance Analytics
// ==========================================

export async function getMimiShopOverview(tier: AdminTierLevel): Promise<MimiShopOverview> {
  const result: MimiShopOverview = {
    totalUsers: 0,
    newUsersToday: 0,
    totalOrders: 0,
    ordersToday: 0,
    revenueToday: 0,
    totalRevenue: 0,
    pendingSupportCases: 0,
    outOfStockProductsCount: 0,
    topupCountToday: 0,
    topupAmountToday: 0,
  };

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStr = todayStart.toISOString().slice(0, 19).replace("T", " ");

    const [
      [userCountRow],
      [usersTodayRow],
      [ordersAllRow],
      [ordersTodayRow],
      [supportPendingRow],
      [outOfStockRow],
      [topupTodayRow],
    ] = await Promise.all([
      pool.execute("SELECT COUNT(*) as count FROM users"),
      pool.execute("SELECT COUNT(*) as count FROM users WHERE created_at >= ?", [todayStr]),
      tier === "SSS"
        ? pool.execute("SELECT COUNT(*) as count, COALESCE(SUM(price), 0) as total_rev, COALESCE(SUM(profit), 0) as total_prof, COALESCE(SUM(cost_price), 0) as total_cost FROM orders")
        : pool.execute("SELECT COUNT(*) as count, COALESCE(SUM(price), 0) as total_rev FROM orders"),
      pool.execute("SELECT COUNT(*) as count, COALESCE(SUM(price), 0) as rev_today FROM orders WHERE created_at >= ?", [todayStr]),
      pool.execute("SELECT COUNT(*) as count FROM support_cases WHERE status = 'pending'"),
      pool.execute("SELECT COUNT(*) as count FROM products WHERE is_published = 1 AND stock <= 0"),
      pool.execute("SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as sum_today FROM topup_requests WHERE status = 'SUCCEEDED' AND created_at >= ?", [todayStr]),
    ]);

    result.totalUsers = Number((userCountRow as any[])[0]?.count || 0);
    result.newUsersToday = Number((usersTodayRow as any[])[0]?.count || 0);

    const ordersAll = (ordersAllRow as any[])[0] || {};
    result.totalOrders = Number(ordersAll.count || 0);
    result.totalRevenue = Number(ordersAll.total_rev || 0);

    if (tier === "SSS") {
      result.totalProfit = Number(ordersAll.total_prof || 0);
      result.totalCost = Number(ordersAll.total_cost || 0);
    }

    const ordersToday = (ordersTodayRow as any[])[0] || {};
    result.ordersToday = Number(ordersToday.count || 0);
    result.revenueToday = Number(ordersToday.rev_today || 0);

    result.pendingSupportCases = Number((supportPendingRow as any[])[0]?.count || 0);
    result.outOfStockProductsCount = Number((outOfStockRow as any[])[0]?.count || 0);

    const topupToday = (topupTodayRow as any[])[0] || {};
    result.topupCountToday = Number(topupToday.count || 0);
    result.topupAmountToday = Number(topupToday.sum_today || 0);
  } catch (err) {
    console.error("[Mimi DB] Error in getMimiShopOverview:", err);
  }

  return result;
}

// ==========================================
// 2. Product Sales History & Top Sellers
// ==========================================

export async function getMimiTopSellingProducts(limit = 5): Promise<MimiTopSeller[]> {
  try {
    const [rows] = await pool.execute(
      `SELECT product_name, COUNT(*) as sales_count, COALESCE(SUM(price), 0) as total_revenue
       FROM orders
       WHERE product_name IS NOT NULL AND product_name != ''
       GROUP BY product_name
       ORDER BY sales_count DESC
       LIMIT ?`,
      [String(limit)]
    );

    return (rows as any[]).map((r) => ({
      productName: String(r.product_name || "สินค้า"),
      salesCount: Number(r.sales_count || 0),
      totalRevenue: Number(r.total_revenue || 0),
    }));
  } catch (err) {
    console.error("[Mimi DB] Error in getMimiTopSellingProducts:", err);
    return [];
  }
}

export interface MimiTodayOrderProduct {
  productName: string;
  count: number;
}

export async function getMimiTodayOrdersBreakdown(): Promise<{
  totalOrders: number;
  products: MimiTodayOrderProduct[];
}> {
  try {
    const [rows] = await pool.execute(
      `SELECT product_name, COUNT(*) as count
       FROM orders
       WHERE DATE(CONVERT_TZ(created_at, '+00:00', '+07:00')) = DATE(CONVERT_TZ(NOW(), '+00:00', '+07:00'))
         AND product_name IS NOT NULL AND product_name != ''
       GROUP BY product_name
       ORDER BY count DESC`
    );

    const products = (rows as any[]).map((r) => ({
      productName: String(r.product_name || "สินค้า"),
      count: Number(r.count || 0),
    }));

    const totalOrders = products.reduce((acc, curr) => acc + curr.count, 0);
    return { totalOrders, products };
  } catch (err) {
    console.error("[Mimi DB] Error in getMimiTodayOrdersBreakdown:", err);
    return { totalOrders: 0, products: [] };
  }
}

// ==========================================
// 3. Categories
// ==========================================

export async function getMimiCategories(): Promise<MimiCategoryInfo[]> {
  try {
    const [rows] = await pool.execute(
      "SELECT id, name, description FROM categories WHERE is_active = 1 ORDER BY display_order ASC, name ASC"
    );
    return (rows as any[]).map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? null,
    }));
  } catch (err) {
    console.error("[Mimi DB] Error in getMimiCategories:", err);
    return [];
  }
}

// ==========================================
// 4. Products & Stock Details
// ==========================================

export async function getMimiProductsStock(includeCost = false): Promise<MimiProductStockInfo[]> {
  try {
    const [rows] = await pool.execute(
      `SELECT id, name, price, price_vip, cost_price, stock, stock_delivery_type, details, badge
       FROM products
       WHERE is_published = 1
       ORDER BY stock DESC, name ASC`
    );

    return (rows as any[]).map((r) => {
      const item: MimiProductStockInfo = {
        id: r.id,
        name: r.name,
        price: Number(r.price || 0),
        priceVip: Number(r.price_vip || 0),
        stock: Number(r.stock || 0),
        stockDeliveryType: r.stock_delivery_type || "account-pool",
        details: r.details ?? null,
        badge: r.badge ?? null,
      };
      if (includeCost) {
        item.costPrice = Number(r.cost_price || 0);
      }
      return item;
    });
  } catch (err) {
    console.error("[Mimi DB] Error in getMimiProductsStock:", err);
    return [];
  }
}

// ==========================================
// 5. Topup Bonus Promotions
// ==========================================

export async function getMimiTopupBonusRules(): Promise<MimiBonusRuleInfo[]> {
  try {
    const [rows] = await pool.execute(
      "SELECT trigger_amount, bonus_points FROM topup_bonus_rules WHERE is_active = 1 ORDER BY trigger_amount ASC"
    );
    return (rows as any[]).map((r) => ({
      triggerAmount: Number(r.trigger_amount || 0),
      bonusPoints: Number(r.bonus_points || 0),
    }));
  } catch (err) {
    console.error("[Mimi DB] Error in getMimiTopupBonusRules:", err);
    return [];
  }
}

// ==========================================
// 6. Gifts & Freebies Options
// ==========================================

export async function getMimiGiftOptions(): Promise<MimiGiftInfo[]> {
  try {
    const [rows] = await pool.execute(
      `SELECT base_product_type_id, gift_product_type_id
       FROM product_gift_options
       WHERE is_active = 1
       ORDER BY created_at DESC`
    );
    return (rows as any[]).map((r) => ({
      baseProductName: r.base_product_type_id,
      giftProductName: r.gift_product_type_id,
    }));
  } catch (err) {
    console.error("[Mimi DB] Error in getMimiGiftOptions:", err);
    return [];
  }
}

// ==========================================
// 7. Users Lookup
// ==========================================

export async function findMimiUser(query: string): Promise<MimiUserInfo | null> {
  if (!query || query.trim().length === 0) return null;
  const q = query.trim().toLowerCase();

  try {
    const [rows] = await pool.execute(
      `SELECT id, email, display_name, points, user_tier, total_topup_amount, topup_count, created_at, is_active, is_banned
       FROM users
       WHERE LOWER(email) = ? OR LOWER(display_name) = ? OR id = ?
       LIMIT 1`,
      [q, q, q]
    );

    const list = rows as any[];
    if (list.length === 0) {
      const [likeRows] = await pool.execute(
        `SELECT id, email, display_name, points, user_tier, total_topup_amount, topup_count, created_at, is_active, is_banned
         FROM users
         WHERE LOWER(display_name) LIKE ? OR LOWER(email) LIKE ?
         LIMIT 1`,
        [`%${q}%`, `%${q}%`]
      );
      const likeList = likeRows as any[];
      if (likeList.length > 0) {
        list.push(likeList[0]);
      }
    }

    if (list.length === 0) return null;
    const r = list[0];
    return {
      id: r.id,
      email: r.email,
      displayName: r.display_name ?? null,
      points: Number(r.points || 0),
      userTier: r.user_tier || "normal",
      totalTopupAmount: Number(r.total_topup_amount || 0),
      topupCount: Number(r.topup_count || 0),
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : "",
      isActive: Boolean(r.is_active),
      isBanned: Boolean(r.is_banned),
    };
  } catch (err) {
    console.error("[Mimi DB] Error in findMimiUser:", err);
    return null;
  }
}

// ==========================================
// 8. Order Lookup
// ==========================================

export async function findMimiOrder(orderQuery: string, canViewCost = false): Promise<MimiOrderInfo | null> {
  if (!orderQuery || orderQuery.trim().length === 0) return null;
  const q = orderQuery.trim();

  try {
    const [rows] = await pool.execute(
      `SELECT id, case_order_id, product_name, price, cost_price, profit, purchase_date, buyer_email, buyer_display_name, type_menu
       FROM orders
       WHERE id = ? OR case_order_id = ?
       LIMIT 1`,
      [q, q]
    );

    const list = rows as any[];
    if (list.length === 0) return null;
    const r = list[0];
    const order: MimiOrderInfo = {
      id: r.id,
      caseOrderId: r.case_order_id ?? null,
      productName: r.product_name,
      price: Number(r.price || 0),
      purchaseDate: r.purchase_date ? new Date(r.purchase_date).toISOString() : null,
      buyerEmail: r.buyer_email ?? null,
      buyerDisplayName: r.buyer_display_name ?? null,
      typeMenu: r.type_menu ?? null,
    };
    if (canViewCost) {
      order.costPrice = Number(r.cost_price || 0);
      order.profit = Number(r.profit || 0);
    }
    return order;
  } catch (err) {
    console.error("[Mimi DB] Error in findMimiOrder:", err);
    return null;
  }
}

// ==========================================
// 9. Support Case Lookup
// ==========================================

export async function findMimiSupportCase(caseCode: string): Promise<MimiSupportCaseInfo | null> {
  if (!caseCode || caseCode.trim().length === 0) return null;
  const q = caseCode.trim();

  try {
    const [rows] = await pool.execute(
      `SELECT case_code, product_name, case_type, status, problem_description, admin_response, created_at
       FROM support_cases
       WHERE case_code = ? OR id = ?
       LIMIT 1`,
      [q, q]
    );

    const list = rows as any[];
    if (list.length === 0) return null;
    const r = list[0];
    return {
      caseCode: r.case_code,
      productName: r.product_name ?? null,
      caseType: r.case_type,
      status: r.status,
      problemDescription: r.problem_description || "",
      adminResponse: r.admin_response ?? null,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : "",
    };
  } catch (err) {
    console.error("[Mimi DB] Error in findMimiSupportCase:", err);
    return null;
  }
}

// ==========================================
// 10. Recent Topups
// ==========================================

export async function getMimiRecentTopups(limit = 5): Promise<any[]> {
  try {
    const [rows] = await pool.execute(
      `SELECT t.id, t.amount, t.bonus_points, t.status, t.failure_reason, t.created_at, u.email, u.display_name
       FROM topup_requests t
       LEFT JOIN users u ON t.user_id = u.id
       ORDER BY t.created_at DESC
       LIMIT ?`,
      [String(limit)]
    );
    return (rows as any[]).map((r) => ({
      amount: Number(r.amount || 0),
      bonus: Number(r.bonus_points || 0),
      status: r.status,
      failureReason: r.failure_reason ?? null,
      userEmail: r.email ?? null,
      userName: r.display_name ?? null,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : "",
    }));
  } catch (err) {
    console.error("[Mimi DB] Error in getMimiRecentTopups:", err);
    return [];
  }
}

/**
 * 10.1 Diagnostic helper for User Topup Issues (เติมเงินไม่ได้ / เติมไม่เข้า)
 */
export async function getMimiUserTopupDiagnostics(userQuery: string): Promise<string> {
  const user = await findMimiUser(userQuery);
  if (!user) {
    return `❌ ไม่พบบัญชีผู้ใช้สำหรับ "${userQuery}" ในระบบ (กรุณาให้ลูกค้าตรวจสอบชื่อ Username หรือ Email ที่สมัครบนเว็บ storebymari.com อีกครั้ง)`;
  }

  try {
    const [rows] = await pool.execute(
      `SELECT id, amount, bonus_points, credited_points, status, failure_reason, created_at, verified_at
       FROM topup_requests
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 5`,
      [user.id]
    );
    const topups = rows as any[];
    if (topups.length === 0) {
      return `👤 ข้อมูลบัญชี: ${user.displayName || "สมาชิก"} (${user.email}) | แต้มคงเหลือ: ฿${user.points.toFixed(2)}
⚠️ ผลการตรวจสอบ: ไม่พบประวัติการส่งสลิปเติมเงินในระบบเลย
💡 สาเหตุที่เป็นไปได้: สลิปยังอัปโหลดไม่สำเร็จจากฝั่งลูกค้า หรือระบบเครือข่ายขัดข้องช่วงส่งรูปสลิป
👉 แนวทางแนะนำ: ให้มิมิแนะนำลูกค้าให้ลองกดทำรายการและอัปโหลดสลิปใหม่อีก 1 - 2 ครั้งบนหน้าเว็บ`;
    }

    const lines = topups.map((t, idx) => {
      const dateStr = t.created_at ? new Date(t.created_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "-";
      let statusTh = t.status;
      if (t.status === "SUCCEEDED") statusTh = "สำเร็จแล้ว ✅";
      else if (t.status === "FAILED") statusTh = `ล้มเหลว ❌ (เหตุผล: ${t.failure_reason || "สลิปไม่ผ่านหรืออ่าน QR ไม่ได้"})`;
      else if (t.status === "PENDING" || t.status === "PROCESSING") statusTh = "กำลังตรวจสอบ / รอระบบประมวลผล ⏳";

      return `${idx + 1}. ยอด: ฿${Number(t.amount || 0).toLocaleString()} | วันเวลา: ${dateStr} | สถานะ: ${statusTh}`;
    });

    const latest = topups[0];
    let advice = "";
    if (latest.status === "FAILED") {
      advice = `\n💡 การวินิจฉัยสลิปล่าสุด: ระบบปฏิเสธเนื่องจาก "${latest.failure_reason || "ตรวจสอบสลิปไม่ผ่าน"}" หากลูกค้าแจ้งว่าโอนเงินจริงแล้ว ให้มิมิแจ้งส่งต่อพี่แอดมินร่างมนุษย์เพื่อตรวจสอบสเตตเมนต์ทันที`;
    } else if (latest.status === "PENDING" || latest.status === "PROCESSING") {
      advice = `\n💡 การวินิจฉัยสลิปล่าสุด: สลิปกำลังอยู่ในคิวประมวลผลของระบบ รบกวนลูกค้ารอสักครู่ (ปกติไม่เกิน 1-2 นาที) หรือลองรีเฟรชหน้าเว็บ`;
    } else if (latest.status === "SUCCEEDED") {
      advice = `\n💡 การวินิจฉัย: รายการเติมเงินล่าสุด ฿${Number(latest.amount || 0).toLocaleString()} สถานะขึ้นสำเร็จแล้ว และยอดแต้มปัจจุบันคือ ฿${user.points.toFixed(2)} ให้ลูกค้าตรวจสอบยอดแต้มบนเว็บอีกครั้ง`;
    }

    return `👤 ข้อมูลบัญชี: ${user.displayName || "สมาชิก"} (${user.email}) | แต้มคงเหลือ: ฿${user.points.toFixed(2)} | ยอดเติมสะสม: ฿${user.totalTopupAmount.toLocaleString()}
📋 ประวัติการเติมเงินล่าสุด 5 รายการ:
${lines.join("\n")}${advice}`;
  } catch (err) {
    console.error("[Mimi DB] Error in getMimiUserTopupDiagnostics:", err);
    return `⚠️ เกิดข้อผิดพลาดในการตรวจสอบข้อมูลเติมเงินของ "${userQuery}"`;
  }
}

// ==========================================
// 11. Intelligent Context Detector & Extractor
// ==========================================

/**
 * Detects user intent and fetches real-time DB data to dynamically inject into Gemini's prompt.
 */
export async function detectAndFetchDatabaseContext(
  text: string,
  isCustomer: boolean,
  tierProfile?: AdminTierProfile
): Promise<string> {
  const lower = text.toLowerCase();
  const contextParts: string[] = [];

  // Extract Email if mentioned
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const foundEmail = emailMatch ? emailMatch[0] : null;

  // Extract Username / User ID mention (e.g. user: xxx, username: xxx, ยูส xxx, ชื่อ xxx)
  const usernameMatch = text.match(/(?:user(?:name)?|ยูส(?:เซอร์)?|ชื่อผู้ใช้|ชื่อยูส|ไอดี)\s*[:= ]\s*([a-zA-Z0-9._-]+)/i);
  const foundUsername = usernameMatch ? usernameMatch[1] : null;

  // Search query for user if either email or username found
  const userQuery = foundEmail || foundUsername;

  // Extract Order ID or Case Order ID if mentioned
  const orderMatch = text.match(/(?:ord[-_]?[a-zA-Z0-9]{6,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  const foundOrderId = orderMatch ? orderMatch[0] : null;

  // Extract Case Code (e.g. SUP-12345)
  const caseMatch = text.match(/SUP-[a-zA-Z0-9_-]+/i);
  const foundCaseCode = caseMatch ? caseMatch[0] : null;

  // A. Customer-Specific Flow
  if (isCustomer) {
    // 1. Topup Issues & Slip Verification (เติมเงินไม่ได้ / เติมไม่เข้า)
    const isTopupIssue =
      lower.includes("เติมเงิน") ||
      lower.includes("เติมไม่เข้า") ||
      lower.includes("เติมไม่ได้") ||
      lower.includes("สลิป") ||
      lower.includes("เงินไม่เข้า") ||
      lower.includes("ยอดไม่เข้า") ||
      lower.includes("อัพสลิป") ||
      lower.includes("อัปสลิป") ||
      lower.includes("แนบสลิป");

    if (isTopupIssue) {
      if (userQuery) {
        const diagnostics = await getMimiUserTopupDiagnostics(userQuery);
        contextParts.push(`💳 ข้อมูลผลการตรวจสอบระบบเติมเงินหลังบ้าน (Live Topup Diagnostics):\n${diagnostics}`);
      } else {
        contextParts.push(
          `💳 [ขั้นตอนการรับมือเมื่อลูกค้าแจ้งเติมเงินไม่เข้า/เติมไม่ได้]:
1. ขั้นแรก: ให้มิมิแนะนำลูกค้าอย่างน่ารักและเป็นกันเอง ให้ลองกดอัปโหลดสลิปใหม่อีกสัก 1 - 2 ครั้งก่อนน้าา (บางทีระบบธนาคารอาจจะดีเลย์แป๊บหนึ่งค่า)
2. ขั้นสอง (ถ้าลูกค้าแจ้งว่าลองแล้วยังไม่ได้ หรือถามซ้ำ): ให้มิมิขอชื่อ User หรือ Email ที่ใช้เติมเงินบนเว็บ storebymari.com จากลูกค้า เพื่อให้มิมิไปตรวจสอบจากระบบหลังบ้านให้ทันที
3. หากลูกค้าแจ้งชื่อ User/Email มาแล้ว และมิมิตรวจสอบพบว่าเป็นที่ระบบเติมเงินขัดข้อง หรือมิมิไม่สามารถจัดการได้ ให้ส่งต่อแอดมินร่างมนุษย์ดำเนินการต่อทันที`
        );
      }
    }

    // 2. Netflix Holdhouse / OTP Code / Sign-in Code
    const isHoldhouseOtp =
      lower.includes("otp") ||
      lower.includes("sign in") ||
      lower.includes("signin") ||
      lower.includes("holdhouse") ||
      lower.includes("household") ||
      lower.includes("ครัวเรือน") ||
      lower.includes("บ้านเดี่ยว") ||
      lower.includes("รหัสทีวี") ||
      lower.includes("ขอรหัส") ||
      lower.includes("ขอโค้ด") ||
      lower.includes("ขอ code");

    if (isHoldhouseOtp) {
      contextParts.push(
        `📺 [คำแนะนำสำหรับ Netflix Holdhouse / OTP / Sign-in Code]:
1. ให้ส่งลิงก์ https://m2holdhouse.vercel.app/ เพื่อให้ลูกค้าคลิกไปกดรับรหัส OTP ด้วยตนเองผ่านหน้าเว็บได้ทันที
2. แนะนำขั้นตอน: ให้ลูกค้าเปิดหน้าขอรหัสบนหน้าจอ แล้วเข้าเว็บ https://m2holdhouse.vercel.app/ เพื่อกดรับ OTP
3. หากลูกค้ายังทำไม่ได้หลายครั้ง หรือมิมิพิจารณาแล้วว่าติดปัญหาทางเทคนิคที่แก้เองไม่ได้ ให้แจ้งติดต่อพี่แอดมินร่างมนุษย์มารับช่วงต่อทันที`
      );
    }

    // 3. Problem Reporting Protocol (ห้ามขายของเด็ดขาด โฟกัสแก้ปัญหา)
    const isProblemReport =
      lower.includes("เข้าไม่ได้") ||
      lower.includes("จอเต็ม") ||
      lower.includes("เด้ง") ||
      lower.includes("จอชน") ||
      lower.includes("ติดรหัส") ||
      lower.includes("ดูไม่ได้") ||
      lower.includes("พัง") ||
      lower.includes("error") ||
      lower.includes("หมดอายุ") ||
      lower.includes("มีปัญหา") ||
      lower.includes("ช่วยด้วย") ||
      lower.includes("แก้ปัญหา");

    if (isProblemReport) {
      contextParts.push(
        `🚨 [กฎเหล็กขณะลูกค้าแจ้งปัญหาการใช้งาน - ห้ามขายของเด็ดขาด]:
1. ห้ามทำการโปรโมต หรือขายสินค้า/ป้ายยาแอปอื่นใดๆ ทั้งสิ้นในขณะที่ลูกค้ากำลังแจ้งปัญหา! ให้โฟกัสที่การช่วยแก้ปัญหาด้วยความเข้าใจและเห็นอกเห็นใจ 100%
2. วิเคราะห์ปัญหาของทุกแอป ทุก Platform (Netflix, Spotify, YouTube, Disney+, Viu, Canva ฯลฯ) ให้คำแนะนำและทดลองหลายๆ ทางเพื่อแก้ปัญหา
3. หากลูกค้าลองแล้วยังไม่ได้ หรือเป็นปัญหาที่ต้องเคลม ให้ส่งลิงก์แจ้งปัญหาบนเว็บ: https://storebymari.com/support/report หรือแจ้งสะกิดแอดมินร่างมนุษย์มาช่วยดูแล`
      );
    }

    // 4. Top Selling / Best-sellers (Only if NOT reporting problems)
    if (
      !isProblemReport &&
      (lower.includes("ขายดี") ||
        lower.includes("ฮิต") ||
        lower.includes("นิยม") ||
        lower.includes("แนะนำ") ||
        lower.includes("คนซื้อเยอะ"))
    ) {
      const topSellers = await getMimiTopSellingProducts(5);
      if (topSellers.length > 0) {
        const lines = topSellers.map(
          (p, i) => `${i + 1}. ${p.productName} (คนซื้อไปแล้วกว่า ${p.salesCount.toLocaleString()} ออเดอร์)`
        );
        contextParts.push(`🔥 สินค้าขายดี 5 อันดับแรกของร้าน (สถิติจริงจากระบบ):\n${lines.join("\n")}`);
      }
    }

    // 5. Categories
    if (
      lower.includes("หมวด") ||
      lower.includes("ประเภท") ||
      lower.includes("มีแอปอะไรบ้าง") ||
      lower.includes("แอปทั้งหมด")
    ) {
      const cats = await getMimiCategories();
      if (cats.length > 0) {
        const lines = cats.map((c) => `• ${c.name}${c.description ? ` (${c.description})` : ""}`);
        contextParts.push(`📁 หมวดหมู่สินค้าทั้งหมดในร้าน:\n${lines.join("\n")}`);
      }
    }

    // 6. Topup Bonus Promotions & Payment Methods (General inquiry)
    if (
      !isTopupIssue &&
      (lower.includes("เติมเงิน") ||
        lower.includes("โบนัส") ||
        lower.includes("โปรเติม") ||
        lower.includes("จ่ายเงิน") ||
        lower.includes("ชำระ") ||
        lower.includes("true money") ||
        lower.includes("พร้อมเพย์"))
    ) {
      const bonusRules = await getMimiTopupBonusRules();
      let bonusText = "ไม่มีโปรโมชั่นโบนัสในขณะนี้";
      if (bonusRules.length > 0) {
        bonusText = bonusRules
          .map((b) => `• เติมครบ ฿${b.triggerAmount.toLocaleString()} รับโบนัสฟรี +${b.bonusPoints} พอยต์`)
          .join("\n");
      }
      contextParts.push(
        `💳 ช่องทางการเติมเงิน & โปรโมชั่นโบนัสเติมเงินหน้าร้าน:\n- ช่องทาง: สแกน PromptPay QR Code ออโต้ 24 ชม. ฟรีค่าธรรมเนียม, หรือ TrueMoney\n- เรทโบนัสเติมเงินพิเศษ:\n${bonusText}`
      );
    }

    // 7. Gifts & Freebies (Only if NOT problem report)
    if (!isProblemReport && (lower.includes("ของแถม") || lower.includes("แถม") || lower.includes("วงล้อ") || lower.includes("กิจกรรม"))) {
      const gifts = await getMimiGiftOptions();
      if (gifts.length > 0) {
        const lines = gifts.map((g) => `• ซื้อ "${g.baseProductName}" รับฟรีทันที "${g.giftProductName}"`);
        contextParts.push(`🎁 โปรโมชั่นของแถมปัจจุบัน:\n${lines.join("\n")}`);
      }
    }

    // 8. User Points / Account Check (If customer gives email or username)
    if (userQuery && !isTopupIssue) {
      const u = await findMimiUser(userQuery);
      if (u) {
        contextParts.push(
          `👤 ข้อมูลบัญชีสมาชิกของลูกค้า (${u.email}):\n• ชื่อ: ${u.displayName || "สมาชิก"}\n• แต้มสะสมคงเหลือ: ฿${u.points.toFixed(2)}\n• ระดับสมาชิก: ${u.userTier.toUpperCase()}\n• ยอดเติมเงินสะสม: ฿${u.totalTopupAmount.toLocaleString()}`
        );
      } else {
        contextParts.push(`ℹ️ ระบบไม่พบข้อมูลบัญชีสมาชิกสำหรับ "${userQuery}" แนะนำให้ลูกค้าตรวจสอบชื่อบัญชีหรือสมัครสมาชิกบนเว็บได้ฟรี`);
      }
    }

    // 9. Support Case Status
    if (foundCaseCode) {
      const sc = await findMimiSupportCase(foundCaseCode);
      if (sc) {
        contextParts.push(
          `🎫 ข้อมูลเคสแจ้งปัญหา (${sc.caseCode}):\n• สินค้า: ${sc.productName || "ไม่ระบุ"}\n• สถานะ: ${sc.status === "resolved" ? "แก้ไขเรียบร้อยแล้ว ✅" : sc.status === "investigating" ? "กำลังตรวจสอบ 🔍" : "รอดำเนินการ ⏳"}\n• ข้อความจากแอดมิน: ${sc.adminResponse || "กำลังเร่งตรวจสอบให้อยู่นะคะ"}`
        );
      }
    }

    // 10. Customer Order Lookup (Safe: no cost, no profit)
    if (foundOrderId) {
      const ord = await findMimiOrder(foundOrderId, false);
      if (ord) {
        contextParts.push(
          `📦 ข้อมูลคำสั่งซื้อของลูกค้า (#${ord.id}):\n• สินค้า: ${ord.productName}\n• ราคา: ฿${ord.price}\n• วันที่สั่งซื้อ: ${ord.purchaseDate || "-"}\n• หมวดหมู่: ${ord.typeMenu || "-"}`
        );
      } else {
        contextParts.push(`⚠️ ไม่พบประวัติคำสั่งซื้อรหัส "${foundOrderId}" ในระบบ`);
      }
    }

    return contextParts.join("\n\n");
  }

  // B. Admin Group Flow ("Store By Mari หลังบ้าน")
  const tier = tierProfile?.tier || "B";
  const canDeepFinance = Boolean(tierProfile?.canAccessDeepFinance);

  // 1.1 Today's Order Breakdown (สินค้าที่ขายได้ในวันนี้ & จำนวนออเดอร์)
  const isAskingTodayOrders =
    lower.includes("กี่ออเดอร์") ||
    lower.includes("กี่ ออเดอร์") ||
    lower.includes("ขายอะไร") ||
    lower.includes("ขายไปได้กี่") ||
    lower.includes("อะไรบ้าง") ||
    lower.includes("ออเดอร์วันนี้") ||
    (lower.includes("วันนี้") && (lower.includes("ขาย") || lower.includes("ออเดอร์")));

  if (isAskingTodayOrders) {
    const todayBreakdown = await getMimiTodayOrdersBreakdown();
    if (todayBreakdown.products.length > 0) {
      const itemsList = todayBreakdown.products
        .map((p, idx) => `  ${idx + 1}. ${p.productName}: ${p.count} ออเดอร์`)
        .join("\n");

      contextParts.push(
        `📦 ข้อมูลคำสั่งซื้อวันนี้ (Today's Orders Breakdown):\n` +
        `• จำนวนคำสั่งซื้อวันนี้ทั้งหมด: ${todayBreakdown.totalOrders} ออเดอร์\n` +
        `• รายการสินค้าที่ขายได้ในวันนี้ (เรียงตามจำนวนออเดอร์มากไปน้อย):\n${itemsList}\n` +
        `🚨 กฎเหล็กการตอบคำถามข้อนี้: ผู้ถามถามว่า "ขายไปได้กี่ออเดอร์แล้ว อะไรบ้าง" ให้ตอบสรุป "จำนวนออเดอร์รวม" และ "แจกแจงรายชื่อสินค้าที่ขายได้พร้อมจำนวนออเดอร์" ตามรายการด้านบนเท่านั้น! ห้ามตอบเป็นตัวเลขยอดขายบาท หรือตัวเลขกำไรบาทโดยเด็ดขาด เพราะผู้ถามไม่ได้ถามหาตัวเลขเงิน!`
      );
    } else {
      contextParts.push(
        `📦 สรุปคำสั่งซื้อวันนี้: วันนี้ยังไม่มีคำสั่งซื้อเข้ามาในระบบค่ะ\n` +
        `🚨 ตอบเฉพาะจำนวนออเดอร์ ห้ามพูดตัวเลขเงินหรือกำไร`
      );
    }
  }

  // 1.2 Financial Overview (เฉพาะเมื่อถามเรื่อง ยอดเงิน / กำไร / รายได้ / ต้นทุน หรือถามภาพรวมร้านเท่านั้น)
  const isAskingFinancialOverview =
    lower.includes("ยอดขาย") ||
    lower.includes("รายได้") ||
    lower.includes("กำไร") ||
    lower.includes("ต้นทุน") ||
    lower.includes("การเงิน") ||
    lower.includes("overview") ||
    (lower.includes("สรุป") && (lower.includes("ยอด") || lower.includes("เงิน") || lower.includes("กำไร") || lower.includes("ร้าน")));

  if (isAskingFinancialOverview) {
    const overview = await getMimiShopOverview(tier);

    if (tier === "SSS") {
      // Full financial stats exclusively for Tier SSS (ปะป๊า)
      const lines = [
        `📊 [🔒 ข้อมูลเฉพาะปะป๊า Tier SSS] สรุปข้อมูลสถานะร้าน & การเงินหลังบ้าน:`,
        `• ยอดขายวันนี้: ฿${overview.revenueToday.toLocaleString()} (${overview.ordersToday} ออเดอร์)`,
        `• ยอดเติมเงินวันนี้: ฿${overview.topupAmountToday.toLocaleString()} (${overview.topupCountToday} รายการ)`,
        `• ผู้ใช้ทั้งหมด: ${overview.totalUsers.toLocaleString()} คน (สมัครใหม่วันนี้ ${overview.newUsersToday} คน)`,
        `• คำสั่งซื้อทั้งหมดในระบบ: ${overview.totalOrders.toLocaleString()} ออเดอร์`,
        `• ยอดขายสะสมรวมทั้งหมด: ฿${overview.totalRevenue.toLocaleString()}`,
        `• เคสแจ้งปัญหาที่ค้างอยู่: ${overview.pendingSupportCases} เคส`,
        `• สินค้าหมดสต็อก: ${overview.outOfStockProductsCount} รายการ`,
      ];

      if (canDeepFinance && overview.totalProfit !== undefined) {
        lines.push(`• [👑 กำไรสุทธิสะสมตลอดกาลของร้าน (ไม่ใช่ยอดวันนี้)]: ฿${overview.totalProfit.toLocaleString()}`);
        lines.push(`• [👑 ต้นทุนสะสมรวมตลอดกาล]: ฿${overview.totalCost?.toLocaleString() || 0}`);
      }
      lines.push(`🚨 คำสั่งกำกับ: ตอบตัวเลขการเงินได้เฉพาะเมื่อปะป๊า (Tier SSS) สั่งให้สรุปยอดเงิน/กำไรโดยตรงเท่านั้น! หากปะป๊าถามเรื่องอื่นห้ามเอาตัวเลขเงินมาตอบ!`);
      contextParts.push(lines.join("\n"));
    } else {
      // Non-SSS Tiers (Mami, Som, Por, Guest): Strictly ZERO financial numbers! Only operational counts.
      const lines = [
        `📊 สรุปภาพรวมการดำเนินงานร้าน (Operational Overview):`,
        `• ผู้ใช้ทั้งหมด: ${overview.totalUsers.toLocaleString()} คน (สมัครใหม่วันนี้ ${overview.newUsersToday} คน)`,
        `• คำสั่งซื้อทั้งหมด: ${overview.totalOrders.toLocaleString()} ออเดอร์ (วันนี้ ${overview.ordersToday} ออเดอร์)`,
        `• รายการเติมเงินวันนี้: ${overview.topupCountToday} รายการ`,
        `• เคสแจ้งปัญหาค้างอยู่: ${overview.pendingSupportCases} เคส`,
        `• สินค้าหมดสต็อก: ${overview.outOfStockProductsCount} รายการ`,
        `🚨 กฎเหล็กการเงิน: ผู้ส่งคนนี้ไม่ใช่ Tier SSS! ห้ามพิมพ์ตัวเลขการเงิน (บาท, ยอดขาย, กำไร, ต้นทุน, ยอดเติมเงิน) ออกมาในกลุ่มเด็ดขาด หากถาม ให้ปฏิเสธอย่างน่ารักว่าเรื่องตัวเลขเงินหลังบ้านต้องได้รับอนุญาตจากปะป๊า (Tier SSS) ก่อนน้าา`,
      ];
      contextParts.push(lines.join("\n"));
    }
  }

  // 2. User Lookup in Admin Group
  if (foundEmail || lower.includes("เช็ก user") || lower.includes("ดู user") || lower.includes("หา user")) {
    const queryTerm = foundEmail || text.replace(/.*(?:เช็ก|ดู|หา)\s*user\s*/i, "").trim().split(" ")[0];
    if (queryTerm && queryTerm.length > 2) {
      const u = await findMimiUser(queryTerm);
      if (u) {
        contextParts.push(
          `👤 ข้อมูล User ในระบบ (${u.email}):\n• ID: ${u.id}\n• ชื่อ: ${u.displayName || "-"}\n• แต้มคงเหลือ: ฿${u.points.toFixed(2)}\n• ระดับ: ${u.userTier.toUpperCase()}\n• ยอดเติมเงินรวม: ฿${u.totalTopupAmount.toLocaleString()} (${u.topupCount} ครั้ง)\n• สถานะบัญชี: ${u.isBanned ? "ถูกระงับ (Banned) 🔴" : "ปกติ 🟢"}\n• วันที่สมัคร: ${u.createdAt}`
        );
      } else {
        contextParts.push(`⚠️ ค้นหา User "${queryTerm}" ไม่พบในฐานข้อมูล`);
      }
    }
  }

  // 3. Order Lookup in Admin Group
  if (foundOrderId || lower.includes("เช็กออเดอร์") || lower.includes("ดูออเดอร์")) {
    const q = foundOrderId || text.replace(/.*(?:เช็ก|ดู)\s*ออเดอร์\s*/i, "").trim().split(" ")[0];
    if (q && q.length > 4) {
      const ord = await findMimiOrder(q, canDeepFinance);
      if (ord) {
        const lines = [
          `📦 ข้อมูลออเดอร์ (#${ord.id}):`,
          `• สินค้า: ${ord.productName}`,
          `• ราคาขาย: ฿${ord.price}`,
          `• ผู้ซื้อ: ${ord.buyerDisplayName || ord.buyerEmail || "ไม่ระบุ"} (${ord.buyerEmail || "-"})`,
          `• วันที่ซื้อ: ${ord.purchaseDate || "-"}`,
          `• Case Order ID: ${ord.caseOrderId || "-"}`,
        ];
        if (canDeepFinance && ord.profit !== undefined) {
          lines.push(`• [👑 สิทธิ์ปะป๊า] ต้นทุน: ฿${ord.costPrice} | กำไร: ฿${ord.profit}`);
        }
        contextParts.push(lines.join("\n"));
      } else {
        contextParts.push(`⚠️ ค้นหาคำสั่งซื้อ "${q}" ไม่พบในฐานข้อมูล`);
      }
    }
  }

  // 4. Support Case Lookup in Admin Group
  if (foundCaseCode || lower.includes("เคส") || lower.includes("ปัญหาลูกค้า")) {
    if (foundCaseCode) {
      const sc = await findMimiSupportCase(foundCaseCode);
      if (sc) {
        contextParts.push(
          `🎫 ข้อมูลเคส (${sc.caseCode}):\n• สินค้า: ${sc.productName}\n• ประเภท: ${sc.caseType}\n• รายละเอียด: ${sc.problemDescription}\n• สถานะ: ${sc.status}\n• ตอบกลับล่าสุด: ${sc.adminResponse || "ยังไม่ได้ตอบ"}\n• สร้างเมื่อ: ${sc.createdAt}`
        );
      }
    } else {
      const [pendingRows] = await pool.execute(
        "SELECT case_code, product_name, problem_description, created_at FROM support_cases WHERE status = 'pending' ORDER BY created_at DESC LIMIT 3"
      );
      const pendings = pendingRows as any[];
      if (pendings.length > 0) {
        const lines = pendings.map((p) => `• [${p.case_code}] ${p.product_name}: "${(p.problem_description || "").slice(0, 50)}..."`);
        contextParts.push(`⚠️ เคสปัญหาที่รอดำเนินการล่าสุด (${pendings.length} รายการ):\n${lines.join("\n")}`);
      }
    }
  }

  // 5. Topup Recent Summary in Admin Group
  if (lower.includes("เติมเงิน") || lower.includes("สลิป")) {
    const topups = await getMimiRecentTopups(3);
    if (topups.length > 0) {
      const lines = topups.map(
        (t) => `• ฿${t.amount} [${t.status}] (${t.userEmail || "ไม่ระบุ"})${t.failureReason ? ` - สาเหตุ: ${t.failureReason}` : ""}`
      );
      contextParts.push(`💳 รายการเติมเงินล่าสุดในระบบ:\n${lines.join("\n")}`);
    }
  }

  // 6. Top Selling in Admin Group
  if (lower.includes("ขายดี") || lower.includes("อันดับ")) {
    const topSellers = await getMimiTopSellingProducts(5);
    if (topSellers.length > 0) {
      const lines = topSellers.map(
        (p, i) => `${i + 1}. ${p.productName} (${p.salesCount.toLocaleString()} ออเดอร์ | ยอดขาย ฿${p.totalRevenue.toLocaleString()})`
      );
      contextParts.push(`🔥 5 อันดับสินค้าขายดีที่สุดในร้าน:\n${lines.join("\n")}`);
    }
  }

  // 7. Categories in Admin Group
  if (lower.includes("หมวดหมู่") || lower.includes("category")) {
    const cats = await getMimiCategories();
    if (cats.length > 0) {
      const lines = cats.map((c) => `• ${c.name}${c.description ? ` (${c.description})` : ""}`);
      contextParts.push(`📂 หมวดหมู่สินค้าในร้าน (${cats.length} หมวดหมู่):\n${lines.join("\n")}`);
    }
  }

  // 8. Topup Bonus Rules in Admin Group
  if (lower.includes("โบนัสเติมเงิน") || lower.includes("โปรเติมเงิน") || lower.includes("เรทโบนัส")) {
    const bonusRules = await getMimiTopupBonusRules();
    if (bonusRules.length > 0) {
      const lines = bonusRules.map((b) => `• เติมครบ ฿${b.triggerAmount.toLocaleString()} รับฟรี +${b.bonusPoints} แต้ม`);
      contextParts.push(`✨ กฎโบนัสการเติมเงิน:\n${lines.join("\n")}`);
    }
  }

  // 9. Gifts in Admin Group
  if (lower.includes("ของแถม") || lower.includes("แถม")) {
    const gifts = await getMimiGiftOptions();
    if (gifts.length > 0) {
      const lines = gifts.map((g) => `• ซื้อ "${g.baseProductName}" แถมฟรี "${g.giftProductName}"`);
      contextParts.push(`🎁 รายการของแถมที่เปิดใช้งาน:\n${lines.join("\n")}`);
    }
  }

  return contextParts.join("\n\n");
}
