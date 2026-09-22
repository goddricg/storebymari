import pool from "@/lib/mysql";
import type { RowDataPacket } from "mysql2/promise";
import { and, count, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db, supportCases } from "@/lib/db/drizzle";
import { getSiteId } from "@/lib/site";
import { dispatchSupportCaseNotificationToAdmins } from "@/lib/push/dispatch";
import type {
  SupportCase,
  SupportCaseAttachment,
  CreateSupportCaseInput,
  UpdateSupportCaseInput,
} from "./types";
import { randomUUID } from "crypto";
import { extractProductDetails } from "./date-parser";
import { ensureSupportCenterSchema } from "./center-schema";

function toSupportCaseAttachment(row: any): SupportCaseAttachment {
  return {
    id: row.id,
    caseId: row.case_id,
    fileUrl: row.file_url,
    fileName: row.file_name ?? null,
    fileSize: row.file_size ? Number(row.file_size) : null,
    mimeType: row.mime_type ?? null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  };
}

function toSupportCase(row: any, attachments?: SupportCaseAttachment[]): SupportCase {
  const hasUserInfo = Boolean(row.user_email || row.user_name || row.user_display_name || row.user_actual_id);
  const user = hasUserInfo ? {
    id: row.user_actual_id || row.user_id,
    email: row.user_email || "",
    displayName: row.user_name || row.user_display_name || null,
    role: row.user_role || null,
    userTier: row.user_tier || null,
    points: row.user_points !== undefined && row.user_points !== null ? Number(row.user_points) : null,
  } : null;

  const userName = user?.displayName || user?.email || (row.user_id ? `ผู้ใช้ (ID: ${row.user_id.slice(0, 8)})` : "ผู้ใช้ทั่วไป / ไม่ระบุ");
  const userEmail = user?.email || null;
  const centerCaseId = row.center_case_id ?? null;
  const centerCaseCode = row.center_case_code ?? null;
  const centerSyncError = row.center_sync_error ?? null;

  return {
    id: row.id,
    caseCode: row.case_code,
    userId: row.user_id ?? null,
    orderId: row.order_id ?? null,
    productTypeId: row.product_type_id ?? null,
    productName: row.product_name ?? null,
    accountEmail: row.account_email ?? null,
    accountPassword: row.account_password ?? null,
    expirationDate: row.expiration_date ?? null,
    caseType: row.case_type,
    screenNumber: row.screen_number ?? null,
    problemDescription: row.problem_description,
    status: row.status,
    adminNote: row.admin_note ?? null,
    adminResponse: row.admin_response ?? null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
    attachments: attachments || [],
    siteId: row.site_id ?? null,
    shopName: row.shop_name ?? null,
    centerCaseId,
    centerCaseCode,
    centerSyncedAt: row.center_synced_at ? new Date(row.center_synced_at).toISOString() : null,
    centerSyncError,
    centerSyncStatus: centerCaseId || centerCaseCode
      ? "sent"
      : centerSyncError
        ? "failed"
        : "pending",
    handledById: row.handled_by_id ?? null,
    handledByName: row.handled_by_name ?? null,
    handledAt: row.handled_at ? new Date(row.handled_at).toISOString() : null,
    user,
    userName,
    userEmail,
    claimIteration: row.claim_iteration ? Number(row.claim_iteration) : 1,
    previousCaseId: row.previous_case_id ?? null,
    previousCaseCode: row.previous_case_code ?? null,
    previousAdminResponse: row.previous_admin_response ?? null,
    previousAdminNote: row.previous_admin_note ?? null,
    isDisputed: Boolean(row.is_disputed),
    disputeReason: row.dispute_reason ?? null,
    verifiedWarrantyStatus: row.verified_warranty_status ?? null,
    verifiedRemainingDays: row.verified_remaining_days !== undefined && row.verified_remaining_days !== null ? Number(row.verified_remaining_days) : null,
  };
}

async function fetchAttachmentsByCaseIds(
  caseIds: string[]
): Promise<Map<string, SupportCaseAttachment[]>> {
  const attachmentsMap = new Map<string, SupportCaseAttachment[]>();
  if (caseIds.length === 0) return attachmentsMap;

  const placeholders = caseIds.map(() => "?").join(",");
  const [rows] = await pool.execute(
    `SELECT * FROM support_case_attachments WHERE case_id IN (${placeholders})`,
    caseIds
  );

  for (const row of rows as any[]) {
    const att = toSupportCaseAttachment(row);
    const caseId = att.caseId;
    const existing = attachmentsMap.get(caseId) || [];
    attachmentsMap.set(caseId, [...existing, att]);
  }

  return attachmentsMap;
}

export async function createSupportCase(
  input: CreateSupportCaseInput,
  userId: string
): Promise<SupportCase> {
  try {
    await ensureSupportCenterSchema();
    const year = new Date().getFullYear();
    
    // Find last case code for current year to determine sequence
    const [existingRows] = await pool.execute(
      "SELECT case_code FROM support_cases WHERE case_code LIKE ? ORDER BY case_code DESC LIMIT 1",
      [`CASE-${year}-%`]
    );
    const existingList = existingRows as any[];

    let sequenceNum = 1;
    if (existingList.length > 0) {
      const lastCode = existingList[0].case_code;
      const match = lastCode.match(/CASE-\d+-(\d+)/);
      if (match) {
        sequenceNum = parseInt(match[1], 10) + 1;
      }
    }

    const caseCode = `CASE-${year}-${String(sequenceNum).padStart(5, "0")}`;

    let orderData = null;
    let productData = null;

    if (input.orderId) {
      const [orderRows] = await pool.execute(
        "SELECT product_name, product_type_id, product_details FROM orders WHERE id = ? LIMIT 1",
        [input.orderId]
      );
      const orderList = orderRows as any[];
      if (orderList.length > 0) {
        orderData = {
          product_name: orderList[0].product_name ?? null,
          product_type_id: orderList[0].product_type_id ?? null,
          product_details: orderList[0].product_details ?? null,
        };
      }
    }

    if (input.productTypeId) {
      const [productRows] = await pool.execute(
        "SELECT name, type_id FROM products WHERE type_id = ? LIMIT 1",
        [input.productTypeId]
      );
      const productList = productRows as any[];
      if (productList.length > 0) {
        productData = {
          name: productList[0].name ?? null,
          type_id: productList[0].type_id ?? null
        };
      }
    }

    const productName = input.productName || productData?.name || orderData?.product_name || null;

    let expirationDate = input.expirationDate || null;
    let verifiedWarrantyStatus = input.verifiedWarrantyStatus || null;
    let verifiedRemainingDays = input.verifiedRemainingDays ?? null;

    if ((!expirationDate || !verifiedWarrantyStatus || verifiedRemainingDays === null) && orderData?.product_details) {
      const extracted = extractProductDetails(orderData.product_details);
      if (!expirationDate && (extracted.warranty.isoDate || extracted.warranty.formattedDate)) {
        expirationDate = extracted.warranty.isoDate || extracted.warranty.formattedDate;
      }
      if (!verifiedWarrantyStatus && extracted.warranty.status !== "unknown") {
        verifiedWarrantyStatus = extracted.warranty.status;
      }
      if (verifiedRemainingDays === null && extracted.warranty.remainingDays !== null) {
        verifiedRemainingDays = extracted.warranty.remainingDays;
      }
    }

    const id = randomUUID();
    const now = new Date();

    const insertParams = [
      id,
      caseCode,
      userId,
      input.orderId || null,
      input.productTypeId || null,
      productName,
      input.accountEmail || null,
      input.accountPassword || null,
      expirationDate,
      input.caseType,
      input.screenNumber || null,
      input.problemDescription,
      "pending",
      null,
      null,
      now,
      now,
      getSiteId(),
      input.shopName ?? null,
      input.claimIteration || 1,
      input.previousCaseId || null,
      input.isDisputed ? 1 : 0,
      input.disputeReason || null,
      verifiedWarrantyStatus,
      verifiedRemainingDays,
    ];

    await pool.execute(
      `INSERT INTO support_cases (
        id, case_code, user_id, order_id, product_type_id, product_name, account_email, account_password, expiration_date, case_type, screen_number, problem_description, status, admin_note, admin_response, created_at, updated_at, site_id, shop_name, claim_iteration, previous_case_id, is_disputed, dispute_reason, verified_warranty_status, verified_remaining_days
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      insertParams
    );

    // Insert attachments if provided
    const attachments: SupportCaseAttachment[] = [];
    if (input.attachmentUrls && input.attachmentUrls.length > 0) {
      for (const url of input.attachmentUrls) {
        if (!url || typeof url !== 'string') continue;
        const attId = randomUUID();
        const fileName = url.split('/').pop() || 'attachment';
        await pool.execute(
          `INSERT INTO support_case_attachments (id, case_id, file_url, file_name, file_size, mime_type, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [attId, id, url, fileName, 0, 'image/png', now]
        );
        attachments.push({
          id: attId,
          caseId: id,
          fileUrl: url,
          fileName,
          fileSize: 0,
          mimeType: 'image/png',
          createdAt: now.toISOString(),
        });
      }
    }

    const createdCase = toSupportCase({
      id,
      case_code: caseCode,
      user_id: userId,
      order_id: input.orderId,
      product_type_id: input.productTypeId,
      product_name: productName,
      account_email: input.accountEmail,
      accountPassword: input.accountPassword,
      expiration_date: input.expirationDate,
      case_type: input.caseType,
      screen_number: input.screenNumber,
      problem_description: input.problemDescription,
      status: "pending",
      admin_note: null,
      admin_response: null,
      created_at: now,
      updated_at: now,
      shop_name: input.shopName ?? null,
      claim_iteration: input.claimIteration || 1,
      previous_case_id: input.previousCaseId || null,
      is_disputed: input.isDisputed ? 1 : 0,
      dispute_reason: input.disputeReason || null,
      verified_warranty_status: input.verifiedWarrantyStatus || null,
      verified_remaining_days: input.verifiedRemainingDays ?? null,
    }, attachments);

    // Trigger background Web Push notification to all active admins
    (async () => {
      try {
        let reporterName: string | null = null;
        let reporterEmail: string | null = null;
        if (userId) {
          const [userRows] = await pool.execute<RowDataPacket[]>(
            "SELECT display_name, email FROM users WHERE id = ? LIMIT 1",
            [userId]
          );
          if (userRows.length > 0) {
            reporterName = userRows[0].display_name ?? null;
            reporterEmail = userRows[0].email ?? null;
          }
        }
        await dispatchSupportCaseNotificationToAdmins({
          id,
          caseCode,
          productName,
          problemDescription: input.problemDescription,
          reporterName: reporterName || input.shopName || null,
          reporterEmail,
          siteId: getSiteId(),
        });
      } catch (pushErr) {
        console.error("[Push Notification Error]", pushErr);
      }
    })().catch((err) => console.error("[Push Dispatch Async Error]", err));

    return createdCase;
  } catch (error: any) {
    throw new Error(`ไม่สามารถสร้างเคสได้: ${error.message}`);
  }
}

export async function findSupportCaseByCode(caseCode: string): Promise<SupportCase | null> {
  try {
    const [caseRows] = await pool.execute(
      "SELECT * FROM support_cases WHERE case_code = ? LIMIT 1",
      [caseCode]
    );
    const caseList = caseRows as any[];
    if (caseList.length === 0) return null;
    const caseData = caseList[0];

    const [attachmentsRows] = await pool.execute(
      "SELECT * FROM support_case_attachments WHERE case_id = ?",
      [caseData.id]
    );
    const attachmentsData = (attachmentsRows as any[]).map(toSupportCaseAttachment);

    return toSupportCase(caseData, attachmentsData);
  } catch (error) {
    console.error("Error in findSupportCaseByCode:", error);
    return null;
  }
}

export async function findSupportCaseByCodeAndUser(
  caseCode: string,
  userId: string,
): Promise<SupportCase | null> {
  try {
    const [caseRows] = await pool.execute(
      "SELECT * FROM support_cases WHERE case_code = ? AND user_id = ? LIMIT 1",
      [caseCode, userId],
    );
    const caseList = caseRows as any[];
    if (caseList.length === 0) return null;

    const caseData = caseList[0];
    const [attachmentsRows] = await pool.execute(
      "SELECT * FROM support_case_attachments WHERE case_id = ?",
      [caseData.id],
    );
    const attachmentsData = (attachmentsRows as any[]).map(toSupportCaseAttachment);
    return toSupportCase(caseData, attachmentsData);
  } catch (error) {
    console.error("Error in findSupportCaseByCodeAndUser:", error);
    return null;
  }
}

export async function findSupportCaseById(id: string, siteId?: string): Promise<SupportCase | null> {
  try {
    const whereClause = siteId ? "sc.id = ? AND sc.site_id = ?" : "sc.id = ?";
    const params = siteId ? [id, siteId] : [id];
    const [rows] = await pool.execute(
      `SELECT sc.*, u.id AS user_actual_id, u.email AS user_email, u.display_name AS user_name, u.role AS user_role, u.user_tier AS user_tier, u.points AS user_points,
              prev_sc.case_code AS previous_case_code, prev_sc.admin_response AS previous_admin_response, prev_sc.admin_note AS previous_admin_note
       FROM support_cases sc
       LEFT JOIN users u ON sc.user_id = u.id
       LEFT JOIN support_cases prev_sc ON sc.previous_case_id = prev_sc.id
       WHERE ${whereClause}`,
      params,
    );
    const list = rows as any[];
    if (list.length === 0) return null;

    const [attachmentsRows] = await pool.execute(
      "SELECT * FROM support_case_attachments WHERE case_id = ?",
      [id]
    );
    const attachments = (attachmentsRows as any[]).map(toSupportCaseAttachment);

    return toSupportCase(list[0], attachments);
  } catch (error: any) {
    throw new Error(`ไม่สามารถดึงข้อมูลเคสได้: ${error.message}`);
  }
}

export async function findSupportCasesByCodesAndUser(caseCodes: string[], userId: string): Promise<SupportCase[]> {
  if (caseCodes.length === 0) return [];
  
  try {
    const placeholders = caseCodes.map(() => '?').join(',');
    const query = `SELECT * FROM support_cases WHERE case_code IN (${placeholders}) AND user_id = ?`;
    const params = [...caseCodes, userId];
    
    const [rows] = await pool.execute(query, params);
    const list = rows as any[];
    
    if (list.length === 0) return [];

    return list.map(row => toSupportCase(row));
  } catch (error: any) {
    throw new Error(`ไม่สามารถดึงข้อมูลสถานะเคสได้: ${error.message}`);
  }
}

export async function getUserSupportCases(userId: string): Promise<SupportCase[]> {
  try {
    const [caseRows] = await pool.execute(
      "SELECT * FROM support_cases WHERE user_id = ? ORDER BY created_at DESC",
      [userId]
    );
    const casesData = caseRows as any[];
    if (casesData.length === 0) return [];

    const caseIds = casesData.map(c => c.id);
    const attachmentsMap = await fetchAttachmentsByCaseIds(caseIds);

    return casesData.map((caseData) =>
      toSupportCase(caseData, attachmentsMap.get(caseData.id) || [])
    );
  } catch (error: any) {
    throw new Error(`ไม่สามารถดึงข้อมูลเคสได้: ${error.message}`);
  }
}

export async function getAllSupportCases(filters?: {
  status?: string;
  productTypeId?: string;
  caseType?: string;
  searchEmail?: string;
  searchCaseCode?: string;
  siteId?: string;
}): Promise<SupportCase[]> {
  try {
    let whereClause = "1=1";
    const params: any[] = [];

    if (filters?.status) {
      whereClause += " AND sc.status = ?";
      params.push(filters.status);
    }
    if (filters?.caseType) {
      whereClause += " AND sc.case_type = ?";
      params.push(filters.caseType);
    }
    if (filters?.productTypeId) {
      whereClause += " AND sc.product_type_id = ?";
      params.push(filters.productTypeId);
    }
    if (filters?.searchEmail) {
      whereClause += " AND (sc.account_email LIKE ? OR u.email LIKE ?)";
      params.push(`%${filters.searchEmail.trim()}%`, `%${filters.searchEmail.trim()}%`);
    }
    if (filters?.searchCaseCode) {
      whereClause += " AND sc.case_code LIKE ?";
      params.push(`%${filters.searchCaseCode.trim()}%`);
    }
    if (filters?.siteId) {
      whereClause += " AND sc.site_id = ?";
      params.push(filters.siteId);
    }

    const [caseRows] = await pool.execute(
      `SELECT sc.*, u.id AS user_actual_id, u.email AS user_email, u.display_name AS user_name, u.role AS user_role, u.user_tier AS user_tier, u.points AS user_points
       FROM support_cases sc
       LEFT JOIN users u ON sc.user_id = u.id
       WHERE ${whereClause} 
       ORDER BY sc.created_at DESC`,
      params
    );
    const cases = caseRows as any[];
    if (cases.length === 0) return [];

    const caseIds = cases.map(c => c.id);
    const attachmentsMap = await fetchAttachmentsByCaseIds(caseIds);

    return cases.map((caseData) =>
      toSupportCase(caseData, attachmentsMap.get(caseData.id) || [])
    );
  } catch (error: any) {
    throw new Error(`ไม่สามารถดึงข้อมูลเคสได้: ${error.message}`);
  }
}

const countResolvedSupportCasesCached = unstable_cache(
  async (siteId: string): Promise<number> => {
    const where = siteId === "main"
      ? eq(supportCases.status, "resolved")
      : and(
          eq(supportCases.status, "resolved"),
          eq(supportCases.siteId, siteId),
        );
    const [row] = await db
      .select({ count: count() })
      .from(supportCases)
      .where(where);

    return Number(row?.count ?? 0);
  },
  ["resolved-support-cases-count"],
  { revalidate: 60 },
);

export async function countResolvedSupportCases(): Promise<number> {
  try {
    return await countResolvedSupportCasesCached(getSiteId());
  } catch (error) {
    console.error("Error in countResolvedSupportCases:", error);
    return 0;
  }
}

export async function getAllSupportCasesPaginated(
  filters?: {
    status?: string;
    productTypeId?: string;
    caseType?: string;
    searchEmail?: string;
    searchCaseCode?: string;
    siteId?: string;
    userId?: string;
  },
  options?: {
    page?: number;
    limit?: number;
    includeAttachments?: boolean;
  }
): Promise<{
  cases: SupportCase[];
  total: number;
  page: number;
  totalPages: number;
}> {
  try {
    const page = options?.page || 1;
    const limit = options?.limit || 50;
    const offset = (page - 1) * limit;
    const includeAttachments = options?.includeAttachments ?? false;

    let whereClause = "1=1";
    const params: any[] = [];

    if (filters?.status) {
      whereClause += " AND sc.status = ?";
      params.push(filters.status);
    }
    if (filters?.caseType) {
      whereClause += " AND sc.case_type = ?";
      params.push(filters.caseType);
    }
    if (filters?.productTypeId) {
      whereClause += " AND sc.product_type_id = ?";
      params.push(filters.productTypeId);
    }
    if (filters?.searchEmail) {
      whereClause += " AND (sc.account_email LIKE ? OR u.email LIKE ?)";
      params.push(`%${filters.searchEmail.trim()}%`, `%${filters.searchEmail.trim()}%`);
    }
    if (filters?.searchCaseCode) {
      whereClause += " AND sc.case_code LIKE ?";
      params.push(`%${filters.searchCaseCode.trim()}%`);
    }
    if (filters?.siteId) {
      whereClause += " AND sc.site_id = ?";
      params.push(filters.siteId);
    }
    if (filters?.userId) {
      whereClause += " AND sc.user_id = ?";
      params.push(filters.userId);
    }

    // Get total
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as count 
       FROM support_cases sc
       LEFT JOIN users u ON sc.user_id = u.id
       WHERE ${whereClause}`,
      params
    );
    const total = (countRows as any[])[0].count;
    const totalPages = Math.ceil(total / limit);

    // Get paginated
    const selectParams = [...params, String(limit), String(offset)];
    const [caseRows] = await pool.execute(
      `SELECT sc.*, u.id AS user_actual_id, u.email AS user_email, u.display_name AS user_name, u.role AS user_role, u.user_tier AS user_tier, u.points AS user_points,
              prev_sc.case_code AS previous_case_code, prev_sc.admin_response AS previous_admin_response, prev_sc.admin_note AS previous_admin_note
       FROM support_cases sc 
       LEFT JOIN users u ON sc.user_id = u.id
       LEFT JOIN support_cases prev_sc ON sc.previous_case_id = prev_sc.id
       WHERE ${whereClause} 
       ORDER BY sc.created_at DESC 
       LIMIT ? OFFSET ?`,
      selectParams
    );
    const paginatedCases = caseRows as any[];

    let attachmentsMap = new Map<string, SupportCaseAttachment[]>();
    if (includeAttachments && paginatedCases.length > 0) {
      const caseIds = paginatedCases.map(c => c.id);
      attachmentsMap = await fetchAttachmentsByCaseIds(caseIds);
    }

    const cases = paginatedCases.map((caseData) =>
      toSupportCase(caseData, attachmentsMap.get(caseData.id) || [])
    );

    return {
      cases,
      total,
      page,
      totalPages,
    };
  } catch (error: any) {
    throw new Error(`ไม่สามารถดึงข้อมูลเคสได้: ${error.message}`);
  }
}

export async function claimSupportCase(
  id: string,
  admin: { id: string; name: string },
  siteId?: string,
): Promise<{
  success: boolean;
  claimedByMe: boolean;
  case: SupportCase;
  message?: string;
}> {
  try {
    const whereClause = siteId ? "id = ? AND site_id = ?" : "id = ?";
    const whereParams = siteId ? [id, siteId] : [id];

    const [existingRows] = await pool.execute(
      `SELECT * FROM support_cases WHERE ${whereClause} LIMIT 1`,
      whereParams,
    );
    const list = existingRows as any[];
    if (list.length === 0) {
      throw new Error("ไม่พบเคสที่ต้องการรับผิดชอบ");
    }

    const current = list[0];
    const [attachmentsRows] = await pool.execute(
      "SELECT * FROM support_case_attachments WHERE case_id = ?",
      [id]
    );
    const attachmentsData = (attachmentsRows as any[]).map(toSupportCaseAttachment);

    // If another admin is actively working on it (status is in_progress and handled_by_id != current admin)
    if (
      current.status === "in_progress" &&
      current.handled_by_id &&
      current.handled_by_id !== admin.id
    ) {
      return {
        success: false,
        claimedByMe: false,
        case: toSupportCase(current, attachmentsData),
        message: `เคสนี้กำลังดำเนินการโดย ${current.handled_by_name || "แอดมินท่านอื่น"}`,
      };
    }

    // If already claimed by current admin, return current state
    if (current.status === "in_progress" && current.handled_by_id === admin.id) {
      return {
        success: true,
        claimedByMe: true,
        case: toSupportCase(current, attachmentsData),
      };
    }

    // Claim the case
    const now = new Date();
    await pool.execute(
      `UPDATE support_cases 
       SET status = 'in_progress', 
           handled_by_id = ?, 
           handled_by_name = ?, 
           handled_at = COALESCE(handled_at, ?), 
           updated_at = ? 
       WHERE ${whereClause}`,
      [admin.id, admin.name, now, now, ...whereParams]
    );

    return {
      success: true,
      claimedByMe: true,
      case: toSupportCase({
        ...current,
        status: "in_progress",
        handled_by_id: admin.id,
        handled_by_name: admin.name,
        handled_at: current.handled_at || now,
        updated_at: now,
      }, attachmentsData),
    };
  } catch (error: any) {
    throw new Error(`ไม่สามารถรับผิดชอบเคสได้: ${error.message}`);
  }
}

export async function updateSupportCase(
  id: string,
  updates: UpdateSupportCaseInput,
  siteId?: string,
): Promise<SupportCase> {
  try {
    const whereClause = siteId ? "id = ? AND site_id = ?" : "id = ?";
    const whereParams = siteId ? [id, siteId] : [id];
    const [existingRows] = await pool.execute(
      `SELECT * FROM support_cases WHERE ${whereClause} LIMIT 1`,
      whereParams,
    );
    const list = existingRows as any[];
    if (list.length === 0) {
      throw new Error("ไม่พบเคสที่ต้องการอัปเดต");
    }

    const current = list[0];
    const status = updates.status !== undefined ? updates.status : current.status;
    const adminNote = updates.adminNote !== undefined ? updates.adminNote : current.admin_note;
    const adminResponse = updates.adminResponse !== undefined ? updates.adminResponse : current.admin_response;
    const handledById = updates.handledById !== undefined ? updates.handledById : current.handled_by_id;
    const handledByName = updates.handledByName !== undefined ? updates.handledByName : current.handled_by_name;
    const handledAt = updates.handledAt !== undefined ? updates.handledAt : current.handled_at;
    const now = new Date();

    await pool.execute(
      `UPDATE support_cases 
       SET status = ?, admin_note = ?, admin_response = ?, handled_by_id = ?, handled_by_name = ?, handled_at = ?, updated_at = ? 
       WHERE ${whereClause}`,
      [status, adminNote, adminResponse, handledById, handledByName, handledAt, now, ...whereParams]
    );

    const [attachmentsRows] = await pool.execute(
      "SELECT * FROM support_case_attachments WHERE case_id = ?",
      [id]
    );
    const attachmentsData = (attachmentsRows as any[]).map(toSupportCaseAttachment);

    return toSupportCase({
      ...current,
      status,
      admin_note: adminNote,
      admin_response: adminResponse,
      handled_by_id: handledById,
      handled_by_name: handledByName,
      handled_at: handledAt,
      updated_at: now
    }, attachmentsData);
  } catch (error: any) {
    throw new Error(`ไม่สามารถอัปเดตเคสได้: ${error.message}`);
  }
}

