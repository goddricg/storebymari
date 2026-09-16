import { NextRequest, NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/server";
import { buyExternalProduct, fetchExternalOrderHistory } from "@/lib/products/external";
import { recordExternalOrder } from "@/lib/orders/repository";
import { findProductByTypeId, updateProduct } from "@/lib/products/repository";
import { findUserById, setUserPoints } from "@/lib/auth/user";
import { isAdminRole } from "@/lib/auth/roles";
import { getApiProviderById } from "@/lib/api-providers/repository";
import { getSettingValue } from "@/lib/settings/repository";
import {
  sendDiscordWebhook,
  createPurchaseEmbed,
} from "@/lib/discord/webhook";
import { getSiteId } from "@/lib/site";
import pool from "@/lib/mysql";
import { randomUUID } from "crypto";
import { createCompletedCaseFromOrderIds } from "@/lib/purchase-cases/repository";
import { createUserNotification } from "@/lib/notifications/repository";
import { dispatchNotificationToUser } from "@/lib/push/dispatch";
import {
  claimStorefrontBundlePurchase,
  createStorefrontBundleFingerprint,
  executeStorefrontBundlePurchase,
  waitForStorefrontBundlePurchase,
  type StorefrontBundlePayload,
} from "@/lib/purchases/storefront-bundle";
import {
  attachAppByMariCase,
  executeAppByMariStorefrontPurchase,
} from "@/lib/appbymari/purchase";
import { parseAppByMariStorefrontTypeId } from "@/lib/appbymari/types";

const bodySchema = z.object({
  typeId: z.string().min(1, "กรุณาระบุรหัสสินค้า"),
  quantity: z.number().int().min(1).max(100).optional().default(1),
  username: z.string().optional(),
  giftTypeId: z.string().optional(),
  purchaseOptionId: z.string().trim().min(1).max(128).optional(),
});

async function attachCompletedCase(orderIds: string[], buyerUserId: string) {
  if (orderIds.length === 0) return null;
  try {
    return await createCompletedCaseFromOrderIds({ buyerUserId, orderIds });
  } catch (error) {
    // The purchase has already completed in this legacy path. Do not turn a
    // successful delivery into a retryable 5xx response, which could charge a
    // buyer twice. The backfill utility can repair a missing case later.
    console.error("Failed to attach completed purchase case:", error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  const user = await requireUser();

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json(
      {
        ok: false,
        message: "รูปแบบข้อมูลไม่ถูกต้อง",
      },
      { status: 415 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "ไม่สามารถอ่านข้อมูลจากคำขอได้",
      },
      { status: 400 }
    );
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        message: "ข้อมูลไม่ถูกต้อง",
        errors: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const { typeId, quantity = 1, username, giftTypeId, purchaseOptionId } = parsed.data;
  const fallbackUsername = username ?? user.displayName ?? user.email;
  
  if (quantity <= 0 || quantity > 100) {
    return NextResponse.json(
      {
        ok: false,
        message: "กรุณาระบุจำนวนสินค้าระหว่าง 1-100 ชิ้น",
      },
      { status: 400 }
    );
  }

  // AppByMari products use a namespaced type id and a dedicated transactional
  // workflow. Their sale price is fixed per product, while the upstream API
  // owns Master Point deduction and delivery.
  if (parseAppByMariStorefrontTypeId(typeId)) {
    if (purchaseOptionId || giftTypeId) {
      return NextResponse.json(
        { ok: false, message: "สินค้าจากร้านหลักไม่รองรับของแถมหรือแพ็กเกจเสริม" },
        { status: 400 },
      );
    }
    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || `appbymari-${randomUUID()}`;
    if (idempotencyKey.length > 128) {
      return NextResponse.json(
        { ok: false, message: "Idempotency-Key must not exceed 128 characters." },
        { status: 400 },
      );
    }
    try {
      const result = await executeAppByMariStorefrontPurchase({
        buyerUserId: user.id,
        typeId,
        quantity,
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
      return NextResponse.json(body, { status: result.status, headers });
    } catch {
      return NextResponse.json(
        { ok: false, message: "ไม่สามารถสั่งซื้อสินค้าจากร้านหลักได้ กรุณาลองใหม่ด้วยคำขอเดิม" },
        { status: 500, headers: { "Idempotency-Key": idempotencyKey } },
      );
    }
  }

  // Bundle purchases use their own transactional path. Legacy one-unit and
  // quantity purchases continue through the existing workflow below.
  if (purchaseOptionId) {
    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || `legacy-${randomUUID()}`;
    if (idempotencyKey.length > 128) {
      return NextResponse.json(
        { ok: false, message: "Idempotency-Key must not exceed 128 characters." },
        { status: 400 }
      );
    }

    const bundlePayload: StorefrontBundlePayload = {
      typeId,
      purchaseOptionId,
      quantity,
      giftTypeId,
    };
    const requestFingerprint = createStorefrontBundleFingerprint(bundlePayload);
    const siteId = getSiteId();

    try {
      const claim = await claimStorefrontBundlePurchase({
        siteId,
        buyerUserId: user.id,
        idempotencyKey,
        requestFingerprint,
        payload: bundlePayload,
      });

      if (claim.kind === "existing") {
        if (claim.decision.kind === "conflict") {
          return NextResponse.json(
            { ok: false, message: "Idempotency key was already used with a different payload." },
            { status: 409 }
          );
        }
        if (claim.decision.kind === "replay") {
          return NextResponse.json(claim.decision.body, {
            status: claim.decision.status,
            headers: { "Idempotency-Replayed": "true", "Idempotency-Key": idempotencyKey },
          });
        }

        const waited = await waitForStorefrontBundlePurchase({
          siteId,
          buyerUserId: user.id,
          idempotencyKey,
          requestFingerprint,
        });
        const headers: HeadersInit = { "Idempotency-Key": idempotencyKey };
        if (waited.replayed) headers["Idempotency-Replayed"] = "true";
        if (waited.status === 202) headers["Retry-After"] = "1";
        return NextResponse.json(waited.body, { status: waited.status, headers });
      }

      const result = await executeStorefrontBundlePurchase({
        requestId: claim.requestId,
        processingToken: claim.processingToken,
        user,
        payload: bundlePayload,
      });
      if (result.status === 200) {
        const body = result.body as {
          orders?: Array<{ id?: string }>;
          order?: { id?: string } | Array<{ id?: string }>;
        };
        const orderIds = (body.orders ?? (Array.isArray(body.order) ? body.order : body.order ? [body.order] : []))
          .map((order) => order.id)
          .filter((id): id is string => Boolean(id));
        const caseOrder = await attachCompletedCase(orderIds, user.id);
        if (caseOrder) {
          result.body = { ...result.body, caseOrder } as unknown as typeof result.body;
        }
      }
      const headers: HeadersInit = { "Idempotency-Key": idempotencyKey };
      if (result.status === 202) headers["Retry-After"] = "1";
      return NextResponse.json(result.body, { status: result.status, headers });
    } catch {
      return NextResponse.json(
        { ok: false, message: "ไม่สามารถประสานงานการซื้อแพ็กเกจได้" },
        { status: 500 }
      );
    }
  }

  try {
    const product = await findProductByTypeId(typeId);
    if (!product || product.price == null) {
      return NextResponse.json(
        {
          ok: false,
          message: "ไม่พบสินค้าหรือยังไม่ได้ตั้งราคาพ้อยท์",
        },
        { status: 400 }
      );
    }

    // ตรวจสอบของแถม (ถ้ามีการตั้งค่าไว้ ต้องเลือก giftTypeId)
    const { listGiftOptionsByBaseProduct, deliverGiftsAndRecord } = await import(
      "@/lib/gifts/repository"
    );
    const activeGiftOptions = await listGiftOptionsByBaseProduct(typeId);
    const allowedGiftTypeIds = new Set(activeGiftOptions.map((o) => o.giftProductTypeId));
    const giftRequired = allowedGiftTypeIds.size > 0;
    if (giftRequired && (!giftTypeId || !allowedGiftTypeIds.has(giftTypeId))) {
      return NextResponse.json(
        {
          ok: false,
          message: "กรุณาเลือกของแถมก่อนสั่งซื้อ",
        },
        { status: 400 }
      );
    }

    const userRecord = await findUserById(user.id);

    if (!userRecord) {
      return NextResponse.json(
        {
          ok: false,
          message: "ไม่พบบัญชีผู้ใช้",
        },
        { status: 401 }
      );
    }

    const currentPoints = Math.max(0, Number(userRecord.points ?? 0));
    
    const isAdmin = isAdminRole(userRecord.role) || userRecord.is_admin;
    
    // ใช้ราคาตาม user tier: vip ใช้ priceVip, walkin ใช้ priceWalkin, normal ใช้ price
    // ถ้าเป็น Admin ให้ใช้ราคาเว็ปหลัก (mainPrice)
    const userTier = (userRecord.user_tier ?? 'walkin') as 'normal' | 'vip' | 'walkin';
    
    let rawSalePrice: number;
    if (isAdmin && product.mainPrice != null) {
      rawSalePrice = Number(product.mainPrice);
    } else if (userTier === 'vip') {
      rawSalePrice = Number(product.priceVip ?? product.price ?? 0);
    } else if (userTier === 'walkin') {
      rawSalePrice = Number(product.priceWalkin ?? product.price ?? 0);
    } else {
      rawSalePrice = Number(product.price ?? 0);
    }
    const unitPrice = Math.max(0, rawSalePrice);
    const totalPrice = unitPrice * quantity;

    if (!Number.isFinite(rawSalePrice) || unitPrice < 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "ราคาพ้อยท์ของสินค้ายังไม่ถูกตั้งค่า",
        },
        { status: 400 }
      );
    }

    if (currentPoints < totalPrice) {
      return NextResponse.json(
        {
          ok: false,
          message: `พ้อยท์ของคุณไม่เพียงพอสำหรับสั่งซื้อสินค้านี้ (ต้องการ ${totalPrice.toLocaleString()} ฿ แต่มี ${currentPoints.toLocaleString()} ฿)`,
        },
        { status: 400 }
      );
    }

    // ตรวจสอบสต็อก
    if (product.stock == null || product.stock < quantity) {
      return NextResponse.json(
        {
          ok: false,
          message: `สินค้านี้มีสต็อกไม่เพียงพอ (ต้องการ ${quantity} ชิ้น แต่มี ${product.stock ?? 0} ชิ้น)`,
        },
        { status: 400 }
      );
    }

    // ตรวจสอบว่าสินค้ามี account_data หรือไม่ (manual product)
    const hasAccountData = product.accountData && Array.isArray(product.accountData) && product.accountData.length >= quantity;
    const hasApiProvider = product.apiProviderId != null;
    const hasAccountEmailPassword = product.accountEmail || product.accountPassword;

    // ตรวจสอบว่ามี account_data เพียงพอหรือไม่ (ถ้าเป็น manual product)
    if (hasAccountData && product.accountData && product.accountData.length < quantity) {
      return NextResponse.json(
        {
          ok: false,
          message: `สินค้านี้มีบัญชีไม่เพียงพอ (ต้องการ ${quantity} บัญชี แต่มี ${product.accountData.length} บัญชี)`,
        },
        { status: 400 }
      );
    }

    const orders: Array<{
      id: string;
      productName: string;
      productDetails: string | null;
      accountEmail: string | null;
      accountPassword: string | null;
      price: number | null;
      purchaseDate: string | null;
    }> = [];
    let accountDataToUse = hasAccountData && product.accountData ? [...product.accountData] : null;

    // ซื้อหลายชิ้นแบบ loop
    for (let i = 0; i < quantity; i++) {
      let orderDetails: {
        uid?: number | null;
        name: string;
        imageapi: string | null;
        textdb: string | null;
        point: number;
        date?: string | null;
      };

      if (hasAccountData && accountDataToUse && accountDataToUse.length > 0) {
        // Manual product: ใช้บัญชีจาก account_data
        const usedAccount = accountDataToUse[0] as { email?: string; password?: string; details?: string };
        // ลบบัญชีที่ใช้แล้วออก
        accountDataToUse = accountDataToUse.slice(1);
        
        const accountDetails = usedAccount.details || 
          (usedAccount.email || usedAccount.password 
            ? `${usedAccount.email ? `Email: ${usedAccount.email}` : ''}\n${usedAccount.password ? `Pass: ${usedAccount.password}` : ''}`.trim()
            : null);
        
        orderDetails = {
          uid: null,
          name: product.name,
          imageapi: product.imageUrl,
          textdb: accountDetails || null,
          point: unitPrice,
          date: new Date().toISOString(),
        };
      } else if (hasAccountEmailPassword) {
        // Manual product: ใช้ account_email และ account_password (แบบเก่า)
        const accountDetails = [
          product.accountEmail ? `Email: ${product.accountEmail}` : '',
          product.accountPassword ? `Pass: ${product.accountPassword}` : '',
          product.details || ''
        ].filter(Boolean).join('\n');
        
        orderDetails = {
          uid: null,
          name: product.name,
          imageapi: product.imageUrl,
          textdb: accountDetails || null,
          point: unitPrice,
          date: new Date().toISOString(),
        };
      } else if (hasApiProvider && product.apiProviderId) {
        // External API product: เรียก external API
        const provider = await getApiProviderById(product.apiProviderId);
        if (!provider || !provider.isActive) {
          return NextResponse.json(
            {
              ok: false,
              message: "API provider ไม่พร้อมใช้งาน",
            },
            { status: 400 }
          );
        }

        const reference = `ORDER_${Date.now()}_${user.id.slice(0, 8)}_${i}`;

        const external = await buyExternalProduct({
          typeId,
          usernameBuy: fallbackUsername,
          provider,
          reference,
        });

        orderDetails = external.data;
        
        if (provider.name === "peamsub24hr" || provider.buyEndpoint?.includes("peamsub24hr.com")) {
          try {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            
            const history = await fetchExternalOrderHistory({
              usernameBuy: fallbackUsername,
              limit: 1,
              provider,
              references: [reference],
            });

            if (history.ok && history.data && history.data.length > 0) {
              const historyItem = history.data[0];
              
              // ตรวจสอบว่า historyItem.details มีข้อมูลครบหรือไม่ (มี password, screen, exp)
              const historyDetails = historyItem.details || "";
              const buyResponseTextdb = external.data.textdb || "";
              
              const historyHasPassword = historyDetails.toLowerCase().includes('pass') || 
                                        historyDetails.toLowerCase().includes('password');
              const historyHasScreen = historyDetails.toLowerCase().includes('screen') || 
                                      historyDetails.toLowerCase().includes('จอ');
              const historyHasExp = historyDetails.toLowerCase().includes('exp') || 
                                    historyDetails.toLowerCase().includes('หมดอายุ');
              
              const buyHasPassword = buyResponseTextdb.toLowerCase().includes('pass') || 
                                    buyResponseTextdb.toLowerCase().includes('password');
              const buyHasScreen = buyResponseTextdb.toLowerCase().includes('screen') || 
                                  buyResponseTextdb.toLowerCase().includes('จอ');
              const buyHasExp = buyResponseTextdb.toLowerCase().includes('exp') || 
                              buyResponseTextdb.toLowerCase().includes('หมดอายุ');
              
              // นับจำนวนข้อมูลที่ครบ (password, screen, exp)
              const historyCompleteness = (historyHasPassword ? 1 : 0) + 
                                         (historyHasScreen ? 1 : 0) + 
                                         (historyHasExp ? 1 : 0);
              const buyCompleteness = (buyHasPassword ? 1 : 0) + 
                                     (buyHasScreen ? 1 : 0) + 
                                     (buyHasExp ? 1 : 0);
              
              // ใช้ข้อมูลที่ครบกว่า (history หรือ buy response)
              let finalTextdb = "";
              if (historyCompleteness > buyCompleteness) {
                // history ครบกว่า
                finalTextdb = historyDetails;
              } else if (buyCompleteness > historyCompleteness) {
                // buy response ครบกว่า
                finalTextdb = buyResponseTextdb;
              } else {
                // ถ้าครบเท่ากัน ให้ใช้ข้อมูลที่ยาวกว่า (น่าจะมีข้อมูลมากกว่า)
                finalTextdb = historyDetails.length > buyResponseTextdb.length 
                  ? historyDetails 
                  : buyResponseTextdb;
              }
              
              // ถ้ายังไม่มีข้อมูล ให้ใช้ historyItem.details หรือ buy response
              if (!finalTextdb || !finalTextdb.trim()) {
                finalTextdb = historyDetails || buyResponseTextdb || "";
              }
              
              orderDetails = {
                uid: external.data.uid,
                name: historyItem.name || external.data.name,
                imageapi: historyItem.image || external.data.imageapi || "",
                textdb: finalTextdb, // ใช้ข้อมูลที่ครบที่สุด
                point: Number(historyItem.price) || external.data.point || 0,
                date: historyItem.date || external.data.date,
              };
            } else {
              // ถ้า fetch history ไม่สำเร็จ ให้ใช้ข้อมูลจาก buy response โดยตรง
              orderDetails = external.data;
            }
          } catch (error) {
            console.warn("Failed to fetch order history, using original data:", error);
            // ถ้าเกิด error ให้ใช้ข้อมูลจาก buy response โดยตรง
            orderDetails = external.data;
          }
        }
      } else {
        return NextResponse.json(
          {
            ok: false,
            message: "สินค้านี้ไม่มีข้อมูลบัญชีหรือ API provider กรุณาติดต่อผู้ดูแลระบบ",
          },
          { status: 400 }
        );
      }

      // สร้าง order
      const order = await recordExternalOrder({
        typeId,
        usernameBuy: fallbackUsername,
        buyerUserId: user.id,
        salePrice: unitPrice,
        buyerEmail: user.email,
        buyerDisplayName: user.displayName,
        apiProviderId: hasApiProvider ? product.apiProviderId : null,
        external: orderDetails,
      });

      orders.push({
        id: order.id,
        productName: order.productName,
        productDetails: order.productDetails,
        accountEmail: order.accountEmail,
        accountPassword: order.accountPassword,
        price: order.price,
        purchaseDate: order.purchaseDate,
      });
    }

    // อัปเดต stock และ account_data (ถ้าเป็น manual product)
    if (hasAccountData && accountDataToUse !== null) {
      await updateProduct(
        typeId,
        {
          accountData: accountDataToUse.map(acc => ({
            email: acc.email,
            password: acc.password,
            details: acc.details || "",
          })),
        },
        true
      );
    } else if (hasAccountEmailPassword && !hasApiProvider) {
      // ถ้าใช้ account_email/account_password แบบเก่า ให้ลด stock
      if (product.stock != null && product.stock > 0) {
        await updateProduct(
          typeId,
          {
            stock: Math.max(0, product.stock - quantity),
          },
          true
        );
      }
    }

    const remainingPoints = currentPoints - totalPrice;
    await setUserPoints(user.id, remainingPoints, user.email, isAdmin);

    // หักเงินจาก Wallet ของแอดมินเว็ปลูกบนเว็บแม่
    const siteId = getSiteId();
    if (siteId !== "main") {
      const childAdminEmail = process.env.NEXT_PUBLIC_CHILD_SITE_MASTER_EMAIL;
      if (childAdminEmail && product.mainPrice != null) {
        const parentCost = product.mainPrice * quantity;
        
        try {
          const [adminRows] = await pool.execute(
            "SELECT id, points FROM users WHERE email = ? AND site_id = 'main' LIMIT 1",
            [childAdminEmail]
          );
          const admins = adminRows as any[];
          if (admins.length > 0) {
            const adminId = admins[0].id;
            const adminPoints = Number(admins[0].points || 0);
            const remainingAdminPoints = adminPoints - parentCost;
            
            await pool.execute(
              "UPDATE users SET points = ? WHERE id = ? AND site_id = 'main'",
              [remainingAdminPoints, adminId]
            );
            
            await pool.execute(
              `INSERT INTO transactions (id, user_id, type, amount, status, details, site_id, created_at, updated_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                randomUUID(),
                adminId,
                'order_deduction',
                parentCost,
                'success',
                `Deducted for child site order (x${quantity}) of ${product.name}`,
                'main',
                new Date(),
                new Date(),
              ]
            );
          }
        } catch (err) {
          console.error("Failed to deduct from parent wallet:", err);
          // อาจจะให้ order ผ่านไปก่อน แต่ log error ไว้
        }
      }
    }

    // จ่ายของแถมหลังสร้าง order สำเร็จ (ตามจำนวนชิ้นที่ซื้อ)
    let gifts:
      | {
          giftProductTypeId: string;
          giftProductName: string;
          giftProductDetails: string | null;
          giftAccountEmail: string | null;
          giftAccountPassword: string | null;
        }[]
      | null = null;
    if (giftRequired && giftTypeId && orders.length > 0) {
      const delivered = await deliverGiftsAndRecord({
        orderIds: orders.map((o) => o.id),
        giftTypeId,
      });
      gifts = delivered.map((g) => ({
        giftProductTypeId: g.giftProductTypeId,
        giftProductName: g.giftProductName,
        giftProductDetails: g.giftProductDetails,
        giftAccountEmail: g.giftAccountEmail,
        giftAccountPassword: g.giftAccountPassword,
      }));
    }

    // Send Discord Webhook (if configured) - ส่งแค่ครั้งเดียวสำหรับการซื้อทั้งหมด
    try {
      const webhookUrl = await getSettingValue("discord_webhook_purchase");
      if (webhookUrl && orders.length > 0) {
        const provider = hasApiProvider ? await getApiProviderById(product.apiProviderId!) : null;
        const embed = createPurchaseEmbed({
          userId: user.id,
          username: user.displayName || user.email || "Unknown",
          email: user.email || "Unknown",
          productName: quantity > 1 ? `${product.name} (${quantity} ชิ้น)` : (product.name || "Unknown"),
          typeId,
          price: totalPrice,
          remainingPoints,
          orderId: orders[0].id,
          apiProvider: provider?.displayName || provider?.name || (hasAccountData ? "Manual" : undefined),
        });

        await sendDiscordWebhook(webhookUrl, {
          embeds: [embed],
        });
      }
    } catch (error) {
      console.error("❌ [Buy Order] Failed to send Discord webhook:", error);
    }

    // ล้าง Cache สต๊อกสินค้าทันทีหลังซื้อสำเร็จ
    (revalidateTag as any)("products");
    revalidatePath("/");
    revalidatePath("/api/products");

    const orderResponse = quantity > 1 ? orders : orders[0];
    const caseOrder = await attachCompletedCase(orders.map((order) => order.id), user.id);

    // บันทึกการแจ้งเตือนในกระดิ่งลูกค้าและส่ง Web Push
    try {
      const prodName = product?.name || "สินค้า";
      const notifTitle = "🎉 สั่งซื้อสินค้าสำเร็จ!";
      const notifMsg = `คุณได้สั่งซื้อ ${prodName} ${quantity > 1 ? `จำนวน ${quantity} ชิ้น` : ""} เรียบร้อยแล้ว`;

      createUserNotification({
        userId: user.id,
        siteId: getSiteId(),
        type: "order_success",
        title: notifTitle,
        message: notifMsg,
        linkUrl: "/dashboard/orders",
        referenceId: orders[0]?.id || null,
      }).catch((err) => console.error("[Buy Order] Failed to record user notification:", err));

      dispatchNotificationToUser({
        userId: user.id,
        title: notifTitle,
        body: `${notifMsg} [คลิกเพื่อดูสินค้า]`,
        url: "/dashboard/orders",
        soundType: "case_resolved",
        tag: `order-${orders[0]?.id || Date.now()}`,
      }).catch((err) => console.error("[Buy Order] Failed to dispatch push notification:", err));
    } catch (e) {
      console.error("[Buy Order] Notification error:", e);
    }

    return NextResponse.json({
      ok: true,
      message: quantity > 1 ? `สั่งซื้อสินค้าสำเร็จ ${quantity} ชิ้น` : "สั่งซื้อสินค้าสำเร็จ",
      order: orderResponse,
      orders: quantity > 1 ? orders : undefined, // ส่ง orders array เมื่อ quantity > 1
      points: remainingPoints,
      quantity: quantity,
      gifts,
      caseOrder,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ไม่สามารถสั่งซื้อสินค้าได้ กรุณาลองใหม่อีกครั้ง";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 502 }
    );
  }
}
