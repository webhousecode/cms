import { NextRequest, NextResponse } from "next/server";
import { analyzeImage, type ImageAnalysis } from "@/lib/ai/image-analysis";
import { getMediaAdapter } from "@/lib/media";

export async function POST(req: NextRequest) {
  try {
    const { filename, folder = "", language = "da" } = await req.json();
    if (!filename) {
      return NextResponse.json({ error: "filename required" }, { status: 400 });
    }

    // Read image from media adapter
    const adapter = await getMediaAdapter();
    const segments = folder ? [folder, filename] : [filename];
    const buffer = await adapter.readFile(segments);
    if (!buffer) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    // Detect mime type
    const ext = filename.toLowerCase().split(".").pop() ?? "";
    const mimeMap: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
      webp: "image/webp", gif: "image/gif", svg: "image/svg+xml",
    };
    const mimeType = mimeMap[ext] ?? "image/jpeg";

    // Skip non-raster images
    if (mimeType === "image/svg+xml") {
      return NextResponse.json({ error: "SVG images cannot be analyzed" }, { status: 400 });
    }

    const result = await analyzeImage(buffer, mimeType, language);

    // Save AI metadata to media-meta
    await saveAIMetadata(adapter, folder, filename, result);

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("API key") ? 401 : msg.includes("429") ? 429 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

/** Save AI analysis results into the media adapter's metadata */
async function saveAIMetadata(
  adapter: Awaited<ReturnType<typeof getMediaAdapter>>,
  folder: string,
  filename: string,
  analysis: ImageAnalysis,
) {
  // Access filesystem adapter's internal methods via the media-meta pattern
  // We import and use the same loadMediaMeta/saveMediaMeta from filesystem adapter
  try {
    const { getActiveSitePaths } = await import("@/lib/site-paths");
    const { dataDir } = await getActiveSitePaths();
    const fs = await import("fs/promises");
    const path = await import("path");

    const metaPath = path.join(dataDir, "media-meta.json");
    let meta: Array<Record<string, unknown>> = [];
    try {
      meta = JSON.parse(await fs.readFile(metaPath, "utf-8"));
    } catch { /* empty */ }

    const key = folder ? `${folder}/${filename}` : filename;
    const idx = meta.findIndex((m) => m.key === key);

    const aiFields = {
      aiCaption: analysis.caption,
      aiAlt: analysis.alt,
      aiTags: analysis.tags,
      aiAnalyzedAt: new Date().toISOString(),
      aiProvider: "gemini-2.0-flash",
    };

    if (idx >= 0) {
      meta[idx] = { ...meta[idx], ...aiFields };
    } else {
      meta.push({ key, name: filename, folder, status: "active", ...aiFields });
    }

    await fs.mkdir(path.dirname(metaPath), { recursive: true });
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
  } catch (err) {
    console.error("[analyze] Failed to save AI metadata:", err);
  }
}
