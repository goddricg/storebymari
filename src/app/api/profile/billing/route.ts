import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/server";
import { getBillingProfile, upsertBillingProfile } from "@/lib/billing/repository";
import { billingProfileSchema } from "@/lib/billing/validation";

function noStore(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return response;
}

export async function GET() {
  const user = await requireUser();
  try {
    return noStore({ billingProfile: await getBillingProfile(user.id) });
  } catch (error) {
    console.error("Billing profile GET failed:", error);
    return noStore({ message: "ไม่สามารถโหลดข้อมูลสำหรับออกบิลได้" }, 500);
  }
}

export async function PATCH(request: Request) {
  const user = await requireUser();
  const body = await request.json().catch(() => null);
  const parsed = billingProfileSchema.safeParse(body);
  if (!parsed.success) {
    return noStore({ message: "ข้อมูลสำหรับออกบิลไม่ถูกต้อง", errors: parsed.error.flatten() }, 422);
  }

  try {
    const billingProfile = await upsertBillingProfile(user.id, parsed.data);
    return noStore({ billingProfile });
  } catch (error) {
    console.error("Billing profile PATCH failed:", error);
    return noStore({ message: "ไม่สามารถบันทึกข้อมูลสำหรับออกบิลได้" }, 500);
  }
}
