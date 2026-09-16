import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { isAdminUser } from "@/lib/auth/roles";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const MAX_FILE_SIZE = 16 * 1024 * 1024; // 16 MB
const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"]);
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
]);
const MIME_TO_EXTENSION: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/gif": ".gif",
};
const LOGIN_BACKGROUND_ASPECT_RATIO = 16 / 9;
const LOGIN_BACKGROUND_ASPECT_TOLERANCE = 0.02;
type RequestFormData = { get(name: string): string | File | null };

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const isAdmin = isAdminUser(user);
    if (!user || !isAdmin) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData() as unknown as RequestFormData;
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ message: "No file provided" }, { status: 400 });
    }

    if (file.size <= 0) {
      return NextResponse.json({ message: "ไฟล์รูปภาพว่างเปล่า กรุณาเลือกไฟล์ใหม่" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { message: "ขนาดไฟล์เกิน 16MB กรุณาลดขนาดไฟล์ภาพหรือใช้ลิงก์ URL แทน" },
        { status: 400 }
      );
    }

    const originalName = file.name || "image.png";
    const requestedExtension = path.extname(originalName).toLowerCase();
    const contentType = file.type.toLowerCase();
    const safeExt = requestedExtension || MIME_TO_EXTENSION[contentType] || ".png";

    if (
      !ALLOWED_EXTENSIONS.has(safeExt) ||
      (contentType && !ALLOWED_MIME_TYPES.has(contentType))
    ) {
      return NextResponse.json(
        { message: "รองรับเฉพาะไฟล์ PNG, JPG/JPEG, WEBP, SVG และ GIF เท่านั้น" },
        { status: 400 }
      );
    }

    const requestedFolder = (formData.get("folder") as string) || "settings";
    const requestedPurpose = (formData.get("purpose") as string) || "";
    const isLoginBackground = requestedPurpose === "login-background";
    const allowedFolders = ["products", "settings", "shortcuts", "posters"];
    const folder = allowedFolders.includes(requestedFolder)
      ? requestedFolder
      : "settings";

    if (isLoginBackground && (!['.png', '.jpg', '.jpeg', '.webp'].includes(safeExt) || ![
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
    ].includes(contentType))) {
      return NextResponse.json(
        { message: "ภาพพื้นหลังหน้า Login รองรับเฉพาะ PNG, JPG/JPEG และ WEBP เท่านั้น" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (isLoginBackground) {
      try {
        const { Jimp } = await import("jimp");
        const image = await Jimp.read(buffer);
        const ratio = image.height > 0 ? image.width / image.height : 0;

        if (!ratio || Math.abs(ratio - LOGIN_BACKGROUND_ASPECT_RATIO) > LOGIN_BACKGROUND_ASPECT_TOLERANCE) {
          return NextResponse.json(
            { message: "ภาพพื้นหลังหน้า Login ต้องเป็นสัดส่วน 16:9 เช่น 1600x900px" },
            { status: 400 },
          );
        }
      } catch (error) {
        console.error("Login background image validation failed:", error);
        return NextResponse.json(
          { message: "ไม่สามารถอ่านไฟล์ภาพพื้นหลังได้ กรุณาใช้ไฟล์ PNG, JPG/JPEG หรือ WEBP ที่ถูกต้อง" },
          { status: 400 },
        );
      }
    }

    const filename = `${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 8)}${safeExt}`;

    const uploadDir = path.join(process.cwd(), "public", "uploads", folder);
    await mkdir(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, filename);
    await writeFile(filePath, buffer);

    const fileUrl = `/uploads/${folder}/${filename}`;

    await recordAdminAuditEvent({
      actor: user,
      action: "ADMIN_UPLOAD_CREATE",
      category: "configuration",
      severity: "medium",
      entityType: "upload",
      entityId: fileUrl,
      entityLabel: originalName,
      after: {
        folder,
        extension: safeExt,
        size: file.size,
        contentType: file.type || null,
        url: fileUrl,
      },
      details: "Uploaded an administrative media file",
      ...getAdminAuditRequestContext(req),
    });

    return NextResponse.json({ success: true, url: fileUrl, fileUrl });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { message: "Internal server error during upload" },
      { status: 500 }
    );
  }
}
