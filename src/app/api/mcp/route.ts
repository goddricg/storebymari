import { NextRequest, NextResponse } from "next/server";
import {
  CORS_HEADERS,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  MCP_PROTOCOL_VERSION,
  MCP_TOOLS,
  verifyMcpAuth,
  handleMcpRpcMessage,
} from "@/lib/mcp/handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET(request: NextRequest) {
  const isAuth = await verifyMcpAuth(request);
  if (!isAuth) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        message: "Invalid or missing MCP authorization token. Please provide ?token=... or Authorization header.",
      },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  const accept = request.headers.get("accept") || "";

  // If client requested Server-Sent Events (SSE)
  if (accept.includes("text/event-stream")) {
    const encoder = new TextEncoder();
    const token = request.nextUrl.searchParams.get("token") || request.nextUrl.searchParams.get("key") || "";
    const endpointUrl = `/api/mcp${token ? `?token=${encodeURIComponent(token)}` : ""}`;

    const stream = new ReadableStream({
      start(controller) {
        // Send initial endpoint announcement per MCP SSE transport specification
        controller.enqueue(encoder.encode(`event: endpoint\ndata: ${endpointUrl}\n\n`));

        // Periodic heartbeat comment to keep connection alive
        const interval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: heartbeat\n\n`));
          } catch {
            clearInterval(interval);
          }
        }, 25000);

        request.signal.addEventListener("abort", () => {
          clearInterval(interval);
          try {
            controller.close();
          } catch {}
        });
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  // Otherwise return standard JSON status and metadata for easy testing and browser inspections
  return NextResponse.json(
    {
      status: "online",
      protocol: "mcp",
      server: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
      protocolVersion: MCP_PROTOCOL_VERSION,
      toolsCount: MCP_TOOLS.length,
      tools: MCP_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
      })),
      message: "Appbymari Remote MCP Server is active and operational for Gemini Spark.",
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: CORS_HEADERS,
    },
  );
}

export async function POST(request: NextRequest) {
  const isAuth = await verifyMcpAuth(request);
  if (!isAuth) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32000,
          message: "Unauthorized: Invalid or missing MCP authentication token.",
        },
      },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: "Parse error: Invalid JSON received",
        },
      },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  // Handle batch requests
  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map(handleMcpRpcMessage))).filter(
      Boolean,
    );
    return NextResponse.json(responses, { headers: CORS_HEADERS });
  }

  // Handle single request
  const response = await handleMcpRpcMessage(body);
  if (response === null) {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  return NextResponse.json(response, { headers: CORS_HEADERS });
}
