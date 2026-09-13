import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/server";
import {
  getAllKnowledgeRules,
  saveKnowledgeRule,
  deleteKnowledgeRule,
  toggleKnowledgeRule,
} from "@/lib/mimi/knowledge";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const rules = await getAllKnowledgeRules();
    return NextResponse.json({ success: true, rules });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Unauthorized" },
      { status: 401 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();

    const { id, category, situation, guidance, specialNotes, isActive } = body;

    if (!situation || !guidance) {
      return NextResponse.json(
        { success: false, message: "กรุณาระบุสถานการณ์และแนวทางการตอบ" },
        { status: 400 }
      );
    }

    const saved = await saveKnowledgeRule({
      id: id || undefined,
      category: category || "general",
      situation: situation.trim(),
      guidance: guidance.trim(),
      specialNotes: specialNotes ? specialNotes.trim() : "",
      isActive: isActive !== false,
      source: "web_admin",
      createdBy: admin?.displayName || admin?.email || "Admin",
    });

    return NextResponse.json({ success: true, rule: saved });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    const { id, isActive } = body;

    if (!id || typeof isActive !== "boolean") {
      return NextResponse.json(
        { success: false, message: "Invalid parameters" },
        { status: 400 }
      );
    }

    const ok = await toggleKnowledgeRule(id, isActive);
    return NextResponse.json({ success: ok });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Missing rule ID" },
        { status: 400 }
      );
    }

    const ok = await deleteKnowledgeRule(id);
    return NextResponse.json({ success: ok });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
