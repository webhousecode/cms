import { NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import path from "path";
import { getUploadDir } from "@/lib/upload-dir";

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "avif"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "avi", "mkv"]);
const DOC_EXTS = new Set(["pdf", "doc", "docx", "xls", "xlsx", "pptx", "txt", "md", "csv", "json"]);

function getMediaType(ext: string): "image" | "audio" | "video" | "document" | "other" {
  if (IMAGE_EXTS.has(ext)) return "image";
  if (AUDIO_EXTS.has(ext)) return "audio";
  if (VIDEO_EXTS.has(ext)) return "video";
  if (DOC_EXTS.has(ext)) return "document";
  return "other";
}

type MediaFile = {
  name: string;
  folder: string; // "" = root
  url: string;
  size: number;
  isImage: boolean;
  mediaType: "image" | "audio" | "video" | "document" | "other";
  createdAt: string;
};

async function scanDir(dir: string, folder: string): Promise<MediaFile[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const results: MediaFile[] = [];

  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry);
      const info = await stat(fullPath).catch(() => null);
      if (!info) return;

      if (info.isDirectory() && folder === "") {
        // One level deep only — recurse into subdirectories at root level
        const sub = await scanDir(fullPath, entry);
        results.push(...sub);
      } else if (info.isFile()) {
        const ext = entry.split(".").pop()?.toLowerCase() ?? "";
        const urlPath = folder ? `/uploads/${folder}/${entry}` : `/uploads/${entry}`;
        results.push({
          name: entry,
          folder,
          url: urlPath,
          size: info.size,
          isImage: IMAGE_EXTS.has(ext),
          mediaType: getMediaType(ext),
          createdAt: info.birthtime.toISOString(),
        });
      }
    })
  );

  return results;
}

export async function GET() {
  try {
    const uploadDir = await getUploadDir();
    const files = await scanDir(uploadDir, "");
    files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json(files);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
