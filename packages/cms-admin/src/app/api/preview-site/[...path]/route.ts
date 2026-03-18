import { NextRequest, NextResponse } from "next/server";
import { getActiveSitePaths } from "@/lib/site-paths";
import { readFile, stat } from "fs/promises";
import path from "path";

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css",
  js: "application/javascript",
  json: "application/json",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  avif: "image/avif", ico: "image/x-icon",
  woff: "font/woff", woff2: "font/woff2",
  mp4: "video/mp4", webm: "video/webm",
  pdf: "application/pdf", xml: "application/xml",
  txt: "text/plain",
};

/**
 * Serve static files from the active site's dist/ directory.
 * Supports clean URLs: /about → /about/index.html → /about.html
 *
 * Used by the admin preview iframe for static sites that have no running dev server.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;

  // Prevent path traversal
  if (segments.some((s) => s === ".." || s.includes("\0"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sitePaths = await getActiveSitePaths();
  const distDir = path.join(sitePaths.projectDir, "dist");

  // Build candidate file paths (clean URL support)
  const relPath = segments.join("/");
  const candidates: string[] = [];

  if (!relPath || relPath === "") {
    candidates.push("index.html");
  } else {
    candidates.push(relPath);                          // exact match
    candidates.push(path.join(relPath, "index.html")); // dir/index.html
    if (!relPath.endsWith(".html")) {
      candidates.push(relPath + ".html");              // file.html
    }
  }

  for (const candidate of candidates) {
    const filePath = path.resolve(distDir, candidate);

    // Security: ensure resolved path is within dist/
    if (!filePath.startsWith(path.resolve(distDir))) continue;

    try {
      const s = await stat(filePath);
      if (!s.isFile()) continue;

      const data = await readFile(filePath);
      const ext = path.extname(filePath).slice(1).toLowerCase();
      const contentType = MIME[ext] ?? "application/octet-stream";

      return new NextResponse(data, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "no-cache",
        },
      });
    } catch { /* try next candidate */ }
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
