import { NextRequest, NextResponse } from "next/server";
import { getActiveSitePaths } from "@/lib/site-paths";
import path from "node:path";
import { resolve } from "node:path";

/**
 * POST /api/media/rotate
 * Body: { file: "/uploads/IMG.jpg", angle: 90 | -90 | 180 }
 *
 * Rotates an image in-place using Sharp. Also rotates any WebP variants.
 */
export async function POST(req: NextRequest) {
  const { file, angle } = (await req.json()) as { file?: string; angle?: number };
  if (!file || !angle || ![90, -90, 180].includes(angle)) {
    return NextResponse.json({ error: "file and angle (90, -90, 180) required" }, { status: 400 });
  }

  const sitePaths = await getActiveSitePaths();
  const relativePath = file.replace(/^\/uploads\//, "");
  const fullPath = resolve(path.join(sitePaths.uploadDir, relativePath));

  // Path containment guard
  if (!fullPath.startsWith(resolve(sitePaths.uploadDir) + "/")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const sharp = (await import("sharp")).default;
    const fs = await import("node:fs/promises");

    // Check file exists
    await fs.access(fullPath);

    // Rotate original
    const buffer = await sharp(fullPath).rotate(angle).toBuffer();
    await fs.writeFile(fullPath, buffer);

    // Rotate any WebP variants (e.g. IMG-400w.webp, IMG-800w.webp)
    const dir = path.dirname(fullPath);
    const ext = path.extname(fullPath);
    const base = path.basename(fullPath, ext);
    try {
      const entries = await fs.readdir(dir);
      const variantPattern = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-\\d+w\\.webp$`, "i");
      for (const entry of entries) {
        if (variantPattern.test(entry)) {
          const variantPath = path.join(dir, entry);
          const vBuf = await sharp(variantPath).rotate(angle).toBuffer();
          await fs.writeFile(variantPath, vBuf);
        }
      }
    } catch { /* no variants dir or read error — non-fatal */ }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Rotate failed" },
      { status: 500 },
    );
  }
}
