import { NextResponse, NextRequest } from "next/server";
import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { getCurrentUser } from "@/lib/auth/server";
import { isAdminUser } from "@/lib/auth/roles";
import { getSiteId } from "@/lib/site";
import {
  fetchAllProducts,
  fetchAllProductsPaginated,
  updateProductPrice,
  updateProductPublishStatus,
  bulkUpdatePublishStatus,
  getAllCategories,
  getAllCategoriesCached,
  findProductByTypeId,
  updateProductBadge,
  createProduct,
  updateProduct,
  deleteProduct,
} from "@/lib/products/repository";
import { createCategory } from "@/lib/categories/repository";
import { sendAdminAuditWebhook } from "@/lib/discord/admin-audit";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";
import { sendRestockAlertEmail } from "@/lib/email/restock-alert";
import { triggerMimiAutoPilot } from "@/lib/ai/mimi-generator";

const createSchema = z.object({
  typeId: z.string().min(1, "Type ID ต้องไม่ว่าง"),
  name: z.string().min(1, "ชื่อสินค้าต้องไม่ว่าง"),
  imageUrl: z.string().nullable().optional(),
  details: z.string().nullable().optional(),
  price: z.number().nonnegative("ราคาต้องมากกว่าหรือเท่ากับ 0").nullable().optional(),
  priceVip: z.number().nonnegative("ราคา VIP ต้องมากกว่าหรือเท่ากับ 0").nullable().optional(),
  costPrice: z.number().nonnegative("ต้นทุนจริงต้องมากกว่าหรือเท่ากับ 0").nullable().optional(),
  priceWalkin: z.number().nonnegative("ราคาขาจรต้องมากกว่าหรือเท่ากับ 0").nullable().optional(),
  stock: z.number().int().nonnegative("สต็อกต้องมากกว่าหรือเท่ากับ 0").nullable().optional(),
  categoryId: z.string().nullable().optional(),
  newCategoryName: z.string().nullable().optional(),
  accountEmail: z.string().email().nullable().optional(),
  accountPassword: z.string().nullable().optional(),
  accountData: z.array(z.object({
    email: z.string(),
    password: z.string(),
    details: z.string().optional(),
  })).nullable().optional(),
  isPublished: z.boolean().default(false),
  badge: z.enum(['hot_sale', 'recommended']).nullable().optional(),
  isLocal: z.boolean().default(false),
});

const updateSchema = z.object({
  typeId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  imageUrl: z.string().nullable().optional(),
  details: z.string().nullable().optional(),
  price: z.number().nonnegative("ราคาต้องมากกว่าหรือเท่ากับ 0").nullable().optional(),
  priceVip: z.number().nonnegative("ราคา VIP ต้องมากกว่าหรือเท่ากับ 0").nullable().optional(),
  costPrice: z.number().nonnegative("ต้นทุนจริงต้องมากกว่าหรือเท่ากับ 0").nullable().optional(),
  priceWalkin: z.number().nonnegative("ราคาขาจรต้องมากกว่าหรือเท่ากับ 0").nullable().optional(),
  stock: z.number().int().nonnegative("สต็อกต้องมากกว่าหรือเท่ากับ 0").nullable().optional(),
  categoryId: z.string().nullable().optional(),
  newCategoryName: z.string().nullable().optional(),
  accountEmail: z.string().email().nullable().optional(),
  accountPassword: z.string().nullable().optional(),
  accountData: z.array(z.object({
    email: z.string(),
    password: z.string(),
    details: z.string().optional(),
  })).nullable().optional(),
  isPublished: z.boolean().optional(),
  badge: z.enum(['hot_sale', 'recommended']).nullable().optional(),
  bulkPublish: z.boolean().optional(), // For bulk update
  onlyWithStock: z.boolean().optional(), // For bulk update: only update products with stock > 0
});

export async function GET(request: NextRequest) {
  const me = await getCurrentUser();
  const isAdmin = isAdminUser(me);
  if (!me || !isAdmin) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const usePagination = searchParams.get("pagination") === "true";
  const category = searchParams.get("category") || undefined;
  const search = searchParams.get("search") || undefined;
  const isLocalParam = searchParams.get("isLocal");
  const isLocalFilter = isLocalParam === "true" ? true : isLocalParam === "false" ? false : null;
  const includeAccountData = searchParams.get("includeAccountData") !== "false";

  const hasFilter = searchParams.has("limit") || searchParams.has("isLocal") || searchParams.has("category") || searchParams.has("search") || usePagination;

  if (hasFilter) {
    const offset = (page - 1) * limit;
    const result = await fetchAllProductsPaginated(
      limit,
      offset,
      category && category !== "ทั้งหมด" ? category : undefined,
      search && search.trim().length > 0 ? search : undefined,
      isLocalFilter,
      includeAccountData
    );
    const categories = await getAllCategoriesCached();
    await recordAdminAuditEvent({
      actor: me,
      action: "PRODUCT_LIST_VIEW",
      category: "catalog",
      severity: includeAccountData ? "high" : "medium",
      entityType: "product_collection",
      after: {
        page,
        limit,
        total: result.total,
        includeAccountData,
        isLocal: isLocalFilter,
      },
      details: includeAccountData
        ? "Viewed product data that may include stock metadata; contents were not copied into audit storage"
        : "Viewed product list",
      ...getAdminAuditRequestContext(request),
    });
    return NextResponse.json({
      products: result.products,
      total: result.total,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
      categories,
    });
  }

  // Fallback to fetch all (for backward compatibility)
  const products = await fetchAllProducts();
  await recordAdminAuditEvent({
    actor: me,
    action: "PRODUCT_LIST_VIEW",
    category: "catalog",
    severity: "high",
    entityType: "product_collection",
    after: { total: products.length, includeAccountData: true },
    details: "Viewed the full product list",
    ...getAdminAuditRequestContext(request),
  });
  return NextResponse.json({ products });
}

export async function POST(request: Request) {
  const me = await getCurrentUser();
  const isAdmin = isAdminUser(me);
  if (!me || !isAdmin) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: "ข้อมูลไม่ถูกต้อง", errors: parsed.error.issues },
        { status: 422 }
      );
    }

    let finalCategoryId = parsed.data.categoryId ?? null;
    
    if (parsed.data.newCategoryName && parsed.data.newCategoryName.trim() !== '') {
      const siteId = getSiteId();
      const newCategory = await createCategory(
        parsed.data.newCategoryName.trim(),
        null,
        null,
        0,
        true,
        siteId,
        true
      );
      finalCategoryId = newCategory.id;
    }

    const product = await createProduct(
      parsed.data.typeId,
      parsed.data.name,
      parsed.data.imageUrl ?? null,
      parsed.data.details ?? null,
      parsed.data.price ?? null,
      parsed.data.priceVip ?? null,
      parsed.data.costPrice ?? null,
      parsed.data.priceWalkin ?? null,
      parsed.data.stock ?? null,
      finalCategoryId,
      parsed.data.accountEmail ?? null,
      parsed.data.accountPassword ?? null,
      parsed.data.isPublished ?? false,
      parsed.data.badge ?? null,
      parsed.data.isLocal ?? false
    );

    await recordAdminAuditEvent({
      actor: me,
      action: "PRODUCT_CREATE",
      category: "catalog",
      severity: "medium",
      entityType: "product",
      entityId: product.typeId,
      entityLabel: product.name,
      after: {
        typeId: product.typeId,
        name: product.name,
        stock: product.stock,
        categoryId: product.categoryId,
        isPublished: product.isPublished,
        badge: product.badge,
        accountCount: parsed.data.accountData?.length ?? 0,
      },
      details: "Created a product without storing account contents in the audit log",
      ...getAdminAuditRequestContext(request),
    });

    // Send audit webhook
    await sendAdminAuditWebhook({
      action: "สร้างสินค้า",
      target: `Product: ${product.name} (${product.typeId})`,
      details: `สร้างสินค้า "${product.name}" สำเร็จ`,
    });

    if (product.stock && product.stock > 0) {
      try {
        await sendRestockAlertEmail({
          productName: product.name,
          amount: product.stock,
          previousStock: 0,
          remainingStock: product.stock,
          actorName: (me as any).displayName || (me as any).username || "Admin",
          actorEmail: me.email || "",
          note: "สร้างสินค้าใหม่พร้อมสต็อกเริ่มต้น (Product Create)",
        });
      } catch (emailErr) {
        console.error("[Restock Email Error]:", emailErr);
      }

      try {
        await triggerMimiAutoPilot({
          productName: product.name,
          amount: product.stock,
          previousStock: 0,
          remainingStock: product.stock,
          actorName: (me as any).displayName || (me as any).username || "Admin",
        });
      } catch (mimiErr) {
        console.error("[Mimi Auto-Pilot Error]:", mimiErr);
      }
    }

    revalidatePath("/");
    revalidatePath("/api/products");
    (revalidateTag as any)("products");
    (revalidateTag as any)("categories");

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถสร้างสินค้าได้";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const me = await getCurrentUser();
  const isAdmin = isAdminUser(me);
  if (!me || !isAdmin) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 422 });
  }

  const { typeId, name, imageUrl, details, price, priceVip, costPrice, priceWalkin, stock, categoryId, newCategoryName, accountEmail, accountPassword, accountData, isPublished, badge, bulkPublish, onlyWithStock } = parsed.data;

  // Handle bulk publish/unpublish
  if (typeof bulkPublish !== "undefined" && !typeId) {
    try {
      const count = await bulkUpdatePublishStatus(bulkPublish, onlyWithStock ?? false);

      await recordAdminAuditEvent({
        actor: me,
        action: "PRODUCT_PUBLISH_BULK",
        category: "catalog",
        severity: "high",
        entityType: "product_collection",
        entityLabel: "Bulk publish status",
        after: { count, published: bulkPublish, onlyWithStock: onlyWithStock ?? false },
        details: "Updated publish status for multiple products",
        ...getAdminAuditRequestContext(request),
      });
      const scope = onlyWithStock ? "ที่มีสต็อก" : "ทั้งหมด";
      
      // Send audit webhook
      await sendAdminAuditWebhook({
        action: "อัปเดตสถานะเผยแพร่สินค้า (Bulk)",
        details: `อัปเดต ${count} รายการ${scope} เป็น ${bulkPublish ? "เผยแพร่" : "ไม่เผยแพร่"}`,
      });

      revalidatePath("/");
      revalidatePath("/api/products");
    (revalidateTag as any)("products");
    (revalidateTag as any)("categories");

      return NextResponse.json({
        success: true,
        message: `อัปเดตสถานะเผยแพร่ ${count} รายการ${scope}สำเร็จ`,
        count,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "อัปเดตข้อมูลไม่สำเร็จ";
      return NextResponse.json({ message }, { status: 500 });
    }
  }

  if (!typeId) {
    return NextResponse.json({ message: "กรุณาระบุ typeId" }, { status: 422 });
  }

  // Check if any update fields are provided
  const hasUpdates = 
    typeof name !== "undefined" ||
    typeof imageUrl !== "undefined" ||
    typeof details !== "undefined" ||
    typeof price !== "undefined" ||
    typeof priceVip !== "undefined" ||
    typeof costPrice !== "undefined" ||
    typeof priceWalkin !== "undefined" ||
    typeof stock !== "undefined" ||
    typeof categoryId !== "undefined" ||
    typeof newCategoryName !== "undefined" ||
    typeof accountEmail !== "undefined" ||
    typeof accountPassword !== "undefined" ||
    typeof accountData !== "undefined" ||
    typeof isPublished !== "undefined" ||
    typeof badge !== "undefined";

  if (!hasUpdates && typeof bulkPublish === "undefined") {
    return NextResponse.json({ message: "ไม่มีข้อมูลสำหรับอัปเดต" }, { status: 422 });
  }

  try {
    // Get current product data for audit log
    const currentProduct = await findProductByTypeId(typeId);
    if (!currentProduct) {
      return NextResponse.json({ message: "ไม่พบสินค้า" }, { status: 404 });
    }
    
    const changes: Record<string, { old: string | number | null; new: string | number | null }> = {};
    
    // Use new updateProduct function for comprehensive updates
    const updatePayload: {
      name?: string;
      imageUrl?: string | null;
      details?: string | null;
      price?: number | null;
      priceVip?: number | null;
      costPrice?: number | null;
      priceWalkin?: number | null;
      stock?: number | null;
      categoryId?: string | null;
      accountEmail?: string | null;
      accountPassword?: string | null;
      accountData?: Array<{ email: string; password: string; details: string }> | null;
      isPublished?: boolean;
      badge?: 'hot_sale' | 'recommended' | null;
    } = {};

    if (typeof name !== "undefined") {
      updatePayload.name = name;
      if (currentProduct.name !== name) {
        changes["name"] = { old: currentProduct.name, new: name };
      }
    }
    if (typeof imageUrl !== "undefined") {
      updatePayload.imageUrl = imageUrl;
      if (currentProduct.imageUrl !== imageUrl) {
        changes["imageUrl"] = { old: currentProduct.imageUrl, new: imageUrl };
      }
    }
    if (typeof details !== "undefined") {
      updatePayload.details = details;
    }
    if (typeof price !== "undefined") {
      updatePayload.price = price;
      if (currentProduct.price !== price) {
        changes["price"] = { old: currentProduct.price, new: price };
      }
    }
    if (typeof priceVip !== "undefined") {
      updatePayload.priceVip = priceVip;
      if (currentProduct.priceVip !== priceVip) {
        changes["priceVip"] = { old: currentProduct.priceVip, new: priceVip };
      }
    }
    if (typeof costPrice !== "undefined") {
      updatePayload.costPrice = costPrice;
      if (currentProduct.costPrice !== costPrice) {
        changes["costPrice"] = { old: currentProduct.costPrice, new: costPrice };
      }
    }
    if (typeof priceWalkin !== "undefined") {
      updatePayload.priceWalkin = priceWalkin;
      if (currentProduct.priceWalkin !== priceWalkin) {
        changes["priceWalkin"] = { old: currentProduct.priceWalkin, new: priceWalkin };
      }
    }
    if (typeof stock !== "undefined") {
      updatePayload.stock = stock;
      if (currentProduct.stock !== stock) {
        changes["stock"] = { old: currentProduct.stock, new: stock };
      }
    }
    if (typeof categoryId !== "undefined" || typeof newCategoryName !== "undefined") {
      let finalCategoryId = categoryId;
      if (newCategoryName && newCategoryName.trim() !== '') {
        const siteId = getSiteId();
        const newCat = await createCategory(
          newCategoryName.trim(),
          null,
          null,
          0,
          true,
          siteId,
          true
        );
        finalCategoryId = newCat.id;
      }
      
      updatePayload.categoryId = finalCategoryId;
      if (currentProduct.categoryId !== finalCategoryId) {
        changes["categoryId"] = { old: currentProduct.categoryId, new: finalCategoryId ?? null };
      }
    }
    if (typeof accountEmail !== "undefined") {
      updatePayload.accountEmail = accountEmail;
      if (currentProduct.accountEmail !== accountEmail) {
        changes["accountEmail"] = {
          old: currentProduct.accountEmail ? "[redacted]" : null,
          new: accountEmail ? "[redacted]" : null,
        };
      }
    }
    if (typeof accountPassword !== "undefined") {
      updatePayload.accountPassword = accountPassword;
      if (currentProduct.accountPassword !== accountPassword) {
        changes["accountPassword"] = {
          old: currentProduct.accountPassword ? "[redacted]" : null,
          new: accountPassword ? "[redacted]" : null,
        };
      }
    }
    if (typeof accountData !== "undefined") {
      // แปลง accountData ให้ details เป็น required (default เป็น empty string)
      updatePayload.accountData = accountData 
        ? accountData.map(acc => ({
            email: acc.email,
            password: acc.password,
            details: acc.details || "",
          }))
        : null;
      // Note: Deep comparison for accountData changes is complex, simplified for now.
      if (JSON.stringify(currentProduct.accountData) !== JSON.stringify(updatePayload.accountData)) {
        changes["accountData"] = { 
          old: currentProduct.accountData ? `${currentProduct.accountData.length} บัญชี` : "ไม่มี", 
          new: updatePayload.accountData ? `${updatePayload.accountData.length} บัญชี` : "ไม่มี" 
        };
      }
    }
    if (typeof isPublished !== "undefined") {
      updatePayload.isPublished = isPublished;
      if (currentProduct.isPublished !== isPublished) {
        changes["is_published"] = { 
          old: currentProduct.isPublished ? "true" : "false", 
          new: isPublished ? "true" : "false" 
        };
      }
    }
    if (typeof badge !== "undefined") {
      updatePayload.badge = badge;
      if (currentProduct.badge !== badge) {
        changes["badge"] = { old: currentProduct.badge ?? "ไม่มี", new: badge ?? "ไม่มี" };
      }
    }

    if (Object.keys(updatePayload).length > 0) {
      // Reuse the product row selected under the current site's visibility
      // scope. The repository then carries this trusted id through its final
      // scoped UPDATE instead of reopening by typeId alone.
      await updateProduct(typeId, updatePayload, false, currentProduct.id);
    }

    await recordAdminAuditEvent({
      actor: me,
      action: "PRODUCT_UPDATE",
      category: "catalog",
      severity: Object.keys(changes).some((key) => ["price", "priceVip", "costPrice", "stock", "accountData"].includes(key))
        ? "high"
        : "medium",
      entityType: "product",
      entityId: typeId,
      entityLabel: currentProduct.name,
      before: {
        typeId: currentProduct.typeId,
        name: currentProduct.name,
        price: currentProduct.price,
        priceVip: currentProduct.priceVip,
        costPrice: currentProduct.costPrice,
        priceWalkin: currentProduct.priceWalkin,
        stock: currentProduct.stock,
        categoryId: currentProduct.categoryId,
        isPublished: currentProduct.isPublished,
        badge: currentProduct.badge,
        accountCount: currentProduct.accountData?.length ?? 0,
      },
      after: {
        typeId,
        name: updatePayload.name ?? currentProduct.name,
        price: updatePayload.price ?? currentProduct.price,
        priceVip: updatePayload.priceVip ?? currentProduct.priceVip,
        costPrice: updatePayload.costPrice ?? currentProduct.costPrice,
        priceWalkin: updatePayload.priceWalkin ?? currentProduct.priceWalkin,
        stock: updatePayload.stock ?? currentProduct.stock,
        categoryId: updatePayload.categoryId ?? currentProduct.categoryId,
        isPublished: updatePayload.isPublished ?? currentProduct.isPublished,
        badge: updatePayload.badge ?? currentProduct.badge,
        accountCount: updatePayload.accountData?.length ?? currentProduct.accountData?.length ?? 0,
      },
      changes,
      details: "Updated a product with account contents excluded from audit storage",
      ...getAdminAuditRequestContext(request),
    });

    // Send audit webhook
    await sendAdminAuditWebhook({
      action: "อัปเดตสินค้า",
      target: `Product: ${currentProduct.name} (${typeId})`,
      changes: Object.keys(changes).length > 0 ? changes : undefined,
    });

    const previousStock = currentProduct.stock ?? 0;
    const newStock = updatePayload.accountData !== undefined
      ? (updatePayload.accountData ? updatePayload.accountData.length : 0)
      : (updatePayload.stock !== undefined && updatePayload.stock !== null ? updatePayload.stock : previousStock);

    if (newStock > previousStock) {
      const addedCount = newStock - previousStock;
      try {
        await sendRestockAlertEmail({
          productName: updatePayload.name ?? currentProduct.name,
          amount: addedCount,
          previousStock,
          remainingStock: newStock,
          actorName: (me as any).displayName || (me as any).username || "Admin",
          actorEmail: me.email || "",
          note: updatePayload.accountData !== undefined
            ? "อัปเดตสต็อกบัญชีสินค้า (Product Edit Account Data)"
            : "อัปเดตจำนวนสต็อกสินค้าโดยตรง (Product Edit Stock)",
        });
      } catch (emailErr) {
        console.error("[Restock Email Error]:", emailErr);
      }

      try {
        await triggerMimiAutoPilot({
          productName: updatePayload.name ?? currentProduct.name,
          amount: addedCount,
          previousStock,
          remainingStock: newStock,
          actorName: (me as any).displayName || (me as any).username || "Admin",
        });
      } catch (mimiErr) {
        console.error("[Mimi Auto-Pilot Error]:", mimiErr);
      }
    }

    revalidatePath("/");
    revalidatePath("/api/products");
    (revalidateTag as any)("products");
    (revalidateTag as any)("categories");

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "อัปเดตข้อมูลไม่สำเร็จ";
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
    const { searchParams } = new URL(request.url);
    const typeId = searchParams.get("typeId");

    if (!typeId) {
      return NextResponse.json({ message: "กรุณาระบุ typeId ของสินค้า" }, { status: 422 });
    }

    // Get product for audit
    const product = await findProductByTypeId(typeId);
    if (!product) {
      return NextResponse.json({ message: "ไม่พบสินค้า" }, { status: 404 });
    }

    // Delete only the exact row selected under the current site's visibility
    // scope; shared/global products must not make another local row eligible.
    await deleteProduct(typeId, product.id);

    await recordAdminAuditEvent({
      actor: me,
      action: "PRODUCT_DELETE",
      category: "catalog",
      severity: "critical",
      entityType: "product",
      entityId: product.typeId,
      entityLabel: product.name,
      before: {
        typeId: product.typeId,
        name: product.name,
        stock: product.stock,
        categoryId: product.categoryId,
        isPublished: product.isPublished,
        accountCount: product.accountData?.length ?? 0,
      },
      details: "Deleted a product; account contents were not copied into the audit log",
      ...getAdminAuditRequestContext(request),
    });

    // Send audit webhook
    await sendAdminAuditWebhook({
      action: "ลบสินค้า",
      target: `Product: ${product.name} (${typeId})`,
      details: `ลบสินค้า "${product.name}" สำเร็จ`,
    });

    revalidatePath("/");
    revalidatePath("/api/products");
    (revalidateTag as any)("products");
    (revalidateTag as any)("categories");

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถลบสินค้าได้";
    return NextResponse.json({ message }, { status: 500 });
  }
}

