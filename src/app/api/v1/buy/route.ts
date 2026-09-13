import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateApiKey } from "@/lib/auth/api-key";
import {
  MAX_IDEMPOTENCY_KEY_LENGTH,
  createPurchaseFingerprint,
  resolvePurchaseIdempotencyKey,
} from "@/lib/purchases/idempotency";
import {
  claimMasterPurchase,
  executeMasterPurchase,
  waitForMasterPurchase,
  type MasterPurchaseBody,
  type MasterPurchaseResult,
} from "@/lib/purchases/master-purchase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  typeId: z.string().trim().min(1),
  quantity: z.number().int().min(1).max(100).optional().default(1),
  requestId: z.string().trim().min(1).max(MAX_IDEMPOTENCY_KEY_LENGTH).optional(),
});

function corsHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, x-api-key, Authorization, Idempotency-Key"
  );
  headers.set(
    "Access-Control-Expose-Headers",
    "Idempotency-Replayed, Retry-After"
  );
  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  return headers;
}
function jsonResponse(
  result: MasterPurchaseResult,
  idempotencyKey?: string
): NextResponse<MasterPurchaseBody> {
  const headers = corsHeaders();
  if (result.replayed) {
    headers.set("Idempotency-Replayed", "true");
  }
  if (result.status === 202) {
    headers.set("Retry-After", "1");
  }
  if (idempotencyKey) {
    headers.set("Idempotency-Key", idempotencyKey);
  }

  return NextResponse.json(result.body, {
    status: result.status,
    headers,
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

export async function POST(request: NextRequest) {
  const auth = await validateApiKey(request.headers);
  if (!auth) {
    return jsonResponse({
      status: 401,
      body: {
        ok: false,
        message: "Unauthorized: Invalid or missing API Key",
      },
    });
  }
  if (auth.is_site_suspended) {
    return jsonResponse({
      status: 403,
      body: {
        ok: false,
        message: "This tenant is suspended.",
      },
    });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonResponse({
      status: 400,
      body: { ok: false, message: "Request body must be valid JSON." },
    });
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        message: "Invalid request data.",
        errors: parsed.error.flatten(),
      },
      { status: 400, headers: corsHeaders() }
    );
  }

  const resolvedKey = resolvePurchaseIdempotencyKey({
    headerKey: request.headers.get("Idempotency-Key"),
    requestId: parsed.data.requestId,
  });
  if (resolvedKey.key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return jsonResponse({
      status: 400,
      body: {
        ok: false,
        message: `Idempotency key must not exceed ${MAX_IDEMPOTENCY_KEY_LENGTH} characters.`,
      },
    });
  }

  const payload = {
    typeId: parsed.data.typeId,
    quantity: parsed.data.quantity,
  };
  const requestFingerprint = createPurchaseFingerprint(payload);

  if (resolvedKey.isLegacy) {
    console.warn("[master-purchase] legacy request without idempotency key", {
      tenantId: auth.tenant_id,
    });
  }

  try {
    const claim = await claimMasterPurchase({
      auth,
      idempotencyKey: resolvedKey.key,
      requestFingerprint,
      payload,
    });

    if (claim.kind === "existing") {
      if (claim.decision.kind === "conflict") {
        return jsonResponse(
          {
            status: 409,
            body: {
              ok: false,
              message:
                "Idempotency key was already used with a different payload.",
            },
          },
          resolvedKey.key
        );
      }

      if (claim.decision.kind === "replay") {
        return jsonResponse(
          {
            status: claim.decision.status,
            body: claim.decision.body as MasterPurchaseBody,
            replayed: true,
          },
          resolvedKey.key
        );
      }

      const waited = await waitForMasterPurchase({
        tenantId: auth.tenant_id,
        idempotencyKey: resolvedKey.key,
        requestFingerprint,
      });
      return jsonResponse(waited, resolvedKey.key);
    }

    const result = await executeMasterPurchase({
      requestId: claim.requestId,
      processingToken: claim.processingToken,
      auth,
      payload,
    });

    if (result.status === 200) {
      try {
        revalidateTag("products", { expire: 0 });
      } catch {
        console.warn("[master-purchase] product cache invalidation failed", {
          tenantId: auth.tenant_id,
        });
      }
    }

    return jsonResponse(result, resolvedKey.key);
  } catch {
    console.error("[master-purchase] request coordination failed", {
      tenantId: auth.tenant_id,
    });
    return jsonResponse({
      status: 500,
      body: { ok: false, message: "Internal purchase processing error." },
    });
  }
}
