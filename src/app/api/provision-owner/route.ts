import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { z } from "zod";

import { normalizeEmail } from "@/lib/auth/password";
import pool from "@/lib/mysql";

export const dynamic = "force-dynamic";

const SITE_ID = "main";
const TOKEN_ENV = "PROVISION_OWNER_TOKEN";
const TARGET_ENV = "OWNER_PROMOTION_TARGET";
const PRIMARY_OWNER_ENV = "PRIMARY_SUPER_ADMIN_EMAIL";

const targetSchema = z.object({
  email: z.string().email(),
});
type RequestFormData = { get(name: string): string | File | null };

type OwnerTargetRow = RowDataPacket & {
  id: string;
  role: string | null;
  is_admin: number | boolean;
  is_active: number | boolean;
  is_banned: number | boolean;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function responseHeaders() {
  return {
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "text/html; charset=utf-8",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  };
}

function isAuthorized(token: string | null) {
  return Boolean(
    process.env[TOKEN_ENV]?.trim()
      && process.env[TARGET_ENV]?.trim().toLowerCase() === "storebymari.com"
      && process.env.NEXT_PUBLIC_SITE_ID === SITE_ID
      && token
      && token === process.env[TOKEN_ENV],
  );
}

function isAllowedTarget(email: string) {
  const primaryOwnerEmail = normalizeEmail(process.env[PRIMARY_OWNER_ENV] ?? "");
  return Boolean(primaryOwnerEmail && email === primaryOwnerEmail);
}

function page(message = "") {
  const safeMessage = message ? `<p>${escapeHtml(message)}</p>` : "";
  return new NextResponse(`<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Owner promotion</title></head>
<body><main><h1>StoreByMari Owner promotion</h1>${safeMessage}
<form method="post"><label>Account email <input name="email" type="email" required></label>
<input name="token" type="hidden" value="${escapeHtml(process.env[TOKEN_ENV] ?? "")}">
<button type="submit">Promote to Owner</button></form><p><a href="/login">Go to login</a></p></main></body></html>`, {
    headers: responseHeaders(),
  });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!isAuthorized(token)) return new NextResponse(null, { status: 404 });
  return page();
}

export async function POST(request: Request) {
  const body = await request.formData() as unknown as RequestFormData;
  const token = typeof body.get("token") === "string" ? body.get("token") as string : null;
  if (!isAuthorized(token)) return new NextResponse(null, { status: 404 });

  const parsed = targetSchema.safeParse({ email: body.get("email") });
  if (!parsed.success) {
    return new NextResponse("Invalid account email", {
      status: 400,
      headers: responseHeaders(),
    });
  }

  const email = normalizeEmail(parsed.data.email);
  if (!isAllowedTarget(email)) {
    return new NextResponse("Target account is not allowed", {
      status: 403,
      headers: responseHeaders(),
    });
  }

  const connection = await pool.getConnection();
  let transactionOpen = false;

  try {
    await connection.beginTransaction();
    transactionOpen = true;

    const [rows] = await connection.execute<OwnerTargetRow[]>(
      `SELECT id, role, is_admin, is_active, is_banned
       FROM users
       WHERE email = ? AND site_id = ?
       LIMIT 2 FOR UPDATE`,
      [email, SITE_ID],
    );

    if (rows.length === 0) {
      await connection.rollback();
      transactionOpen = false;
      return new NextResponse("Target account not found", {
        status: 404,
        headers: responseHeaders(),
      });
    }
    if (rows.length > 1) {
      await connection.rollback();
      transactionOpen = false;
      return new NextResponse("Duplicate target accounts", {
        status: 409,
        headers: responseHeaders(),
      });
    }
    if (Number(rows[0].is_active) !== 1 || Number(rows[0].is_banned) !== 0) {
      await connection.rollback();
      transactionOpen = false;
      return new NextResponse("Target account is not active", {
        status: 409,
        headers: responseHeaders(),
      });
    }

    await connection.execute(
      `UPDATE users
       SET role = 'owner', is_admin = 1, updated_at = ?
       WHERE id = ? AND site_id = ?`,
      [new Date(), rows[0].id, SITE_ID],
    );

    await connection.commit();
    transactionOpen = false;

    const [verifiedRows] = await connection.execute<OwnerTargetRow[]>(
      `SELECT id, role, is_admin, is_active, is_banned
       FROM users
       WHERE email = ? AND site_id = ?
       LIMIT 2`,
      [email, SITE_ID],
    );
    const verified = verifiedRows.length === 1
      && verifiedRows[0].role === "owner"
      && Number(verifiedRows[0].is_admin) === 1
      && Number(verifiedRows[0].is_active) === 1
      && Number(verifiedRows[0].is_banned) === 0;

    if (!verified) {
      return new NextResponse("Owner promotion verification failed", {
        status: 500,
        headers: responseHeaders(),
      });
    }

    return page("Account promoted to Owner successfully. Password was not changed.");
  } catch {
    if (transactionOpen) await connection.rollback().catch(() => undefined);
    return new NextResponse("Owner promotion failed", {
      status: 500,
      headers: responseHeaders(),
    });
  } finally {
    connection.release();
  }
}
