import { NextResponse } from "next/server";
import { z } from "zod";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { requireUser } from "@/lib/auth/server";
import {
  findUserById,
  updateUserPasswordHash,
} from "@/lib/auth/user";

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
  confirmPassword: z.string().min(1),
});

export async function POST(request: Request) {
  const user = await requireUser();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "ข้อมูลคำขอไม่ถูกต้อง" }, { status: 400 });
  }

  const parsed = passwordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร" },
      { status: 422 }
    );
  }

  if (parsed.data.newPassword !== parsed.data.confirmPassword) {
    return NextResponse.json({ message: "รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน" }, { status: 422 });
  }

  try {
    const userRecord = await findUserById(user.id);
    if (!userRecord?.password_hash) {
      return NextResponse.json({ message: "ไม่สามารถตรวจสอบบัญชีผู้ใช้ได้" }, { status: 401 });
    }

    const currentPasswordMatches = await verifyPassword(
      parsed.data.currentPassword,
      userRecord.password_hash
    );
    if (!currentPasswordMatches) {
      return NextResponse.json({ message: "รหัสผ่านเดิมไม่ถูกต้อง" }, { status: 401 });
    }

    const passwordHash = await hashPassword(parsed.data.newPassword);
    const updated = await updateUserPasswordHash(user.id, passwordHash);
    if (!updated) {
      return NextResponse.json({ message: "ไม่พบบัญชีผู้ใช้" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ message: "ไม่สามารถเปลี่ยนรหัสผ่านได้" }, { status: 500 });
  }
}
