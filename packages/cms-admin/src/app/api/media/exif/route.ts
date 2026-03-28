/**
 * GET /api/media/exif?file=/uploads/IMG_0051.jpeg
 * Returns EXIF metadata for an image file.
 */
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { getActiveSitePaths } from "@/lib/site-paths";
import { extractExif } from "@/lib/media/image-processor";

export async function GET(req: NextRequest) {
  const fileUrl = req.nextUrl.searchParams.get("file");
  if (!fileUrl) return NextResponse.json({ error: "file param required" }, { status: 400 });

  try {
    const sitePaths = await getActiveSitePaths();
    // Resolve /uploads/x.jpg → absolute path (with traversal guard)
    const relativePath = fileUrl.replace(/^\/uploads\//, "");
    const fullPath = resolve(join(sitePaths.uploadDir, relativePath));

    if (!fullPath.startsWith(resolve(sitePaths.uploadDir) + "/")) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    if (!existsSync(fullPath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const buffer = await readFile(fullPath);
    const exif = await extractExif(buffer);

    if (!exif) {
      return NextResponse.json({ exif: null, message: "No EXIF data" });
    }

    return NextResponse.json({ exif });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read EXIF" },
      { status: 500 },
    );
  }
}
