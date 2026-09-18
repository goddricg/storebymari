import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser, requireUser } from "@/lib/auth/server";
import { getUserAvatarKey, setUserAvatarKey } from "@/lib/ranking/repository";
import { getSiteId } from "@/lib/site";

const avatarSchema = z.object({
  avatarKey: z.string().regex(/^avatar-\d{3}$/),
});

export async function GET() {
  if (getSiteId() !== "main") {
    return NextResponse.json({ avatarKey: null }, { status: 200 });
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ avatarKey: null }, { status: 401 });
    }

    const avatarKey = await getUserAvatarKey(user.id);
    return NextResponse.json(
      { avatarKey },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Profile avatar GET error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ message: "ไม่สามารถโหลด Avatar ได้" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (getSiteId() !== "main") {
    return NextResponse.json(
      { success: false, message: "Avatar profiles are not enabled for this site" },
      { status: 404 }
    );
  }

  try {
    const user = await requireUser();
    const parsed = avatarSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: "Invalid avatar selection" }, { status: 422 });
    }

    await setUserAvatarKey(user.id, parsed.data.avatarKey);
    return NextResponse.json({ success: true, avatarKey: parsed.data.avatarKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : "avatar save failed";
    if (message.includes("user_profile_preferences") || message.includes("doesn't exist")) {
      return NextResponse.json(
        { message: "Avatar profile storage is not ready. Apply migration 07 first." },
        { status: 503 }
      );
    }
    console.error("Profile avatar API error:", message);
    return NextResponse.json({ message: "ไม่สามารถบันทึก Avatar ได้" }, { status: 500 });
  }
}
