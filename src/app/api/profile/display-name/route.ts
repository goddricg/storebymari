import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/server";
import { updateUserDisplayName } from "@/lib/auth/user";
import {
  getDisplayNameError,
  normalizeDisplayName,
} from "@/lib/profile/validation";

export async function PATCH(request: Request) {
  const user = await requireUser();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "ข้อมูลคำขอไม่ถูกต้อง" }, { status: 400 });
  }

  const rawDisplayName =
    typeof body === "object" && body !== null && "displayName" in body
      ? (body as { displayName?: unknown }).displayName
      : undefined;

  if (typeof rawDisplayName !== "string") {
    return NextResponse.json({ message: "กรุณาระบุชื่อแสดง" }, { status: 422 });
  }

  const displayName = normalizeDisplayName(rawDisplayName);
  const validationError = getDisplayNameError(displayName);
  if (validationError) {
    return NextResponse.json({ message: validationError }, { status: 422 });
  }

  try {
    const updated = await updateUserDisplayName(user.id, displayName);
    if (!updated) {
      return NextResponse.json({ message: "ไม่พบบัญชีผู้ใช้" }, { status: 404 });
    }

    return NextResponse.json({ success: true, displayName });
  } catch {
    return NextResponse.json({ message: "ไม่สามารถบันทึกชื่อแสดงได้" }, { status: 500 });
  }
}
