import { NextResponse } from "next/server";

/**
 * Debug output must never be exposed by the production application.
 * Keep the route stub so generated Next.js route types remain stable.
 */
export async function GET() {
  return new NextResponse(null, {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}
