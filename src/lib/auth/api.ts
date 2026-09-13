import { NextResponse } from "next/server";

import { getSiteId } from "@/lib/site";
import { getCurrentUser } from "./server";
import { canViewAdminReports } from "./roles";

function noStoreResponse(body: unknown, status: number) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return response;
}

/**
 * Return a JSON response for API callers instead of redirecting them to the
 * login page when a protected admin report is requested.
 */
export async function requireMainSiteSuperAdminApi() {
  const user = await getCurrentUser();

  if (!user) {
    return {
      user: null,
      response: noStoreResponse({ message: "Unauthorized" }, 401),
    };
  }

  if (!canViewAdminReports(getSiteId(), user)) {
    return {
      user: null,
      response: noStoreResponse({ message: "Forbidden" }, 403),
    };
  }

  return { user, response: null };
}
