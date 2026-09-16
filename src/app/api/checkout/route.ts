import { randomUUID } from "crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/server";
import { getSiteId } from "@/lib/site";
import {
  claimCartCheckout,
  createCartCheckoutFingerprint,
  executeCartCheckout,
  normalizeCartPayload,
  waitForCartCheckout,
  type CartCheckoutPayload,
} from "@/lib/cart/checkout";
import { parseAppByMariStorefrontTypeId } from "@/lib/appbymari/types";
import {
  attachAppByMariCase,
  executeAppByMariStorefrontPurchase,
} from "@/lib/appbymari/purchase";

const bodySchema = z.object({
  lines: z.array(
    z.object({
      typeId: z.string().trim().min(1).max(255),
      quantity: z.coerce.number().finite().int().min(1),
    }),
  ).min(1).max(50),
});

function noStoreJson(body: unknown, status: number, headers?: HeadersInit) {
  const response = NextResponse.json(body, { status, headers });
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return response;
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return noStoreJson({ ok: false, message: "รูปแบบข้อมูลไม่ถูกต้อง" }, 415);
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return noStoreJson(
      { ok: false, message: "ข้อมูลตะกร้าไม่ถูกต้อง", errors: parsed.error.flatten() },
      422,
    );
  }

  let payload: CartCheckoutPayload;
  try {
    payload = normalizeCartPayload(parsed.data);
  } catch (error) {
    return noStoreJson(
      { ok: false, message: error instanceof Error ? error.message : "ข้อมูลตะกร้าไม่ถูกต้อง" },
      422,
    );
  }

  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || randomUUID();
  if (idempotencyKey.length > 128) {
    return noStoreJson({ ok: false, message: "Idempotency-Key ต้องไม่เกิน 128 ตัวอักษร" }, 400);
  }

  const siteId = getSiteId();
  const requestFingerprint = createCartCheckoutFingerprint(payload);
  try {
    const externalLines = payload.lines.filter((line) => parseAppByMariStorefrontTypeId(line.typeId));
    if (externalLines.length > 0) {
      if (externalLines.length !== 1 || payload.lines.length !== 1) {
        return noStoreJson(
          { ok: false, message: "สินค้าจากร้านหลักต้องสั่งซื้อแยกจากสินค้าในร้าน StoreByMari" },
          409,
          { "Idempotency-Key": idempotencyKey },
        );
      }
      const line = externalLines[0];
      const result = await executeAppByMariStorefrontPurchase({
        buyerUserId: user.id,
        typeId: line.typeId,
        quantity: line.quantity,
        idempotencyKey,
      });
      let body = result.body as typeof result.body & { caseOrder?: unknown };
      if (result.status === 200 && body.ok && result.orderIds?.length) {
        const caseOrder = await attachAppByMariCase({ buyerUserId: user.id, orderIds: result.orderIds });
        if (caseOrder) body = { ...body, caseOrder };
        (revalidateTag as any)("products");
        revalidatePath("/");
        revalidatePath("/products");
        revalidatePath("/api/products");
      }
      const headers: HeadersInit = { "Idempotency-Key": idempotencyKey };
      if (result.replayed) headers["Idempotency-Replayed"] = "true";
      if (result.status === 202) headers["Retry-After"] = "1";
      return noStoreJson(body, result.status, headers);
    }

    const claim = await claimCartCheckout({
      siteId,
      buyerUserId: user.id,
      idempotencyKey,
      requestFingerprint,
    });

    if (claim.kind === "existing") {
      if (claim.decision.kind === "conflict") {
        return noStoreJson({ ok: false, message: "Idempotency key ถูกใช้กับข้อมูลตะกร้าอื่นแล้ว" }, 409, {
          "Idempotency-Key": idempotencyKey,
        });
      }
      if (claim.decision.kind === "processing") {
        const waited = await waitForCartCheckout({
          siteId,
          buyerUserId: user.id,
          idempotencyKey,
          requestFingerprint,
        });
        const headers: HeadersInit = { "Idempotency-Key": idempotencyKey };
        if (waited.replayed) headers["Idempotency-Replayed"] = "true";
        if (waited.status === 202) headers["Retry-After"] = "1";
        return noStoreJson(waited.body, waited.status, headers);
      }
      const headers: HeadersInit = { "Idempotency-Key": idempotencyKey };
      if (claim.decision.kind === "replay" && claim.decision.result.replayed) headers["Idempotency-Replayed"] = "true";
      if (claim.decision.kind === "replay") {
        return noStoreJson(claim.decision.result.body, claim.decision.result.status, headers);
      }
      return noStoreJson({ ok: false, message: "ระบบกำลังดำเนินการสั่งซื้อ" }, 202, headers);
    }

    const result = await executeCartCheckout({
      requestId: claim.requestId,
      processingToken: claim.processingToken,
      siteId,
      buyerUserId: user.id,
      payload,
    });

    if (result.status === 200) {
      (revalidateTag as any)("products");
      revalidatePath("/");
      revalidatePath("/products");
      revalidatePath("/api/products");
    }

    const headers: HeadersInit = { "Idempotency-Key": idempotencyKey };
    if (result.status === 202) headers["Retry-After"] = "1";
    return noStoreJson(result.body, result.status, headers);
  } catch (error) {
    console.error("Cart checkout failed:", error);
    return noStoreJson({ ok: false, message: "ไม่สามารถดำเนินการสั่งซื้อจากตะกร้าได้" }, 500, {
      "Idempotency-Key": idempotencyKey,
    });
  }
}
