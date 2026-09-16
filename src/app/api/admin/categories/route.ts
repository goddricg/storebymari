import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { getCurrentUser } from "@/lib/auth/server";
import { isAdminUser } from "@/lib/auth/roles";
import { getSiteId } from "@/lib/site";
import {
  getAllCategoriesIncludingInactive,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryById,
  type CategoryScope,
} from "@/lib/categories/repository";
import { sendAdminAuditWebhook } from "@/lib/discord/admin-audit";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";

const createSchema = z.object({
  name: z.string().min(1, "ชื่อหมวดหมู่ต้องไม่ว่าง"),
  description: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  displayOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

type CategoryScopeResolution =
  | { scope: CategoryScope; response?: never }
  | { response: NextResponse; scope?: never };

function resolveCategoryScope(
  request: Request,
  mutation: boolean,
): CategoryScopeResolution {
  try {
    const rawIsLocal = new URL(request.url).searchParams.get("isLocal");
    if (rawIsLocal !== null && rawIsLocal !== "true" && rawIsLocal !== "false") {
      return {
        response: NextResponse.json(
          { message: "ค่า isLocal ไม่ถูกต้อง" },
          { status: 422 },
        ),
      };
    }

    const siteId = getSiteId();
    if (!siteId) {
      return {
        response: NextResponse.json(
          { message: "ไม่พบ site id สำหรับกำหนดขอบเขตหมวดหมู่" },
          { status: 500 },
        ),
      };
    }

    const scope: CategoryScope = {
      siteId,
      isLocal: rawIsLocal === "true",
    };

    // Child Admin operations must be explicitly local. This prevents a
    // direct caller from using the global read scope to mutate shared data.
    if (mutation && siteId !== "main" && !scope.isLocal) {
      return {
        response: NextResponse.json(
          { message: "เว็บลูกสามารถจัดการได้เฉพาะหมวดหมู่ local ของเว็บตัวเอง" },
          { status: 403 },
        ),
      };
    }

    return { scope };
  } catch (error) {
    console.error("Category scope resolution failed:", error);
    return {
      response: NextResponse.json(
        { message: "ไม่สามารถกำหนดขอบเขตหมวดหมู่ได้" },
        { status: 500 },
      ),
    };
  }
}

function invalidatePublicCategoryCaches() {
  try {
    revalidatePath("/");
    revalidatePath("/products");
    revalidatePath("/api/products");
    revalidateTag("products", { expire: 0 });
    revalidateTag("categories", { expire: 0 });
  } catch (error) {
    // A successful database mutation must not be reported as failed only
    // because a deployment does not expose the cache invalidation context.
    console.warn("Public category cache invalidation failed:", error);
  }
}

export async function GET(request: NextRequest) {
  const me = await getCurrentUser();
  const isAdmin = isAdminUser(me);
  if (!me || !isAdmin) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const resolved = resolveCategoryScope(request, false);
    if (resolved.response) return resolved.response;

    const categories = await getAllCategoriesIncludingInactive(resolved.scope);
    return NextResponse.json({ categories });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถโหลดหมวดหมู่ได้";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const me = await getCurrentUser();
  const isAdmin = isAdminUser(me);
  if (!me || !isAdmin) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const resolved = resolveCategoryScope(request, true);
    if (resolved.response) return resolved.response;

    const body = await request.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: "ข้อมูลไม่ถูกต้อง", errors: parsed.error.issues },
        { status: 422 }
      );
    }

    const category = await createCategory(
      parsed.data.name,
      parsed.data.description ?? null,
      parsed.data.imageUrl ?? null,
      parsed.data.displayOrder ?? 0,
      parsed.data.isActive ?? true,
      resolved.scope.siteId,
      resolved.scope.isLocal,
    );

    invalidatePublicCategoryCaches();

    await recordAdminAuditEvent({
      actor: me,
      action: "CATEGORY_CREATE",
      category: "catalog",
      severity: "low",
      entityType: "category",
      entityId: category.id,
      entityLabel: category.name,
      after: {
        name: category.name,
        displayOrder: category.displayOrder,
        isActive: category.isActive,
      },
      details: "Created a product category",
      ...getAdminAuditRequestContext(request),
    });

    // Send audit webhook
    await sendAdminAuditWebhook({
      action: "สร้างหมวดหมู่",
      target: `Category: ${category.name}`,
      details: `สร้างหมวดหมู่ "${category.name}" สำเร็จ`,
    });

    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถสร้างหมวดหมู่ได้";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const me = await getCurrentUser();
  const isAdmin = isAdminUser(me);
  if (!me || !isAdmin) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const resolved = resolveCategoryScope(request, true);
    if (resolved.response) return resolved.response;

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ message: "กรุณาระบุ ID ของหมวดหมู่" }, { status: 422 });
    }

    const parsed = updateSchema.safeParse(updates);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "ข้อมูลไม่ถูกต้อง", errors: parsed.error.issues },
        { status: 422 }
      );
    }

    // Get current category for audit
    const currentCategory = await getCategoryById(id, resolved.scope);
    if (!currentCategory) {
      return NextResponse.json({ message: "ไม่พบหมวดหมู่" }, { status: 404 });
    }

    const updatePayload: {
      name?: string;
      description?: string | null;
      imageUrl?: string | null;
      displayOrder?: number;
      isActive?: boolean;
    } = {};

    if (parsed.data.name !== undefined) updatePayload.name = parsed.data.name;
    if (parsed.data.description !== undefined) updatePayload.description = parsed.data.description;
    if (parsed.data.imageUrl !== undefined) updatePayload.imageUrl = parsed.data.imageUrl;
    if (parsed.data.displayOrder !== undefined) updatePayload.displayOrder = parsed.data.displayOrder;
    if (parsed.data.isActive !== undefined) updatePayload.isActive = parsed.data.isActive;

    const category = await updateCategory(id, updatePayload, resolved.scope);

    invalidatePublicCategoryCaches();

    // Send audit webhook
    const changes: Record<string, { old: string | number | null; new: string | number | null }> = {};
    if (parsed.data.name !== undefined && parsed.data.name !== currentCategory.name) {
      changes["name"] = { old: currentCategory.name, new: parsed.data.name };
    }
    if (parsed.data.isActive !== undefined && parsed.data.isActive !== currentCategory.isActive) {
      changes["isActive"] = { 
        old: currentCategory.isActive ? "true" : "false", 
        new: parsed.data.isActive ? "true" : "false" 
      };
    }

    await recordAdminAuditEvent({
      actor: me,
      action: "CATEGORY_UPDATE",
      category: "catalog",
      severity: "medium",
      entityType: "category",
      entityId: category.id,
      entityLabel: category.name,
      before: {
        name: currentCategory.name,
        displayOrder: currentCategory.displayOrder,
        isActive: currentCategory.isActive,
      },
      after: {
        name: category.name,
        displayOrder: category.displayOrder,
        isActive: category.isActive,
      },
      changes,
      details: "Updated a product category",
      ...getAdminAuditRequestContext(request),
    });

    await sendAdminAuditWebhook({
      action: "อัปเดตหมวดหมู่",
      target: `Category: ${category.name}`,
      changes: Object.keys(changes).length > 0 ? changes : undefined,
    });

    return NextResponse.json({ category });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถอัปเดตหมวดหมู่ได้";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const me = await getCurrentUser();
  const isAdmin = isAdminUser(me);
  if (!me || !isAdmin) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const resolved = resolveCategoryScope(request, true);
    if (resolved.response) return resolved.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ message: "กรุณาระบุ ID ของหมวดหมู่" }, { status: 422 });
    }

    // Get category for audit
    const category = await getCategoryById(id, resolved.scope);
    if (!category) {
      return NextResponse.json({ message: "ไม่พบหมวดหมู่" }, { status: 404 });
    }

    await deleteCategory(id, resolved.scope);

    invalidatePublicCategoryCaches();

    await recordAdminAuditEvent({
      actor: me,
      action: "CATEGORY_DELETE",
      category: "catalog",
      severity: "high",
      entityType: "category",
      entityId: category.id,
      entityLabel: category.name,
      before: {
        name: category.name,
        displayOrder: category.displayOrder,
        isActive: category.isActive,
      },
      details: "Deleted a product category",
      ...getAdminAuditRequestContext(request),
    });

    // Send audit webhook
    await sendAdminAuditWebhook({
      action: "ลบหมวดหมู่",
      target: `Category: ${category.name}`,
      details: `ลบหมวดหมู่ "${category.name}" สำเร็จ`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถลบหมวดหมู่ได้";
    return NextResponse.json({ message }, { status: 500 });
  }
}

