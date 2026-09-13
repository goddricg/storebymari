/**
 * LINE Flex Message Templates for App By Mari & Mimi AI Operator
 */

export function buildStockConfirmFlex(params: {
  batchId: string;
  productId: string;
  productName: string;
  accountCount: number;
  currentStock: number;
  newStock: number;
  previewAccounts: string[];
  previewDeliveryText?: string;
  duplicateCount?: number;
  stockDeliveryTypeLabel?: string;
}) {
  return {
    type: "flex",
    altText: `📦 มิมิตรวจพบ ${params.accountCount} บัญชี สำหรับ ${params.productName} กดยืนยันเพื่อเติมสต็อก`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1F1535",
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: "MIMI STOCK OPERATOR",
            weight: "bold",
            color: "#D8B4FE",
            size: "xs",
          },
          {
            type: "text",
            text: "📦 ยืนยันการเติมสต็อกสินค้า",
            weight: "bold",
            color: "#FFFFFF",
            size: "md",
            margin: "xs",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        spacing: "md",
        contents: [
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#F9F5FF",
            cornerRadius: "8px",
            paddingAll: "12px",
            contents: [
              {
                type: "text",
                text: params.productName,
                weight: "bold",
                size: "sm",
                color: "#4C1D95",
                wrap: true,
              },
              ...(params.stockDeliveryTypeLabel
                ? [
                    {
                      type: "text" as const,
                      text: `🏷️ รูปแบบ: ${params.stockDeliveryTypeLabel}`,
                      size: "xxs" as const,
                      color: "#7C3AED",
                      margin: "xs" as const,
                    },
                  ]
                : []),
              {
                type: "box",
                layout: "horizontal",
                margin: "sm",
                contents: [
                  {
                    type: "text",
                    text: "จำนวนที่จะเติม:",
                    size: "xs",
                    color: "#6B7280",
                    flex: 4,
                  },
                  {
                    type: "text",
                    text: `+${params.accountCount} รายการ`,
                    size: "xs",
                    weight: "bold",
                    color: "#059669",
                    flex: 6,
                    align: "end",
                  },
                ],
              },
              {
                type: "box",
                layout: "horizontal",
                margin: "xs",
                contents: [
                  {
                    type: "text",
                    text: "สต็อกเดิม → ใหม่:",
                    size: "xs",
                    color: "#6B7280",
                    flex: 4,
                  },
                  {
                    type: "text",
                    text: `${params.currentStock} → ${params.newStock} ชิ้น`,
                    size: "xs",
                    weight: "bold",
                    color: "#7C3AED",
                    flex: 6,
                    align: "end",
                  },
                ],
              },
            ],
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text:
                  params.duplicateCount && params.duplicateCount > 0
                    ? `⚠️ กรองรายการซ้ำออก ${params.duplicateCount} รายการ`
                    : "🛡️ ตรวจสอบแล้ว: ไม่พบข้อมูลซ้ำ 🟢",
                size: "xxs",
                color:
                  params.duplicateCount && params.duplicateCount > 0
                    ? "#D97706"
                    : "#059669",
                weight: "bold",
              },
            ],
          },
          ...(params.previewDeliveryText
            ? [
                {
                  type: "text" as const,
                  text: "👁️ ตัวอย่างข้อความส่งมอบจริง (ลูกค้าจะได้รับ):",
                  size: "xxs" as const,
                  color: "#9CA3AF",
                  margin: "xs" as const,
                  weight: "bold" as const,
                },
                {
                  type: "box" as const,
                  layout: "vertical" as const,
                  backgroundColor: "#FFF8F5",
                  cornerRadius: "6px",
                  paddingAll: "8px",
                  borderColor: "#FED7AA",
                  borderWidth: "1px",
                  contents: [
                    {
                      type: "text" as const,
                      text:
                        params.previewDeliveryText.length > 320
                          ? params.previewDeliveryText.substring(0, 315) + "..."
                          : params.previewDeliveryText,
                      size: "xxs" as const,
                      color: "#7C2D12",
                      wrap: true,
                    },
                  ],
                },
              ]
            : []),
          {
            type: "text",
            text: `รายการบัญชี (${Math.min(3, params.previewAccounts.length)}/${params.accountCount} รายการ):`,
            size: "xxs",
            color: "#9CA3AF",
            margin: "xs",
          },
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#F3F4F6",
            cornerRadius: "6px",
            paddingAll: "8px",
            spacing: "xs",
            contents: params.previewAccounts.slice(0, 3).map((acc) => ({
              type: "text" as const,
              text: acc.length > 38 ? acc.substring(0, 35) + "..." : acc,
              size: "xxs" as const,
              color: "#374151",
              wrap: false,
            })),
          },
        ],
      },
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        paddingAll: "14px",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#7C3AED",
            height: "sm",
            action: {
              type: "postback",
              label: "✅ ยืนยันเติมสต็อก",
              data: `action=confirm_stock_fill&batchId=${encodeURIComponent(params.batchId)}`,
              displayText: `ยืนยันเติมสต็อก ${params.productName} จำนวน ${params.accountCount} ชิ้น`,
            },
          },
          {
            type: "button",
            style: "secondary",
            color: "#F3F4F6",
            height: "sm",
            action: {
              type: "postback",
              label: "❌ ยกเลิก",
              data: `action=cancel_stock_fill&batchId=${encodeURIComponent(params.batchId)}`,
              displayText: "ยกเลิกการเติมสต็อกรอบนี้",
            },
          },
        ],
      },
    },
  };
}

export function buildStockSuccessFlex(params: {
  productName: string;
  addedCount: number;
  newStock: number;
  actorName: string;
}) {
  return {
    type: "flex",
    altText: `✅ เติมสต็อก ${params.productName} +${params.addedCount} ชิ้น สำเร็จแล้ว!`,
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: "🎉 เติมสต็อกสำเร็จแล้วค่ะ!",
            weight: "bold",
            color: "#059669",
            size: "md",
          },
          {
            type: "text",
            text: params.productName,
            weight: "bold",
            color: "#1F2937",
            size: "sm",
            margin: "sm",
            wrap: true,
          },
          {
            type: "separator",
            margin: "md",
          },
          {
            type: "box",
            layout: "horizontal",
            margin: "md",
            contents: [
              { type: "text", text: "เพิ่มเข้า:", size: "xs", color: "#6B7280" },
              { type: "text", text: `+${params.addedCount} ชิ้น`, size: "xs", weight: "bold", color: "#059669", align: "end" },
            ],
          },
          {
            type: "box",
            layout: "horizontal",
            margin: "xs",
            contents: [
              { type: "text", text: "สต็อกพร้อมส่งตอนนี้:", size: "xs", color: "#6B7280" },
              { type: "text", text: `${params.newStock} ชิ้น`, size: "xs", weight: "bold", color: "#7C3AED", align: "end" },
            ],
          },
          {
            type: "box",
            layout: "horizontal",
            margin: "xs",
            contents: [
              { type: "text", text: "ผู้ทำรายการ:", size: "xs", color: "#6B7280" },
              { type: "text", text: params.actorName, size: "xs", color: "#374151", align: "end" },
            ],
          },
          {
            type: "text",
            text: "✨ ระบบสั่งส่ง Web Push แจ้งลูกค้าหน้าร้านเรียบร้อยแล้วค่ะ!",
            size: "xxs",
            color: "#9333EA",
            margin: "md",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "10px",
        contents: [
          {
            type: "button",
            style: "link",
            height: "sm",
            action: {
              type: "uri",
              label: "เปิดดูหน้าจัดการสต็อกในเว็บ",
              uri: "https://storebymari.com/admin?menu=products",
            },
          },
        ],
      },
    },
  };
}

export function buildStockSummaryFlex(
  products: Array<{ name: string; stock: number; price: string | number }>
) {
  // กรองเฉพาะสินค้าที่มีสต็อกพร้อมส่งก่อน
  const inStock = products.filter((p) => p.stock > 0);
  const totalInStock = inStock.length;
  const totalUnits = inStock.reduce((acc, curr) => acc + curr.stock, 0);

  // กรณีไม่มีสินค้าพร้อมส่งเลย
  if (inStock.length === 0) {
    return {
      type: "flex",
      altText: "📊 สถานะสต็อกสินค้า App By Mari",
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#2E1065",
          paddingAll: "16px",
          contents: [
            {
              type: "text",
              text: "APP BY MARI INVENTORY",
              weight: "bold",
              color: "#E9D5FF",
              size: "xxs",
            },
            {
              type: "text",
              text: "🔴 สถานะสต็อกสินค้าพร้อมส่ง",
              weight: "bold",
              color: "#FFFFFF",
              size: "md",
            },
          ],
        },
        body: {
          type: "box",
          layout: "vertical",
          paddingAll: "16px",
          contents: [
            {
              type: "text",
              text: "ขณะนี้ยังไม่มีสินค้าพร้อมส่งในระบบ กรุณาเติมสต็อกหรือตรวจสอบที่หน้าเว็บไซต์ค่ะ",
              size: "sm",
              color: "#6B7280",
              wrap: true,
            },
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          paddingAll: "12px",
          contents: [
            {
              type: "button",
              style: "primary",
              color: "#7C3AED",
              height: "sm",
              action: {
                type: "uri",
                label: "🌐 ตรวจสอบหน้าเว็บไซต์",
                uri: "https://storebymari.com",
              },
            },
          ],
        },
      },
    };
  }

  // แบ่งหน้าละ 8 รายการ
  const pageSize = 8;
  const totalPages = Math.min(10, Math.ceil(inStock.length / pageSize));
  const displayItems = inStock.slice(0, totalPages * pageSize);

  const bubbles = [];
  for (let i = 0; i < totalPages; i++) {
    const pageItems = displayItems.slice(i * pageSize, (i + 1) * pageSize);
    const isLastPage = i === totalPages - 1;

    bubbles.push({
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#2E1065",
        paddingAll: "14px",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: "APP BY MARI INVENTORY",
                weight: "bold",
                color: "#E9D5FF",
                size: "xxs",
                flex: 7,
              },
              {
                type: "text",
                text: totalPages > 1 ? `หน้า ${i + 1}/${totalPages}` : "สรุปสด",
                weight: "bold",
                color: "#A78BFA",
                size: "xxs",
                align: "end",
                flex: 3,
              },
            ],
          },
          {
            type: "text",
            text: "🟢 สินค้าพร้อมส่ง (Realtime)",
            weight: "bold",
            color: "#FFFFFF",
            size: "md",
            margin: "xs",
          },
          {
            type: "text",
            text: `พร้อมส่ง ${totalInStock} รายการ (รวม ${totalUnits.toLocaleString()} ชิ้น)`,
            size: "xxs",
            color: "#DDD6FE",
            margin: "xs",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        spacing: "sm",
        contents: pageItems.map((p) => {
          const priceDisplay = typeof p.price === "number" ? `฿${p.price}` : String(p.price);
          return {
            type: "box",
            layout: "horizontal",
            alignItems: "center",
            contents: [
              {
                type: "box",
                layout: "vertical",
                flex: 7,
                contents: [
                  {
                    type: "text",
                    text: p.name,
                    size: "xs",
                    color: "#1F2937",
                    weight: "bold",
                    wrap: true,
                    maxLines: 2,
                  },
                  {
                    type: "text",
                    text: priceDisplay,
                    size: "xxs",
                    color: "#7C3AED",
                  },
                ],
              },
              {
                type: "box",
                layout: "vertical",
                flex: 3,
                alignItems: "flex-end",
                contents: [
                  {
                    type: "text",
                    text: `${p.stock} ชิ้น`,
                    size: "xs",
                    weight: "bold",
                    color: "#059669",
                    align: "end",
                  },
                ],
              },
            ],
          };
        }),
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "10px",
        spacing: "xs",
        contents: [
          ...(isLastPage
            ? [
                {
                  type: "button",
                  style: "primary",
                  color: "#7C3AED",
                  height: "sm",
                  action: {
                    type: "uri",
                    label: "🌐 เช็กสต็อกสดบนเว็บไซต์",
                    uri: "https://storebymari.com",
                  },
                },
              ]
            : [
                {
                  type: "text",
                  text: `👉 ปัดไปทางซ้ายเพื่อดูรายการถัดไป (${i + 1}/${totalPages})`,
                  size: "xxs",
                  color: "#6B7280",
                  align: "center",
                },
              ]),
        ],
      },
    });
  }

  return {
    type: "flex",
    altText: `📊 สรุปสถานะสต็อกพร้อมส่ง ${totalInStock} รายการ - App By Mari`,
    contents:
      bubbles.length === 1
        ? bubbles[0]
        : {
            type: "carousel",
            contents: bubbles,
          },
  };
}

export function buildHelpFlex() {
  return {
    type: "flex",
    altText: "🐰 คำแนะนำวิธีใช้งานมิมิในกลุ่ม LINE",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1F1535",
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: "MIMI AI ASSISTANT",
            weight: "bold",
            color: "#D8B4FE",
            size: "xs",
          },
          {
            type: "text",
            text: "🐰 วิธีสั่งงานมิมิในกลุ่ม LINE",
            weight: "bold",
            color: "#FFFFFF",
            size: "md",
            margin: "xs",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        spacing: "md",
        contents: [
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#FEF2F2",
            cornerRadius: "8px",
            paddingAll: "12px",
            contents: [
              {
                type: "text",
                text: "🎛️ 1. สวิตช์ปิด/เปิดมิมิ & พักการตอบ (Master Control)",
                weight: "bold",
                size: "xs",
                color: "#DC2626",
              },
              {
                type: "text",
                text: "พิมพ์ @มิมิ แผงควบคุม เพื่อกดปุ่มสวิตช์ หรือพิมพ์:\n• @มิมิ หยุดตอบ (หรือ @มิมิ พักมิมิ 1 ชม.)\n• @มิมิ เปิดระบบ (เพื่อให้มิมิกลับมาตอบ)\n• @มิมิ รับเคส [ชื่อ] (พักเฉพาะลูกค้าคนนี้ 30 นาที)",
                size: "xxs",
                color: "#4B5563",
                wrap: true,
                margin: "xs",
              },
            ],
          },
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#F9F5FF",
            cornerRadius: "8px",
            paddingAll: "12px",
            contents: [
              {
                type: "text",
                text: "📦 2. เติมสต็อกอัตโนมัติ (ใส่ Account)",
                weight: "bold",
                size: "xs",
                color: "#6D28D9",
              },
              {
                type: "text",
                text: "พิมพ์ @มิมิ เติมสต็อก [ชื่อสินค้า] แล้ววางรายการ เช่น:\nuser1@gmail.com:pass1\nuser2@gmail.com:pass2",
                size: "xxs",
                color: "#4B5563",
                wrap: true,
                margin: "xs",
              },
            ],
          },
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#F0FDF4",
            cornerRadius: "8px",
            paddingAll: "12px",
            contents: [
              {
                type: "text",
                text: "📊 3. เช็กสต็อก & ข้อมูลร้าน",
                weight: "bold",
                size: "xs",
                color: "#15803D",
              },
              {
                type: "text",
                text: "พิมพ์ @มิมิ เช็กสต็อก หรือ @มิมิ วันนี้ขายไปกี่ออเดอร์แล้ว อะไรบ้าง หรือ @มิมิ ดูเคส เพื่อดูสถานะงาน",
                size: "xxs",
                color: "#4B5563",
                wrap: true,
                margin: "xs",
              },
            ],
          },
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#FEF3C7",
            cornerRadius: "8px",
            paddingAll: "12px",
            contents: [
              {
                type: "text",
                text: "🧠 4. สอนงาน & บันทึกคู่มือให้มิมิ",
                weight: "bold",
                size: "xs",
                color: "#B45309",
              },
              {
                type: "text",
                text: "พิมพ์ @มิมิ จำไว้นะ [สถานการณ์] ให้ตอบว่า [คำตอบ] หรือพิมพ์ @มิมิ ดูคู่มือ เพื่อดูทั้งหมด",
                size: "xxs",
                color: "#4B5563",
                wrap: true,
                margin: "xs",
              },
            ],
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "10px",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#7C3AED",
            height: "sm",
            action: {
              type: "postback",
              label: "🎛️ เปิดแผงควบคุมสวิตช์มิมิ",
              data: "action=show_control_panel",
            },
          },
        ],
      },
    },
  };
}

export function buildCustomerCatalogFlex(
  products: Array<{ name: string; stock: number; price: number }>
) {
  const inStock = products.filter((p) => p.price > 0 && p.stock > 0);
  const totalInStock = inStock.length;

  if (inStock.length === 0) {
    return {
      type: "flex",
      altText: "🍿 รายการสินค้าและราคาพร้อมส่ง - App By Mari",
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#1F1535",
          paddingAll: "16px",
          contents: [
            {
              type: "text",
              text: "APP BY MARI • PREMIUM STORE",
              weight: "bold",
              color: "#D8B4FE",
              size: "xxs",
            },
            {
              type: "text",
              text: "🍿 รายการสินค้าและราคาพร้อมส่ง",
              weight: "bold",
              color: "#FFFFFF",
              size: "md",
              margin: "xs",
            },
          ],
        },
        body: {
          type: "box",
          layout: "vertical",
          paddingAll: "16px",
          contents: [
            {
              type: "text",
              text: "ขออภัยด้วยนะคะ ขณะนี้สินค้าพร้อมส่งหมดชั่วคราว สามารถสอบถามแอดมินหรือรอเติมสต็อกใหม่ได้เลยค่า 🐰✨",
              size: "sm",
              color: "#6B7280",
              wrap: true,
            },
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          paddingAll: "12px",
          contents: [
            {
              type: "button",
              style: "primary",
              color: "#7C3AED",
              height: "sm",
              action: {
                type: "uri",
                label: "🛒 ดูสินค้าบนเว็บไซต์",
                uri: "https://storebymari.com",
              },
            },
          ],
        },
      },
    };
  }

  // 6 รายการต่อ bubble เพื่อความสวยงาม โปร่งสบายตา
  const pageSize = 6;
  const totalPages = Math.min(10, Math.ceil(inStock.length / pageSize));
  const displayItems = inStock.slice(0, totalPages * pageSize);

  const bubbles = [];
  for (let i = 0; i < totalPages; i++) {
    const pageItems = displayItems.slice(i * pageSize, (i + 1) * pageSize);
    const isLastPage = i === totalPages - 1;

    bubbles.push({
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1F1535",
        paddingAll: "14px",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: "APP BY MARI • STORE",
                weight: "bold",
                color: "#D8B4FE",
                size: "xxs",
                flex: 7,
              },
              {
                type: "text",
                text: totalPages > 1 ? `หน้า ${i + 1}/${totalPages}` : "พร้อมส่ง",
                weight: "bold",
                color: "#C4B5FD",
                size: "xxs",
                align: "end",
                flex: 3,
              },
            ],
          },
          {
            type: "text",
            text: "🍿 สินค้าพร้อมส่ง (Realtime)",
            weight: "bold",
            color: "#FFFFFF",
            size: "md",
            margin: "xs",
          },
          {
            type: "text",
            text: `✨ มีให้เลือกซื้อ ${totalInStock} รายการ (ปัดเพื่อดูเพิ่ม ➡️)`,
            size: "xxs",
            color: "#E9D5FF",
            margin: "xs",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        spacing: "md",
        contents: pageItems.map((p) => ({
          type: "box",
          layout: "horizontal",
          alignItems: "center",
          contents: [
            {
              type: "box",
              layout: "vertical",
              flex: 6,
              contents: [
                {
                  type: "text",
                  text: p.name,
                  size: "xs",
                  color: "#1F2937",
                  weight: "bold",
                  wrap: true,
                  maxLines: 2,
                },
              ],
            },
            {
              type: "box",
              layout: "vertical",
              flex: 2,
              alignItems: "flex-end",
              contents: [
                {
                  type: "text",
                  text: `฿${p.price}`,
                  size: "xs",
                  color: "#7C3AED",
                  weight: "bold",
                  align: "end",
                },
              ],
            },
            {
              type: "box",
              layout: "vertical",
              flex: 2,
              alignItems: "flex-end",
              contents: [
                {
                  type: "text",
                  text: `(เหลือ ${p.stock})`,
                  size: "xxs",
                  color: "#059669",
                  weight: "bold",
                  align: "end",
                },
              ],
            },
          ],
        })),
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "10px",
        spacing: "xs",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#7C3AED",
            height: "sm",
            action: {
              type: "uri",
              label: "🛒 สั่งซื้อผ่านเว็บ (รับทันที 24 ชม.)",
              uri: "https://storebymari.com",
            },
          },
          ...(totalPages > 1 && !isLastPage
            ? [
                {
                  type: "text",
                  text: `👉 ปัดซ้ายเพื่อดูหน้า ${i + 2}/${totalPages}`,
                  size: "xxs",
                  color: "#6B7280",
                  align: "center",
                  margin: "xs",
                },
              ]
            : []),
        ],
      },
    });
  }

  return {
    type: "flex",
    altText: `🍿 รายการสินค้าและราคาพร้อมส่ง ${totalInStock} รายการ - App By Mari`,
    contents:
      bubbles.length === 1
        ? bubbles[0]
        : {
            type: "carousel",
            contents: bubbles,
          },
  };
}

export function buildCustomerSupportFlex() {
  return {
    type: "flex",
    altText: "🔧 ศูนย์ช่วยเหลือและแจ้งปัญหาการใช้งาน - App By Mari",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1F1535",
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: "CUSTOMER SUPPORT",
            weight: "bold",
            color: "#D8B4FE",
            size: "xxs",
          },
          {
            type: "text",
            text: "🔧 ศูนย์ช่วยเหลือ & แจ้งปัญหา",
            weight: "bold",
            color: "#FFFFFF",
            size: "md",
            margin: "xs",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "14px",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "พบปัญหาการใช้งาน เช่น จอเต็ม, บัญชีหลุด หรือล็อกอินไม่ผ่าน?",
            size: "xs",
            color: "#374151",
            weight: "bold",
            wrap: true,
          },
          {
            type: "text",
            text: "1. ตรวจสอบชื่อโปรไฟล์/จอของตนเองให้ถูกต้อง\n2. ไม่กดเปลี่ยนรหัสผ่านหรืออีเมลของบัญชี\n3. หากต้องการเคลม/แจ้งซ่อม สามารถกดแจ้งผ่านหน้าเว็บเพื่อรับการดูแลทันที หรือพิมพ์แจ้งเลขออเดอร์ในแชทนี้ได้เลยค่ะ!",
            size: "xxs",
            color: "#6B7280",
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#7C3AED",
            height: "sm",
            action: {
              type: "uri",
              label: "🌐 เปิดหน้าแจ้งปัญหาบนเว็บ",
              uri: "https://storebymari.com/support/report",
            },
          },
        ],
      },
    },
  };
}

export function buildEscalateToAdminFlex() {
  return {
    type: "flex",
    altText: "🙋‍♀️ มิมิประสานงานให้พี่แอดมินรับช่วงต่อแล้วค่า",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1F1535",
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: "MIMI CUSTOMER ESCALATION",
            weight: "bold",
            color: "#D8B4FE",
            size: "xxs",
          },
          {
            type: "text",
            text: "🙋‍♀️ ส่งต่อให้พี่แอดมินรับช่วงต่อแล้วค่า",
            weight: "bold",
            color: "#FFFFFF",
            size: "md",
            margin: "xs",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "14px",
        spacing: "sm",
        contents: [
          {
            type: "text",
            text: "มิมิได้ส่งต่อเคสนี้ให้พี่ๆ แอดมินประจำร้านเรียบร้อยแล้วนะคะ 💕",
            size: "xs",
            color: "#374151",
            weight: "bold",
            wrap: true,
          },
          {
            type: "text",
            text: "รบกวนคุณลูกค้ารอพี่แอดมินสักครู่ หรือพิมพ์เรื่องที่ต้องการให้ช่วย / เลขที่คำสั่งซื้อ ทิ้งไว้ในแชทนี้ได้เลยนะคะ พี่แอดมินจะรีบเข้ามาดูแลให้เร็วที่สุดเยยงับ! 🐰✨",
            size: "xxs",
            color: "#6B7280",
            wrap: true,
            margin: "xs",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#7C3AED",
            height: "sm",
            action: {
              type: "uri",
              label: "🛒 เยี่ยมชมร้านค้า storebymari.com",
              uri: "https://storebymari.com",
            },
          },
        ],
      },
    },
  };
}

export function buildAdminEscalationAlertFlex(params: {
  userId: string;
  userName: string;
  userMessage: string;
  lockedMinutes?: number;
  reason?: string;
}) {
  const safeName = params.userName || "ลูกค้า (ไม่ทราบชื่อ)";
  const snippet = params.userMessage
    ? params.userMessage.substring(0, 100) + (params.userMessage.length > 100 ? "..." : "")
    : "ลูกค้าขอติดต่อแอดมิน";
  const duration = params.lockedMinutes || 30;

  return {
    type: "flex",
    altText: `🚨 มีลูกค้าขอติดต่อแอดมิน: ${safeName}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#4C0519",
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: "🚨 MIMI CASE ESCALATION",
            weight: "bold",
            color: "#FDA4AF",
            size: "xxs",
          },
          {
            type: "text",
            text: "มีลูกค้าขอติดต่อแอดมิน!",
            weight: "bold",
            color: "#FFFFFF",
            size: "md",
            margin: "xs",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "14px",
        spacing: "md",
        contents: [
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#FFF1F2",
            cornerRadius: "8px",
            paddingAll: "10px",
            contents: [
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  {
                    type: "text",
                    text: "👤 ลูกค้า:",
                    size: "xs",
                    color: "#9F1239",
                    weight: "bold",
                    flex: 3,
                  },
                  {
                    type: "text",
                    text: safeName,
                    size: "xs",
                    color: "#111827",
                    weight: "bold",
                    flex: 7,
                    wrap: true,
                  },
                ],
              },
              {
                type: "box",
                layout: "horizontal",
                margin: "xs",
                contents: [
                  {
                    type: "text",
                    text: "💬 ข้อความ:",
                    size: "xs",
                    color: "#9F1239",
                    weight: "bold",
                    flex: 3,
                  },
                  {
                    type: "text",
                    text: snippet,
                    size: "xs",
                    color: "#374151",
                    flex: 7,
                    wrap: true,
                  },
                ],
              },
            ],
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: "สถานะมิมิ:",
                size: "xs",
                color: "#6B7280",
                flex: 4,
              },
              {
                type: "text",
                text: `🛑 พักการตอบ ${duration} นาที`,
                size: "xs",
                color: "#E11D48",
                weight: "bold",
                flex: 6,
                align: "end",
              },
            ],
          },
          {
            type: "text",
            text: "⚠️ มิมิหยุดตอบอัตโนมัติ 30 นาทีแล้ว เพื่อให้พี่แอดมินเข้าไปคุยใน LINE OA ได้ทันทีโดยมิมิไม่แย่งตอบค่ะ (หากคุยเสร็จและไม่มีข้อความเกิน 30 นาที มิมิจะกลับมารับเคสต่ออัตโนมัติ)",
            size: "xxs",
            color: "#6B7280",
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "secondary",
            height: "sm",
            color: "#BE123C",
            action: {
              type: "postback",
              label: "🛑 ต่อเวลาพักมิมิอีก 30 นาที",
              data: `action=lock_chat&userId=${params.userId}&userName=${encodeURIComponent(
                safeName
              )}`,
            },
          },
          {
            type: "button",
            style: "primary",
            height: "sm",
            color: "#059669",
            action: {
              type: "postback",
              label: "🟢 ให้มิมิดูแลต่อทันที",
              data: `action=unlock_chat&userId=${params.userId}&userName=${encodeURIComponent(
                safeName
              )}`,
            },
          },
        ],
      },
    },
  };
}

export function buildActiveCasesFlex(
  cases: Array<{
    userId: string;
    customerName: string;
    remainingMinutes: number;
    reason: string;
    isLocked: boolean;
  }>
) {
  if (cases.length === 0) {
    return {
      type: "flex",
      altText: "📋 รายการเคสลูกค้า 1:1 ทั้งหมด",
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#1F1535",
          paddingAll: "16px",
          contents: [
            {
              type: "text",
              text: "MIMI 1:1 CASES MONITOR",
              weight: "bold",
              color: "#D8B4FE",
              size: "xxs",
            },
            {
              type: "text",
              text: "📋 สถานะเคสลูกค้าปัจจุบัน",
              weight: "bold",
              color: "#FFFFFF",
              size: "md",
              margin: "xs",
            },
          ],
        },
        body: {
          type: "box",
          layout: "vertical",
          paddingAll: "16px",
          contents: [
            {
              type: "text",
              text: "✨ ตอนนี้ไม่มีเคสที่ค้างอยู่หรือถูกพักเลยค่ะ มิมิพร้อมดูแลลูกค้าทุกคนอย่างเต็มที่งับ! 🐰💖",
              size: "xs",
              color: "#4B5563",
              wrap: true,
            },
          ],
        },
      },
    };
  }

  const caseItems = cases.slice(0, 5).map((c) => ({
    type: "box",
    layout: "vertical",
    backgroundColor: c.isLocked ? "#FFF1F2" : "#F0FDF4",
    cornerRadius: "8px",
    paddingAll: "10px",
    margin: "sm",
    contents: [
      {
        type: "box",
        layout: "horizontal",
        contents: [
          {
            type: "text",
            text: c.customerName || "ลูกค้า",
            size: "xs",
            weight: "bold",
            color: "#111827",
            flex: 7,
          },
          {
            type: "text",
            text: c.isLocked ? `🛑 พักอีก ${c.remainingMinutes} นาที` : "🟢 มิมิดูแลอยู่",
            size: "xxs",
            weight: "bold",
            color: c.isLocked ? "#E11D48" : "#059669",
            flex: 5,
            align: "end",
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        margin: "sm",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: c.isLocked ? "primary" : "secondary",
            height: "sm",
            color: c.isLocked ? "#059669" : "#E11D48",
            action: {
              type: "postback",
              label: c.isLocked ? "🟢 ปลดล็อกให้มิมิ" : "🛑 พักมิมิ 30 นาที",
              data: c.isLocked
                ? `action=unlock_chat&userId=${c.userId}&userName=${encodeURIComponent(
                    c.customerName
                  )}`
                : `action=lock_chat&userId=${c.userId}&userName=${encodeURIComponent(
                    c.customerName
                  )}`,
            },
          },
        ],
      },
    ],
  }));

  return {
    type: "flex",
    altText: "📋 รายการเคสลูกค้า 1:1 ทั้งหมด",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1F1535",
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: "MIMI 1:1 CASES MONITOR",
            weight: "bold",
            color: "#D8B4FE",
            size: "xxs",
          },
          {
            type: "text",
            text: "📋 สถานะเคสลูกค้า 1:1 ปัจจุบัน",
            weight: "bold",
            color: "#FFFFFF",
            size: "md",
            margin: "xs",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "14px",
        contents: caseItems,
      },
    },
  };
}

/**
 * Build Control Panel Flex Card for Mimi (Global Master Switch)
 */
export function buildMimiControlPanelFlex(params: {
  isPaused: boolean;
  pausedBy?: string;
  remainingMinutes?: number;
  activeCasesCount: number;
}) {
  const isPaused = params.isPaused;

  return {
    type: "flex",
    altText: `🎛️ แผงควบคุมระบบมิมิ (สถานะ: ${isPaused ? "🛑 หยุดทำงานชั่วคราว" : "🟢 ทำงานปกติ 24 ชม."})`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1F1535",
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: "MIMI AI COMMAND CENTER",
            weight: "bold",
            color: "#D8B4FE",
            size: "xxs",
          },
          {
            type: "text",
            text: "🎛️ แผงควบคุมระบบมิมิ (LINE OA)",
            weight: "bold",
            color: "#FFFFFF",
            size: "md",
            margin: "xs",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        spacing: "md",
        contents: [
          // Status Box
          {
            type: "box",
            layout: "vertical",
            backgroundColor: isPaused ? "#FEF2F2" : "#F0FDF4",
            borderColor: isPaused ? "#F87171" : "#4ADE80",
            borderWidth: "1px",
            cornerRadius: "8px",
            paddingAll: "12px",
            contents: [
              {
                type: "text",
                text: isPaused
                  ? "🛑 สถานะ: หยุดตอบชั่วคราว (Paused)"
                  : "🟢 สถานะ: กำลังตอบลูกค้าอัตโนมัติ (Active)",
                weight: "bold",
                size: "sm",
                color: isPaused ? "#DC2626" : "#16A34A",
              },
              {
                type: "text",
                text: isPaused
                  ? `สั่งพักโดย: ${params.pausedBy || "แอดมิน"} ${
                      params.remainingMinutes && params.remainingMinutes > 0
                        ? `(เหลืออีก ~${params.remainingMinutes} นาที)`
                        : "(ไม่มีกำหนดเวลา จนกว่าจะสั่งเปิด)"
                    }`
                  : "มิมิพร้อมตอบแชทและตรวจภาพสลิป/หน้าจอลูกค้าใน LINE OA ทันที 24 ชม.",
                size: "xxs",
                color: "#4B5563",
                wrap: true,
                margin: "xs",
              },
            ],
          },
          // Cases summary
          {
            type: "box",
            layout: "horizontal",
            alignItems: "center",
            contents: [
              {
                type: "text",
                text: "👤 ลูกค้าที่แอดมินคนกำลังคุยอยู่:",
                size: "xs",
                color: "#4B5563",
                flex: 7,
              },
              {
                type: "text",
                text: `${params.activeCasesCount} เคส`,
                size: "xs",
                weight: "bold",
                color: "#7C3AED",
                align: "end",
                flex: 3,
              },
            ],
          },
          // Action Buttons
          ...(isPaused
            ? [
                {
                  type: "button",
                  style: "primary",
                  color: "#16A34A",
                  height: "sm",
                  action: {
                    type: "postback",
                    label: "🟢 เปิดระบบให้มิมิลุยต่อ (Resume)",
                    data: "action=mimi_global_resume",
                  },
                },
                {
                  type: "box",
                  layout: "horizontal",
                  spacing: "sm",
                  contents: [
                    {
                      type: "button",
                      style: "secondary",
                      height: "sm",
                      flex: 1,
                      action: {
                        type: "postback",
                        label: "⏱️ พักต่อ 1 ชม.",
                        data: "action=mimi_global_pause&duration=60",
                      },
                    },
                    {
                      type: "button",
                      style: "secondary",
                      height: "sm",
                      flex: 1,
                      action: {
                        type: "postback",
                        label: "⏱️ พักต่อ 2 ชม.",
                        data: "action=mimi_global_pause&duration=120",
                      },
                    },
                  ],
                },
              ]
            : [
                {
                  type: "button",
                  style: "primary",
                  color: "#DC2626",
                  height: "sm",
                  action: {
                    type: "postback",
                    label: "🛑 ปิดมิมิทั้งร้าน (Emergency Mute)",
                    data: "action=mimi_global_pause&duration=0",
                  },
                },
                {
                  type: "box",
                  layout: "horizontal",
                  spacing: "sm",
                  contents: [
                    {
                      type: "button",
                      style: "secondary",
                      height: "sm",
                      flex: 1,
                      action: {
                        type: "postback",
                        label: "⏱️ พักมิมิ 1 ชม.",
                        data: "action=mimi_global_pause&duration=60",
                      },
                    },
                    {
                      type: "button",
                      style: "secondary",
                      height: "sm",
                      flex: 1,
                      action: {
                        type: "postback",
                        label: "⏱️ พักมิมิ 2 ชม.",
                        data: "action=mimi_global_pause&duration=120",
                      },
                    },
                  ],
                },
              ]),
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "10px",
        contents: [
          {
            type: "button",
            style: "link",
            height: "sm",
            color: "#6D28D9",
            action: {
              type: "postback",
              label: "📋 ดูรายการเคสที่แอดมินคุยอยู่",
              data: "action=view_active_cases",
            },
          },
          ...(params.activeCasesCount > 0
            ? [
                {
                  type: "button",
                  style: "secondary",
                  height: "sm",
                  color: "#E9D5FF",
                  margin: "xs",
                  action: {
                    type: "postback",
                    label: `👑 ปลดล็อกทุกเคส (${params.activeCasesCount} เคส)`,
                    data: "action=unlock_all_cases",
                  },
                },
              ]
            : []),
        ],
      },
    },
  };
}
