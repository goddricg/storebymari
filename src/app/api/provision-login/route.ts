import { NextResponse } from "next/server";
import { z } from "zod";

import { createUser, findUserByEmail } from "@/lib/auth/user";
import { hashPassword, normalizeEmail } from "@/lib/auth/password";

export const dynamic = "force-dynamic";

const TOKEN_ENV = "PROVISION_LOGIN_TOKEN";
const SITE_ID = "main";

const accountSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(2).max(64),
});
type RequestFormData = { get(name: string): string | File | null };

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function authorized(token: string | null) {
  return Boolean(
    process.env[TOKEN_ENV]
      && process.env.NEXT_PUBLIC_SITE_ID === SITE_ID
      && token
      && token === process.env[TOKEN_ENV],
  );
}

function html(message = "") {
  const safeMessage = message ? `<p>${escapeHtml(message)}</p>` : "";
  return new NextResponse(`<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Provision account</title></head>
<body><main><h1>StoreByMari account provisioning</h1>${safeMessage}
<form method="post"><label>Email <input name="email" type="email" required></label>
<label>Password <input name="password" type="password" required></label>
<label>Display name <input name="displayName" value="StoreByMari User" required></label>
<input name="token" type="hidden" value="${escapeHtml(process.env[TOKEN_ENV] ?? "")}">
<button type="submit">Provision account</button></form><p><a href="/login">Go to login</a></p></main></body></html>`, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!authorized(token)) return new NextResponse(null, { status: 404 });
  return html();
}

export async function POST(request: Request) {
  const body = await request.formData() as unknown as RequestFormData;
  const token = typeof body.get("token") === "string" ? body.get("token") as string : null;
  if (!authorized(token)) return new NextResponse(null, { status: 404 });

  const parsed = accountSchema.safeParse({
    email: body.get("email"),
    password: body.get("password"),
    displayName: body.get("displayName"),
  });
  if (!parsed.success) {
    return new NextResponse("Invalid account data", {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const email = normalizeEmail(parsed.data.email);
  if (await findUserByEmail(email)) {
    return html("This email already has an account. Use the login page.");
  }

  await createUser({
    email,
    passwordHash: await hashPassword(parsed.data.password),
    displayName: parsed.data.displayName,
  });
  return html("Account created successfully. Use the login page to test it.");
}
