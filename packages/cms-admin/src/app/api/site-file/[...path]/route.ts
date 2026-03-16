import { NextRequest, NextResponse } from "next/server";
import { getActiveSitePaths } from "@/lib/site-paths";
import { readFile } from "fs/promises";
import path from "path";

const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  avif: "image/avif", ico: "image/x-icon",
  mp4: "video/mp4", webm: "video/webm",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
  pdf: "application/pdf", html: "text/html",
};

/**
 * Serve static files from the site's public/ directory or proxy from previewUrl.
 * Used for image previews in the admin when paths are relative to the site (e.g. /images/photo.png).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;

  // Prevent path traversal
  if (segments.some((s) => s === ".." || s.includes("\0"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sitePaths = await getActiveSitePaths();
  const relPath = "/" + segments.join("/");
  const ext = segments[segments.length - 1].split(".").pop()?.toLowerCase() ?? "";
  const contentType = MIME[ext] ?? "application/octet-stream";

  // Try local public/ directory first
  const publicDir = path.join(sitePaths.projectDir, "public");
  const filePath = path.join(publicDir, ...segments);
  if (filePath.startsWith(publicDir)) {
    try {
      const data = await readFile(filePath);
      return new NextResponse(data, {
        headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=60" },
      });
    } catch { /* fall through */ }
  }

  // Try previewUrl (for GitHub-backed sites where files aren't local)
  if (sitePaths.previewUrl) {
    try {
      const upstream = new URL(relPath, sitePaths.previewUrl).href;
      const res = await fetch(upstream, { next: { revalidate: 300 } });
      if (res.ok) {
        const data = await res.arrayBuffer();
        return new NextResponse(data, {
          headers: {
            "Content-Type": res.headers.get("content-type") ?? contentType,
            "Cache-Control": "public, max-age=300",
          },
        });
      }
    } catch { /* fall through */ }
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
