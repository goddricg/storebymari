import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { isAdminUser } from "@/lib/auth/roles";
import { getSiteId } from "@/lib/site";
import pool from "@/lib/mysql";
import type { RowDataPacket } from "mysql2/promise";
import {
  broadcastPushNotification,
  getRecentBroadcasts,
  getRecentRestockAuditEvents,
} from "@/lib/push/broadcast";
import { fetchPublishedProductsPaginatedLive } from "@/lib/products/repository";

export const MCP_SERVER_NAME = "appbymari-mcp";
export const MCP_SERVER_VERSION = "1.0.0";
export const MCP_PROTOCOL_VERSION = "2024-11-05";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, X-Requested-With",
  "Access-Control-Max-Age": "86400",
};

export const MCP_TOOLS = [
  {
    name: "broadcast_push_notification",
    description:
      "Send a live Web Push notification to mobile phones and desktop browsers of Appbymari users/customers. Use this whenever the admin or Mimi wants to notify users about new restocks, promotions, announcements, or discounts.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Notification title (e.g., '🔥 เติมสต็อก Netflix แล้วจ้า!', max 100 chars)",
        },
        body: {
          type: "string",
          description: "Notification body content describing the update or offer (max 2000 chars)",
        },
        url: {
          type: "string",
          description: "Optional destination link when the user taps the notification (e.g., '/products' or '/cart')",
        },
        target: {
          type: "string",
          enum: ["ALL", "ADMIN", "USER"],
          description: "Audience target: ALL (all users), ADMIN (admins only), or USER (customers only). Default is ALL.",
        },
      },
      required: ["title", "body"],
    },
  },
  {
    name: "get_stock_summary",
    description:
      "Check current real-time stock levels, pricing, and availability of products listed on the Appbymari store.",
    inputSchema: {
      type: "object",
      properties: {
        search: {
          type: "string",
          description: "Optional keyword to search product name (e.g., 'Netflix', 'YouTube', 'Spotify')",
        },
      },
    },
  },
  {
    name: "get_recent_restocks",
    description:
      "Retrieve recent product stock restock logs added by administrators, including product names, added quantities, admin actor name, and timestamps.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of recent restock events to retrieve (default 10, max 30)",
        },
      },
    },
  },
  {
    name: "get_recent_broadcasts",
    description:
      "Retrieve history of recent push notifications broadcasted to users, including recipient counts and delivery success metrics.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of past broadcasts to retrieve (default 5, max 20)",
        },
      },
    },
  },
  {
    name: "get_shop_stats",
    description:
      "Get a quick operational summary of Appbymari: total active products, available stock in inventory, and registered mobile push notification subscribers.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

/**
 * Validates request authorization:
 * 1. Bearer token in Authorization header
 * 2. x-api-key header
 * 3. ?token=, ?key=, or ?apiKey= in URL query parameters
 * 4. Logged-in admin session (for dashboard testing)
 */
export async function verifyMcpAuth(req: Request): Promise<boolean> {
  // MCP credentials are server-only. Never fall back to a documented/default
  // secret: if deployment configuration is missing, only the authenticated
  // admin session below can use the dashboard endpoint.
  const secretKey = process.env.MCP_SECRET_KEY?.trim() || "";

  const authHeader = req.headers.get("authorization");
  if (secretKey && authHeader) {
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (bearer === secretKey) return true;
  }

  const apiKeyHeader = req.headers.get("x-api-key");
  if (secretKey && apiKeyHeader && apiKeyHeader.trim() === secretKey) {
    return true;
  }

  try {
    const url = new URL(req.url);
    const tokenQuery =
      url.searchParams.get("token") ||
      url.searchParams.get("key") ||
      url.searchParams.get("apiKey");
    if (secretKey && tokenQuery && tokenQuery.trim() === secretKey) {
      return true;
    }
  } catch {}

  // Fallback: Check if current cookie session is admin
  try {
    const user = await getCurrentUser();
    if (user && (user.email?.toLowerCase() === "zeriessand@gmail.com" || isAdminUser(user))) {
      return true;
    }
  } catch {}

  return false;
}

/**
 * Executes a tool called by Gemini Spark or another MCP client.
 */
export async function executeMcpTool(
  name: string,
  args: any,
): Promise<{ text: string; isError?: boolean }> {
  const siteId = getSiteId();

  switch (name) {
    case "broadcast_push_notification": {
      const title = String(args?.title || "").trim();
      const body = String(args?.body || "").trim();
      const url = args?.url ? String(args.url).trim() : "/";
      const target = (args?.target || "ALL").toString().toUpperCase();

      if (!title) {
        return { text: "ข้อผิดพลาด: กรุณาระบุหัวข้อแจ้งเตือน (title)", isError: true };
      }
      if (!body) {
        return { text: "ข้อผิดพลาด: กรุณาระบุข้อความแจ้งเตือน (body)", isError: true };
      }

      try {
        const result = await broadcastPushNotification({
          title,
          body,
          url,
          target,
          siteId,
          senderName: "Mimi (Gemini Spark AI)",
          senderEmail: "zeriessand@gmail.com",
        });

        const sent = result.dispatchResult.sent;
        const total = result.dispatchResult.total;
        const failed = result.dispatchResult.failed;

        return {
          text: `🚀 ส่งประกาศแจ้งเตือนแบบ Web Push สำเร็จเรียบร้อยแล้วค่ะ!\n\n` +
            `• หัวข้อ: ${title}\n` +
            `• ข้อความ: ${body}\n` +
            `• ลิงก์ปลายทาง: ${url}\n` +
            `• กลุ่มเป้าหมาย: ${target}\n` +
            `• ยิงออกไปยังมือถือสำเร็จ: ${sent} เครื่อง (จากทั้งหมด ${total} เครื่อง, ล้มเหลว ${failed})\n` +
            `• Broadcast ID: ${result.id}`,
          isError: false,
        };
      } catch (err: any) {
        console.error("[MCP Tool broadcast_push_notification error]:", err);
        return {
          text: `❌ เกิดข้อผิดพลาดในการยิงแจ้งเตือน: ${err?.message || "Internal server error"}`,
          isError: true,
        };
      }
    }

    case "get_stock_summary": {
      const search = args?.search ? String(args.search).trim() : null;
      try {
        const { products, total } = await fetchPublishedProductsPaginatedLive(
          50,
          0,
          null,
          search,
        );

        if (products.length === 0) {
          return {
            text: search
              ? `ไม่พบสินค้าที่ตรงกับคำค้นหา "${search}" ในระบบค่ะ`
              : "ปัจจุบันยังไม่มีสินค้าที่เปิดขายอยู่ในระบบค่ะ",
          };
        }

        const lines = products.map((p) => {
          const stockCount = Math.max(0, Number(p.stock) || 0);
          const priceNum = Number(p.price) || 0;
          const stockStatus = stockCount > 0 ? `📦 คงเหลือ ${stockCount} ชิ้น` : "❌ สินค้าหมด";
          return `• ${p.name} | ราคา: ฿${priceNum.toLocaleString()} | ${stockStatus}`;
        });

        return {
          text: `📊 ข้อมูลสต็อกสินค้า Appbymari (${products.length}/${total} รายการ):\n\n` +
            lines.join("\n"),
        };
      } catch (err: any) {
        console.error("[MCP Tool get_stock_summary error]:", err);
        return { text: `❌ ไม่สามารถดึงข้อมูลสต็อกได้: ${err?.message}`, isError: true };
      }
    }

    case "get_recent_restocks": {
      const limit = Math.min(Math.max(1, Number(args?.limit) || 10), 30);
      try {
        const restocks = await getRecentRestockAuditEvents(siteId, limit);
        if (!restocks || restocks.length === 0) {
          return { text: "ยังไม่มีประวัติการเติมสต็อกสินค้าใหม่จากแอดมินค่ะ" };
        }

        const lines = restocks.map((r, i) => {
          const timeStr = new Date(r.occurredAt).toLocaleString("th-TH");
          return `${i + 1}. ${r.productName} (+${r.addedCount} ชิ้น) คงเหลือ: ${r.remainingStock} ชิ้น โดย ${r.actorName} เมื่อ ${timeStr}`;
        });

        return {
          text: `📦 ประวัติการเติมสต็อกสินค้าล่าสุด (${restocks.length} รายการ):\n\n` +
            lines.join("\n"),
        };
      } catch (err: any) {
        console.error("[MCP Tool get_recent_restocks error]:", err);
        return { text: `❌ ไม่สามารถดึงประวัติ Restock ได้: ${err?.message}`, isError: true };
      }
    }

    case "get_recent_broadcasts": {
      const limit = Math.min(Math.max(1, Number(args?.limit) || 5), 20);
      try {
        const broadcasts = await getRecentBroadcasts(siteId, limit);
        if (!broadcasts || broadcasts.length === 0) {
          return { text: "ยังไม่มีประวัติการส่งประกาศแจ้งเตือนในระบบค่ะ" };
        }

        const lines = broadcasts.map((b, i) => {
          const timeStr = new Date(b.createdAt).toLocaleString("th-TH");
          return `${i + 1}. [${b.target}] "${b.title}" -> สำเร็จ ${b.sentCount} เครื่อง (${timeStr})`;
        });

        return {
          text: `📢 ประวัติการประกาศ Push Notifications (${broadcasts.length} รายการ):\n\n` +
            lines.join("\n"),
        };
      } catch (err: any) {
        console.error("[MCP Tool get_recent_broadcasts error]:", err);
        return { text: `❌ ไม่สามารถดึงประวัติ Broadcast ได้: ${err?.message}`, isError: true };
      }
    }

    case "get_shop_stats": {
      try {
        const [prodRows, subRows] = await Promise.all([
          pool.execute<RowDataPacket[]>(
            `SELECT COUNT(*) as total_products, COALESCE(SUM(stock), 0) as total_stock 
             FROM products 
             WHERE is_published = 1 AND (is_local = 0 OR (is_local = 1 AND site_id = ?))`,
            [siteId],
          ),
          pool.execute<RowDataPacket[]>(
            `SELECT COUNT(*) as total_subscribers 
             FROM web_push_subscriptions 
             WHERE (site_id = ? OR site_id = 'main')`,
            [siteId],
          ),
        ]);

        const prodStat = prodRows[0]?.[0] || { total_products: 0, total_stock: 0 };
        const subStat = subRows[0]?.[0] || { total_subscribers: 0 };

        return {
          text: `🏪 ภาพรวมสถานะร้าน Appbymari:\n\n` +
            `• สินค้าที่เปิดขายอยู่: ${prodStat.total_products} รายการ\n` +
            `• สินค้าคงคลังทั้งหมด: ${prodStat.total_stock} ชิ้น\n` +
            `• อุปกรณ์ที่ลงทะเบียนรับ Push Notification: ${subStat.total_subscribers} เครื่อง\n` +
            `• สถานะระบบ: เปิดให้บริการปกติ (Server Online)`,
        };
      } catch (err: any) {
        console.error("[MCP Tool get_shop_stats error]:", err);
        return { text: `❌ ไม่สามารถดึงสถิติร้านค้าได้: ${err?.message}`, isError: true };
      }
    }

    default:
      return {
        text: `ไม่พบเครื่องมือ (Tool) ชื่อ "${name}" ในระบบ MCP ของ Appbymari ค่ะ`,
        isError: true,
      };
  }
}

/**
 * Handles a single JSON-RPC 2.0 request according to Model Context Protocol.
 */
export async function handleMcpRpcMessage(msg: any): Promise<any> {
  if (!msg || typeof msg !== "object") {
    return {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Invalid Request: Payload must be an object" },
    };
  }

  const { jsonrpc, id, method, params } = msg;

  // Notification (e.g. notifications/initialized) does not require a response body
  if (method === "notifications/initialized" || method === "notifications/cancelled") {
    return null;
  }

  switch (method) {
    case "initialize": {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {
            tools: {
              listChanged: false,
            },
            resources: {
              listChanged: false,
            },
          },
          serverInfo: {
            name: MCP_SERVER_NAME,
            version: MCP_SERVER_VERSION,
          },
          instructions:
            "You are connected to Appbymari AI Operator (Mimi). You can broadcast Web Push notifications to members, query stock and prices, view restock events, and retrieve store statistics directly.",
        },
      };
    }

    case "ping": {
      return {
        jsonrpc: "2.0",
        id,
        result: {},
      };
    }

    case "tools/list": {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: MCP_TOOLS,
        },
      };
    }

    case "tools/call": {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};

      if (!toolName) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: "Invalid params: 'name' is required for tools/call" },
        };
      }

      const execution = await executeMcpTool(toolName, toolArgs);

      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: execution.text,
            },
          ],
          isError: execution.isError || false,
        },
      };
    }

    default: {
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: -32601,
          message: `Method not found: '${method}'`,
        },
      };
    }
  }
}
