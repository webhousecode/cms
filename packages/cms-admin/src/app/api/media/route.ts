import { NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import path from "path";
import { getUploadDir } from "@/lib/upload-dir";

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "avif"]);

type MediaFile = {
  name: string;
  folder: string; // "" = root
  url: string;
  size: number;
  isImage: boolean;
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
