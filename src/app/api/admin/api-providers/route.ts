import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/server";
import {
  canReadApiProviderMetadata,
  canManageGlobalApiProvider,
} from "@/lib/auth/access-policies";
import { getSiteId } from "@/lib/site";
import {
  getAllApiProviders,
  createApiProvider,
  updateApiProvider,
  deleteApiProvider,
  getApiProviderById,
} from "@/lib/api-providers/repository";
import type {
  CreateApiProviderInput,
  UpdateApiProviderInput,
} from "@/lib/api-providers/types";
import { toSafeApiProvider } from "@/lib/api-providers/presentation";
import { sendAdminAuditWebhook } from "@/lib/discord/admin-audit";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";

const createSchema = z.object({
  name: z.string().min(1, "กรุณาระบุชื่อ API provider"),
  displayName: z.string().min(1, "กรุณาระบุชื่อแสดง"),
  apiKey: z.string().nullable().optional(),
  apiEndpoint: z.string().url("กรุณาระบุ API endpoint ที่ถูกต้อง"),
  productEndpoint: z.string().url("กรุณาระบุ product endpoint ที่ถูกต้อง").nullable().optional(),
  buyEndpoint: z.string().url("กรุณาระบุ buy endpoint ที่ถูกต้อง").nullable().optional(),
  historyEndpoint: z.string().url("กรุณาระบุ history endpoint ที่ถูกต้อง").nullable().optional(),
  isActive: z.boolean().optional(),
});

const updateSchema = z.object({
  displayName: z.string().min(1).optional(),
  apiKey: z.string().optional(), // Optional, but if provided it should be a string
  apiEndpoint: z.string().url().optional(),
  productEndpoint: z.string().url().nullable().optional(),
  buyEndpoint: z.string().url().nullable().optional(),
  historyEndpoint: z.string().url().nullable().optional(),
  isActive: z.boolean().optional(),
});

function noStoreJson(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return response;
}

async function authorizeProviderRead() {
  const me = await getCurrentUser();
  if (!me) {
    return { user: null, response: noStoreJson({ message: "Unauthorized" }, 401) };
  }
  if (!canReadApiProviderMetadata(getSiteId(), me)) {
    return { user: null, response: noStoreJson({ message: "Forbidden" }, 403) };
  }
  return { user: me, response: null };
}

async function authorizeGlobalProviderManagement() {
  const me = await getCurrentUser();
  if (!me) {
    return { user: null, response: noStoreJson({ message: "Unauthorized" }, 401) };
  }
  if (!canManageGlobalApiProvider(getSiteId(), me)) {
    return { user: null, response: noStoreJson({ message: "Forbidden" }, 403) };
  }
  return { user: me, response: null };
}

export async function GET() {
  try {
    const authorization = await authorizeProviderRead();
    if (authorization.response) return authorization.response;

    const providers = await getAllApiProviders();
    return noStoreJson({ providers: providers.map(toSafeApiProvider) });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ไม่สามารถดึงข้อมูล API providers ได้";
    return noStoreJson({ message }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authorization = await authorizeGlobalProviderManagement();
    if (authorization.response) return authorization.response;
    const me = authorization.user!;

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return noStoreJson(
        { message: "รูปแบบข้อมูลไม่ถูกต้อง" },
        415,
      );
    }

    const rawBody = await request.json();
    const parsed = createSchema.safeParse(rawBody);

    if (!parsed.success) {
      return noStoreJson(
        {
          message: "ข้อมูลไม่ถูกต้อง",
          errors: parsed.error.flatten(),
        },
        400,
      );
    }

    const provider = await createApiProvider(parsed.data as CreateApiProviderInput);

    await recordAdminAuditEvent({
      actor: me,
      action: "API_PROVIDER_CREATE",
      category: "configuration",
      severity: "critical",
      entityType: "api_provider",
      entityId: provider.id,
      entityLabel: provider.displayName || provider.name,
      after: {
        name: provider.name,
        displayName: provider.displayName,
        apiEndpoint: provider.apiEndpoint,
        hasApiKey: Boolean(parsed.data.apiKey),
        isActive: provider.isActive,
      },
      details: "Created an API provider; API key was excluded",
      ...getAdminAuditRequestContext(request),
    });
    
    // Send audit webhook
    await sendAdminAuditWebhook({
      action: "สร้าง API Provider",
      target: `Provider: ${provider.displayName || provider.name} (ID: ${provider.id})`,
      details: `Endpoint: ${provider.apiEndpoint}`,
    });

    return noStoreJson({ provider: toSafeApiProvider(provider) }, 201);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ไม่สามารถสร้าง API provider ได้";
    return noStoreJson({ message }, 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authorization = await authorizeGlobalProviderManagement();
    if (authorization.response) return authorization.response;
    const me = authorization.user!;

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return noStoreJson(
        { message: "รูปแบบข้อมูลไม่ถูกต้อง" },
        415,
      );
    }

    const rawBody = await request.json();
    const { id, ...updateData } = rawBody;

    if (!id || typeof id !== "string") {
      return noStoreJson(
        { message: "กรุณาระบุ ID ของ API provider" },
        400,
      );
    }

    const parsed = updateSchema.safeParse(updateData);
    if (!parsed.success) {
      return noStoreJson(
        {
          message: "ข้อมูลไม่ถูกต้อง",
          errors: parsed.error.flatten(),
        },
        400,
      );
    }

    // Get current provider data for audit log
    const currentProvider = await getApiProviderById(id);
    
    const provider = await updateApiProvider(id, parsed.data as UpdateApiProviderInput);
    
    // Build changes object
    const changes: Record<string, { old: string | number | null; new: string | number | null }> = {};
    if (currentProvider) {
      if (parsed.data.displayName !== undefined) {
        changes["display_name"] = { old: currentProvider.displayName, new: parsed.data.displayName };
      }
      if (parsed.data.isActive !== undefined) {
        changes["is_active"] = { old: String(currentProvider.isActive), new: String(parsed.data.isActive) };
      }
      if (parsed.data.apiEndpoint !== undefined) {
        changes["api_endpoint"] = { old: currentProvider.apiEndpoint, new: parsed.data.apiEndpoint };
      }
    }

    await recordAdminAuditEvent({
      actor: me,
      action: "API_PROVIDER_UPDATE",
      category: "configuration",
      severity: "critical",
      entityType: "api_provider",
      entityId: id,
      entityLabel: currentProvider?.displayName || provider.displayName || provider.name,
      changes,
      after: {
        displayName: provider.displayName,
        apiEndpoint: provider.apiEndpoint,
        isActive: provider.isActive,
        apiKeyChanged: parsed.data.apiKey !== undefined,
      },
      details: "Updated an API provider; API key was excluded",
      ...getAdminAuditRequestContext(request),
    });

    // Send audit webhook
    await sendAdminAuditWebhook({
      action: "อัปเดต API Provider",
      target: `Provider ID: ${id}${currentProvider?.displayName ? ` (${currentProvider.displayName})` : ""}`,
      changes: Object.keys(changes).length > 0 ? changes : undefined,
    });

    return noStoreJson({ provider: toSafeApiProvider(provider) });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ไม่สามารถอัปเดต API provider ได้";
    return noStoreJson({ message }, 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authorization = await authorizeGlobalProviderManagement();
    if (authorization.response) return authorization.response;
    const me = authorization.user!;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return noStoreJson(
        { message: "กรุณาระบุ ID ของ API provider" },
        400,
      );
    }

    // Get provider data before deletion for audit log
    const provider = await getApiProviderById(id);
    
    await deleteApiProvider(id);

    await recordAdminAuditEvent({
      actor: me,
      action: "API_PROVIDER_DELETE",
      category: "configuration",
      severity: "critical",
      entityType: "api_provider",
      entityId: id,
      entityLabel: provider?.displayName || provider?.name || id,
      before: provider
        ? {
            name: provider.name,
            displayName: provider.displayName,
            apiEndpoint: provider.apiEndpoint,
            isActive: provider.isActive,
          }
        : undefined,
      details: "Deleted an API provider; credentials were excluded",
      ...getAdminAuditRequestContext(request),
    });
    
    // Send audit webhook
    await sendAdminAuditWebhook({
      action: "ลบ API Provider",
      target: `Provider ID: ${id}${provider?.displayName ? ` (${provider.displayName})` : ""}`,
    });

    return noStoreJson({ message: "ลบ API provider สำเร็จ" });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ไม่สามารถลบ API provider ได้";
    return noStoreJson({ message }, 500);
  }
}

