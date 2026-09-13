import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { validateApiKey } from "@/lib/auth/api-key";
import pool from "@/lib/mysql";
import { getEffectiveStockFromRecord } from "@/lib/products/stock-utils";
import { getSiteId } from "@/lib/site";
import { getEffectiveUserTier } from "@/lib/auth/tier";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type UserPriceRow = RowDataPacket & {
  role: string | null;
  is_admin: number | boolean;
  user_tier: string | null;
  tier_expires_at: Date | string | null;
};

type ProductApiRow = RowDataPacket & {
  [key: string]: unknown;
  id: string;
  price: number | string | null;
  price_vip: number | string | null;
  price_walkin: number | string | null;
  main_price?: number | string | null;
  stock: number | string | null;
  account_data: unknown;
  account_email: string | null;
  account_password: string | null;
  api_provider_id: string | null;
  image_url: string | null;
};

type CountRow = RowDataPacket & {
  total: number | string;
};

function corsHeaders(): Headers {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, x-api-key, Authorization, Idempotency-Key"
  );
  headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  return headers;
}

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: corsHeaders(),
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

export async function GET(request: Request) {
  const tenant = await validateApiKey(request.headers);
  if (!tenant) {
    return response(
      { success: false, message: "Invalid or disabled API Key" },
      401
    );
  }
  if (tenant.is_site_suspended) {
    return response(
      { success: false, message: "This tenant is suspended." },
      403
    );
  }

  const { searchParams } = new URL(request.url);
  const parsedLimit = Number.parseInt(searchParams.get("limit") || "50", 10);
  const parsedOffset = Number.parseInt(searchParams.get("offset") || "0", 10);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(100, Math.max(1, parsedLimit))
    : 50;
  const offset = Number.isFinite(parsedOffset)
    ? Math.max(0, parsedOffset)
    : 0;
  const category = searchParams.get("category");
  const search = searchParams.get("search");

  try {
    const [userRows] = await pool.execute<UserPriceRow[]>(
      `SELECT role, is_admin, user_tier, tier_expires_at
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [tenant.user_id]
    );
    const user = userRows[0];
    const isAdmin = Boolean(
      user &&
        (user.role === "admin" ||
          user.role === "superadmin" ||
          user.is_admin === 1 ||
          user.is_admin === true)
    );
    const userTier = getEffectiveUserTier(user?.user_tier || "normal", user?.tier_expires_at);

    const siteId = getSiteId();
    let query =
      "SELECT id, type_id, name, image_url, details, price, price_vip, cost_price, price_walkin, stock, type_menu, category_id, is_published, badge, created_at, updated_at, site_id, is_local, api_provider_id, COALESCE(JSON_LENGTH(account_data), stock, 0) as effective_stock_val FROM products WHERE is_published = 1 AND (is_local = 0 OR (is_local = 1 AND site_id = ?))";
    const params: Array<string | number> = [siteId];

    if (category) {
      query += " AND (category_id = ? OR type_menu = ?)";
      params.push(category, category);
    }
    if (search) {
      query += " AND (name LIKE ? OR details LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    const [rows] = await pool.execute<ProductApiRow[]>(query, params);

    let countQuery =
      "SELECT COUNT(*) AS total FROM products WHERE is_published = 1 AND (is_local = 0 OR (is_local = 1 AND site_id = ?))";
    const countParams: string[] = [siteId];
    if (category) {
      countQuery += " AND (category_id = ? OR type_menu = ?)";
      countParams.push(category, category);
    }
    if (search) {
      countQuery += " AND (name LIKE ? OR details LIKE ?)";
      countParams.push(`%${search}%`, `%${search}%`);
    }
    const [countRows] = await pool.execute<CountRow[]>(
      countQuery,
      countParams
    );
    const total = Number(countRows[0]?.total ?? 0);

    const host = request.headers.get("host") || "storebymari.com";
    const protocolHeader =
      request.headers.get("x-forwarded-proto") || "https";
    const protocol = protocolHeader.split(",")[0].trim();
    const baseUrl = `${protocol}://${host}`;

    const formattedRows = rows.map((row) => {
      let finalPrice = Number(row.price || 0);
      if (isAdmin && row.main_price != null) {
        finalPrice = Number(row.main_price);
      } else if (userTier === "vip") {
        finalPrice = Number(row.price_vip ?? row.price ?? 0);
      } else if (userTier === "walkin") {
        finalPrice = Number(row.price_walkin ?? row.price ?? 0);
      }

      const formatted: Record<string, unknown> = {
        ...row,
        price: finalPrice,
        stock: Number(row.effective_stock_val ?? getEffectiveStockFromRecord(row)),
      };
      delete formatted.effective_stock_val;

      if (
        typeof formatted.image_url === "string" &&
        formatted.image_url.startsWith("/uploads")
      ) {
        formatted.image_url = `${baseUrl}${formatted.image_url}`;
      }

      delete formatted.cost_price;
      delete formatted.price_vip;
      delete formatted.price_walkin;
      delete formatted.main_price;
      delete formatted.account_email;
      delete formatted.account_password;
      delete formatted.account_data;

      return formatted;
    });

    return response({
      success: true,
      data: formattedRows,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    const errorCode =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "UNKNOWN";
    console.error("[master-products] query failed", {
      tenantId: tenant.tenant_id,
      errorCode,
    });
    return response(
      { success: false, message: "Failed to fetch products" },
      500
    );
  }
}
