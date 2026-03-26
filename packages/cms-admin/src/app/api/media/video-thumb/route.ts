import { NextRequest, NextResponse } from "next/server";
import { getActiveSitePaths } from "@/lib/site-paths";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { createHash } from "node:crypto";

/**
 * GET /api/media/video-thumb?file=/uploads/VIDEO.MOV
 *
 * Extracts a JPEG thumbnail from a video file using ffmpeg.
 * Caches the result in _data/.cache/video-thumbs/.
 * Returns the cached JPEG on subsequent requests.
 */
export async function GET(req: NextRequest) {
  const fileUrl = req.nextUrl.searchParams.get("file");
  if (!fileUrl) return new NextResponse(null, { status: 400 });

  const { projectDir, dataDir } = await getActiveSitePaths();

  // Resolve the actual file path from the URL
  // /uploads/folder/file.mov → {projectDir}/public/uploads/folder/file.mov
  // or {uploadDir}/folder/file.mov
  let filePath = "";
  if (fileUrl.startsWith("/uploads/")) {
    filePath = path.join(projectDir, "public", fileUrl);
    if (!existsSync(filePath)) {
      // Try without /public/
      filePath = path.join(projectDir, fileUrl);
    }
  } else {
    filePath = path.join(projectDir, "public", fileUrl);
  }

  if (!existsSync(filePath)) {
    return new NextResponse(null, { status: 404 });
  }

  // Cache directory
  const cacheDir = path.join(dataDir, ".cache", "video-thumbs");
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

  const hash = createHash("md5").update(fileUrl).digest("hex");
  const thumbPath = path.join(cacheDir, `${hash}.jpg`);

  // Return cached thumbnail if it exists
  if (existsSync(thumbPath)) {
    const jpg = readFileSync(thumbPath);
    return new NextResponse(jpg, {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" },
    });
  }

  // Generate thumbnail with ffmpeg — extract frame at 1 second
  try {
    execSync(
      `ffmpeg -y -i ${JSON.stringify(filePath)} -ss 00:00:01 -frames:v 1 -vf "scale=320:-1" -q:v 3 ${JSON.stringify(thumbPath)}`,
      { timeout: 10000, stdio: "pipe" },
    );
  } catch {
    // Try frame at 0 seconds if video is shorter than 1s
    try {
      execSync(
        `ffmpeg -y -i ${JSON.stringify(filePath)} -frames:v 1 -vf "scale=320:-1" -q:v 3 ${JSON.stringify(thumbPath)}`,
        { timeout: 10000, stdio: "pipe" },
      );
    } catch {
      return new NextResponse(null, { status: 500 });
    }
  }

  if (!existsSync(thumbPath)) {
    return new NextResponse(null, { status: 500 });
  }

  const jpg = readFileSync(thumbPath);
  return new NextResponse(jpg, {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" },
  });
}
