import { NextResponse } from "next/server";

import { clearAuthCookie } from "@/lib/auth/session";
import { getCurrentUser } from "@/lib/auth/server";
import { isAdminUser } from "@/lib/auth/roles";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user && isAdminUser(user)) {
    await recordAdminAuditEvent({
      actor: user,
      action: "AUTH_LOGOUT",
      category: "security",
      severity: "low",
      entityType: "admin_session",
      entityId: user.id,
      entityLabel: user.email,
      details: "Administrative logout",
      ...getAdminAuditRequestContext(request),
    });
  }
  await clearAuthCookie();
  return NextResponse.json({ success: true });
}

