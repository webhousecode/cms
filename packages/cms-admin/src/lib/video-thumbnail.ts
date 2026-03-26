/**
 * Extract a JPEG thumbnail from a video file using ffmpeg.
 * Caches result in _data/.cache/video-thumbs/.
 * Returns the JPEG buffer or null if extraction fails.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { createHash } from "node:crypto";
import { getActiveSitePaths } from "./site-paths";

export async function getVideoThumbnail(fileUrl: string): Promise<Buffer | null> {
  const { projectDir, dataDir } = await getActiveSitePaths();

  // Resolve video file path
  let filePath = "";
  if (fileUrl.startsWith("/uploads/")) {
    filePath = path.join(projectDir, "public", fileUrl);
    if (!existsSync(filePath)) {
      filePath = path.join(projectDir, fileUrl);
    }
  } else {
    filePath = path.join(projectDir, "public", fileUrl);
  }

  if (!existsSync(filePath)) return null;

  // Cache directory
  const cacheDir = path.join(dataDir, ".cache", "video-thumbs");
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

  const hash = createHash("md5").update(fileUrl).digest("hex");
  const thumbPath = path.join(cacheDir, `${hash}.jpg`);

  // Return cached
  if (existsSync(thumbPath)) {
    return readFileSync(thumbPath);
  }

  // Generate with ffmpeg
  try {
    execSync(
      `ffmpeg -y -i ${JSON.stringify(filePath)} -ss 00:00:01 -frames:v 1 -vf "scale=320:-1" -q:v 3 ${JSON.stringify(thumbPath)}`,
      { timeout: 10000, stdio: "pipe" },
    );
  } catch {
    try {
      execSync(
        `ffmpeg -y -i ${JSON.stringify(filePath)} -frames:v 1 -vf "scale=320:-1" -q:v 3 ${JSON.stringify(thumbPath)}`,
        { timeout: 10000, stdio: "pipe" },
      );
    } catch {
      return null;
    }
  }

  if (!existsSync(thumbPath)) return null;
  return readFileSync(thumbPath);
}
