/**
 * POST /api/media/optimize-batch — Generate WebP variants for all images in uploads/
 *
 * Scans the upload directory, finds images without variants, and generates them.
 * Returns progress summary. Can be called multiple times (idempotent).
 */
import { NextRequest, NextResponse } from "next/server";
import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { getActiveSitePaths } from "@/lib/site-paths";
import { generateVariants, isProcessableImage, variantFilename, extractExif, DEFAULT_VARIANTS } from "@/lib/media/image-processor";
import { appendMediaMeta } from "@/lib/media/media-meta";

export async function POST(req: NextRequest) {
  try {
    const sitePaths = await getActiveSitePaths();
    const uploadDir = sitePaths.uploadDir;
    if (!uploadDir || !existsSync(uploadDir)) {
      return NextResponse.json({ error: "No upload directory found" }, { status: 404 });
    }

    // Optional: only process selected files (URLs like /uploads/IMG_0051.jpeg)
    let selectedUrls: string[] | null = null;
    try {
      const body = await req.json() as { files?: string[] };
      if (body?.files && body.files.length > 0) {
        selectedUrls = body.files;
      }
    } catch { /* no body = process all */ }

    let files = await scanImages(uploadDir);

    // Filter to selected files if provided
    if (selectedUrls) {
      const selectedNames = new Set(selectedUrls.map((u) => u.split("/").pop()!));
      files = files.filter((f) => selectedNames.has(f.name));
    }
    let processed = 0;
    let skipped = 0;
    let errors = 0;
    let totalSaved = 0;

    for (const file of files) {
      try {
        // Check if variants already exist
        const hasAllVariants = DEFAULT_VARIANTS.every((v) => {
          const vName = variantFilename(file.name, v.suffix);
          return existsSync(path.join(file.dir, vName));
        });

        if (hasAllVariants) {
          skipped++;
          continue;
        }

        const inputBuffer = await readFile(file.fullPath);
        const variants = await generateVariants(inputBuffer, file.name);

        for (const v of variants) {
          await writeFile(path.join(file.dir, v.filename), v.buffer);
          totalSaved += inputBuffer.length - v.size;
        }

        // Extract and persist EXIF metadata
        try {
          const exif = await extractExif(inputBuffer);
          if (exif) {
            const relKey = path.relative(uploadDir, file.fullPath);
            await appendMediaMeta(relKey, { exif });
          }
        } catch { /* non-fatal */ }

        processed++;
      } catch (err) {
        console.error(`[optimize] Failed to process ${file.name}:`, err instanceof Error ? err.message : err);
        errors++;
      }
    }

    return NextResponse.json({
      total: files.length,
      processed,
      skipped,
      errors,
      savedBytes: totalSaved,
      savedMB: Math.round(totalSaved / 1024 / 1024 * 10) / 10,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Optimization failed" },
      { status: 500 },
    );
  }
}

/** Recursively scan for processable images */
async function scanImages(dir: string): Promise<{ fullPath: string; dir: string; name: string }[]> {
  const results: { fullPath: string; dir: string; name: string }[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await scanImages(fullPath));
    } else if (isProcessableImage(entry.name)) {
      // Skip files that ARE variants (contain -400w, -800w etc.)
      if (/-\d+w\.webp$/i.test(entry.name)) continue;
      results.push({ fullPath, dir, name: entry.name });
    }
  }

  return results;
}
