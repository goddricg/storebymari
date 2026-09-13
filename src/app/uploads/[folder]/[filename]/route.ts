import { readFile, stat } from "fs/promises";
import path from "path";

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED_FOLDERS = new Set([
  "categories",
  "posters",
  "products",
  "settings",
  "shortcuts",
]);

const MIME_TYPES: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ folder: string; filename: string }> },
) {
  try {
    const { folder, filename } = await params;
    const sanitizedFolder = path.basename(folder);
    const sanitizedFilename = path.basename(filename);

    if (
      !ALLOWED_FOLDERS.has(folder) ||
      sanitizedFolder !== folder ||
      sanitizedFilename !== filename ||
      filename.includes("..")
    ) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    const filePath = path.join(
      process.cwd(),
      "public",
      "uploads",
      sanitizedFolder,
      sanitizedFilename,
    );

    try {
      await stat(filePath);
    } catch {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    const buffer = await readFile(filePath);
    const contentType =
      MIME_TYPES[path.extname(sanitizedFilename).toLowerCase()] ??
      "application/octet-stream";

    return new NextResponse(buffer, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": buffer.length.toString(),
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    console.error("Uploaded media serve error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
