import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB
const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ message: "กรุณาเลือกไฟล์รูปภาพ" }, { status: 400 });
    }

    if (file.size <= 0) {
      return NextResponse.json({ message: "ไฟล์รูปภาพว่างเปล่า" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { message: "ขนาดไฟล์เกิน 8MB กรุณาเลือกไฟล์ใหม่" },
        { status: 400 }
      );
    }

    const originalName = file.name || "image.png";
    const ext = path.extname(originalName).toLowerCase() || ".png";
    const mimeType = file.type.toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(ext) || (mimeType && !ALLOWED_MIME_TYPES.has(mimeType))) {
      return NextResponse.json(
        { message: "รองรับเฉพาะไฟล์รูปภาพ PNG, JPG, JPEG และ WEBP เท่านั้น" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const safeFilename = `support-${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "support");
    await mkdir(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, safeFilename);
    await writeFile(filePath, buffer);

    const fileUrl = `/uploads/support/${safeFilename}`;

    return NextResponse.json({
      success: true,
      fileUrl,
      fileName: originalName,
      fileSize: file.size,
      mimeType: mimeType || "image/png",
    });
  } catch (error) {
    console.error("Support upload error:", error);
    const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการอัปโหลด";
    return NextResponse.json({ message }, { status: 500 });
  }
}
