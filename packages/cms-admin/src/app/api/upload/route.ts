import { NextRequest, NextResponse } from "next/server";
import { getMediaAdapter } from "@/lib/media";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateVariants, isProcessableImage, extractExif } from "@/lib/media/image-processor";
import { getActiveSitePaths } from "@/lib/site-paths";
import { denyViewers } from "@/lib/require-role";

const UPLOAD_BASE = process.env.UPLOAD_BASE ?? "";

export async function POST(req: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
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
        const { readSiteConfig } = await import("@/lib/site-config");
        const siteConfig = await readSiteConfig();
        const sitePaths = await getActiveSitePaths();
        const uploadDir = folder
          ? join(sitePaths.uploadDir, folder)
          : sitePaths.uploadDir;

        // Generate WebP variants (respects site config)
        if (siteConfig.mediaAutoOptimize !== false) {
          const variantConfigs = (siteConfig.mediaVariantWidths ?? [400, 800, 1200, 1600]).map(
            (w: number) => ({ suffix: `${w}w`, width: w })
          );
          const variants = await generateVariants(buffer, filename, variantConfigs, siteConfig.mediaWebpQuality ?? 80);
          for (const v of variants) {
            await writeFile(join(uploadDir, v.filename), v.buffer);
          }
          if (variants.length > 0) {
            console.log(`[upload] Generated ${variants.length} WebP variants for ${filename}`);
          }
        }

        // Extract and persist EXIF metadata
        const exif = await extractExif(buffer);
        if (exif) {
          const { appendMediaMeta } = await import("@/lib/media/media-meta");
          await appendMediaMeta(folder ? `${folder}/${filename}` : filename, { exif });
        }

        // AI analysis (caption, alt-text, tags) — runs async, non-blocking
        // Uses multi-locale when site has >1 locale configured
        console.log(`[upload] Starting AI analysis for ${filename}, locales: ${JSON.stringify(siteConfig.locales)}`);
        try {
          const ext = filename.split(".").pop()?.toLowerCase() ?? "jpeg";
          const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
          const siteLocales = siteConfig.locales?.length ? siteConfig.locales : [];
          const metaKey = folder ? `${folder}/${filename}` : filename;

          if (siteLocales.length > 1) {
            const { analyzeImageMultiLocale } = await import("@/lib/ai/image-analysis");
            analyzeImageMultiLocale(buffer, mimeType, siteLocales).then(async (result) => {
              const firstLocale = siteLocales[0];
              const { appendMediaMeta: append } = await import("@/lib/media/media-meta");
              await append(metaKey, {
                aiCaption: result.captions[firstLocale] ?? Object.values(result.captions)[0] ?? "",
                aiAlt: result.alts[firstLocale] ?? Object.values(result.alts)[0] ?? "",
                aiTags: result.tags,
                aiAnalyzedAt: new Date().toISOString(),
                aiCaptions: result.captions,
                aiAlts: result.alts,
              } as any);
              console.log(`[upload] AI analyzed ${filename} (${siteLocales.join("+")}): ${Object.entries(result.alts).map(([l,a]) => `${l}="${a}"`).join(", ")}`);
            }).catch((err) => {
              console.error(`[upload] AI multi-locale analysis failed for ${filename}:`, err instanceof Error ? err.message : err);
            });
          } else {
            const { analyzeImage } = await import("@/lib/ai/image-analysis");
            analyzeImage(buffer, mimeType).then(async (analysis) => {
              if (analysis) {
                const { appendMediaMeta: append } = await import("@/lib/media/media-meta");
                await append(metaKey, {
                  aiCaption: analysis.caption,
                  aiAlt: analysis.alt,
                  aiTags: analysis.tags,
                  aiAnalyzedAt: new Date().toISOString(),
                });
                console.log(`[upload] AI analyzed ${filename}: "${analysis.alt}"`);
              }
            }).catch((err) => {
              console.error(`[upload] AI analysis failed for ${filename}:`, err instanceof Error ? err.message : err);
            });
          }
        } catch (aiErr) {
          console.error("[upload] AI analysis setup failed:", aiErr instanceof Error ? aiErr.message : aiErr);
        }
      } catch (err) {
        // Non-fatal — upload succeeded, variants/exif are bonus
        console.error("[upload] Post-processing error:", err instanceof Error ? err.message : err);
      }
    }

    // Extract text from PDF/DOCX for chat AI
    let extractedText: string | null = null;
    if (/\.pdf$/i.test(filename)) {
      try {
        const pdfParse = require("pdf-parse");
        const result = await pdfParse(buffer);
        const text = result.text?.trim();
        if (text && text.length >= 10) extractedText = text.slice(0, 50_000);
        console.log(`[upload] PDF extraction: ${extractedText ? `${extractedText.length} chars` : "no text"}`);
      } catch (e) {
        console.error(`[upload] PDF extraction failed:`, e instanceof Error ? e.message : e);
      }
    } else if (/\.docx?$/i.test(filename)) {
      try {
        const mammoth = require("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        const text = result.value?.trim();
        if (text) extractedText = text.slice(0, 50_000);
        console.log(`[upload] DOCX extraction: ${extractedText ? `${extractedText.length} chars` : "no text"}`);
      } catch (e) {
        console.error(`[upload] DOCX extraction failed:`, e instanceof Error ? e.message : e);
      }
    }

    return NextResponse.json({ url, folder, name: filename, ...(extractedText ? { extractedText } : {}) });
  } catch (err) {
    console.error("[upload] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
