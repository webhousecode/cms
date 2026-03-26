import { NextRequest, NextResponse } from "next/server";
import { getMediaAdapter } from "@/lib/media";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateVariants, isProcessableImage, extractExif } from "@/lib/media/image-processor";
import { getActiveSitePaths } from "@/lib/site-paths";

const UPLOAD_BASE = process.env.UPLOAD_BASE ?? "";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const folderParam = (formData.get("folder") as string | null) ?? req.nextUrl.searchParams.get("folder") ?? "";
  const folder = folderParam.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60);

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  // Preserve original filename, sanitized. Add short hash to avoid collisions.
  const hash = Math.random().toString(36).slice(2, 6);
  const originalName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  const dotIdx = originalName.lastIndexOf(".");
  const filename = dotIdx > 0
    ? `${originalName.slice(0, dotIdx)}-${hash}${originalName.slice(dotIdx)}`
    : `${originalName}-${hash}`;

  try {
    const adapter = await getMediaAdapter();
    const result = await adapter.uploadFile(filename, buffer, folder || undefined);
    const url = adapter.type === "filesystem" ? `${UPLOAD_BASE}${result.url}` : result.url;

    // F44: Auto-generate WebP variants + extract EXIF on upload
    if (adapter.type === "filesystem" && isProcessableImage(filename)) {
      try {
        const sitePaths = await getActiveSitePaths();
        const uploadDir = folder
          ? join(sitePaths.uploadDir, folder)
          : sitePaths.uploadDir;

        // Generate WebP variants
        const variants = await generateVariants(buffer, filename);
        for (const v of variants) {
          await writeFile(join(uploadDir, v.filename), v.buffer);
        }
        if (variants.length > 0) {
          console.log(`[upload] Generated ${variants.length} WebP variants for ${filename}`);
        }

        // Extract and persist EXIF metadata
        const exif = await extractExif(buffer);
        if (exif) {
          const { appendMediaMeta } = await import("@/lib/media/media-meta");
          await appendMediaMeta(folder ? `${folder}/${filename}` : filename, { exif });
        }
      } catch (err) {
        // Non-fatal — upload succeeded, variants/exif are bonus
        console.error("[upload] Post-processing error:", err instanceof Error ? err.message : err);
      }
    }

    return NextResponse.json({ url, folder, name: filename });
  } catch (err) {
    console.error("[upload] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
