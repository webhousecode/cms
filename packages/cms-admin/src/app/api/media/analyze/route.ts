import { NextRequest, NextResponse } from "next/server";
import { analyzeImage } from "@/lib/ai/image-analysis";
import type { ImageAnalysis } from "@/lib/ai/image-analysis";
import { getMediaAdapter } from "@/lib/media";
import { denyViewers } from "@/lib/require-role";

const VIDEO_EXTS = new Set(["mp4", "mov", "webm", "avi", "mkv", "m4v"]);

export async function POST(req: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  try {
    const { filename, folder = "", language = "da" } = await req.json();
    if (!filename) {
      return NextResponse.json({ error: "filename required" }, { status: 400 });
    }

    const ext = filename.toLowerCase().split(".").pop() ?? "";
    const isVideo = VIDEO_EXTS.has(ext);

    let buffer: Buffer | null;
    let mimeType = "image/jpeg";

    if (isVideo) {
      // For videos: extract thumbnail directly via ffmpeg
      const { getVideoThumbnail } = await import("@/lib/video-thumbnail");
      const fileUrl = folder ? `/uploads/${folder}/${filename}` : `/uploads/${filename}`;
      buffer = await getVideoThumbnail(fileUrl);
      if (!buffer) {
        return NextResponse.json({ error: "Could not generate video thumbnail (ffmpeg required)" }, { status: 400 });
      }
      mimeType = "image/jpeg";
    } else {
      // For images: read directly from media adapter
      const adapter = await getMediaAdapter();
      const segments = folder ? [folder, filename] : [filename];
      buffer = await adapter.readFile(segments);
      if (!buffer) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }

      const mimeMap: Record<string, string> = {
        jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
        webp: "image/webp", gif: "image/gif", svg: "image/svg+xml",
      };
      mimeType = mimeMap[ext] ?? "image/jpeg";

      if (mimeType === "image/svg+xml") {
        return NextResponse.json({ error: "SVG images cannot be analyzed" }, { status: 400 });
      }
    }

    const result = await analyzeImage(buffer, mimeType, language);

    // Save AI metadata to media-meta
    await saveAIMetadata(folder, filename, result);

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("API key") ? 401 : msg.includes("429") ? 429 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

/** Save AI analysis results into media-meta.json */
async function saveAIMetadata(
  folder: string,
  filename: string,
  analysis: ImageAnalysis,
) {
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
      aiProvider: (analysis as any).provider ?? "unknown",
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
