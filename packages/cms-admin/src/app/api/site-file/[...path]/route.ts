import { NextRequest, NextResponse } from "next/server";
import { getActiveSitePaths } from "@/lib/site-paths";
import { readFile } from "fs/promises";
import path from "path";
import { getServerTSafe } from "@/i18n/server";

const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  avif: "image/avif", ico: "image/x-icon",
  mp4: "video/mp4", webm: "video/webm",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
  pdf: "application/pdf", html: "text/html",
};

/** Served on the admin domain: never executable there (Security W43 NY-HØJ-A / H4). */
const INERT = { "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox" } as const;

/**
 * Serve static files from the site's public/ directory or proxy from previewUrl.
 * Used for image previews in the admin when paths are relative to the site (e.g. /images/photo.png).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;

  // Prevent path traversal. Security W43 NY-HØJ-A: a backslash too — the
  // segment %5Cevil.example decodes to "\\evil.example", and
  // new URL("/\\evil.example/x", previewUrl) is https://evil.example/x.
  if (segments.some((s) => s === "" || s === "." || s === ".." || s.includes("\0") || s.includes("\\") || s.includes("/"))) {
    return NextResponse.json({ error: (await getServerTSafe())("errApi.common.forbidden") }, { status: 403 });
  }

  const sitePaths = await getActiveSitePaths();
  const relPath = "/" + segments.join("/");
  const ext = segments[segments.length - 1].split(".").pop()?.toLowerCase() ?? "";
  const contentType = MIME[ext] ?? "application/octet-stream";

  // Try local public/ directory first
  const publicDir = path.join(sitePaths.projectDir, "public");
  const filePath = path.join(publicDir, ...segments);
  if (filePath.startsWith(publicDir + path.sep)) {
    try {
      const data = await readFile(filePath);
      return new NextResponse(data, {
        headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=60", ...INERT },
      });
    } catch { /* fall through */ }
  }

  // Try previewUrl (for GitHub-backed sites where files aren't local)
  if (sitePaths.previewUrl) {
    try {
      // Only the site's own preview origin, no redirects followed (SSRF), and
      // OUR content type from the extension — never the upstream's.
      const base = new URL(sitePaths.previewUrl);
      const upstream = new URL(relPath, base);
      if (upstream.origin !== base.origin) {
        return NextResponse.json({ error: (await getServerTSafe())("errApi.common.forbidden") }, { status: 403 });
      }
      const res = await fetch(upstream.href, { redirect: "manual", next: { revalidate: 300 } });
      if (res.ok) {
        const data = await res.arrayBuffer();
        return new NextResponse(data, {
          headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=300", ...INERT },
        });
      }
    } catch { /* fall through */ }
  }

  return NextResponse.json({ error: (await getServerTSafe())("errApi.common.notFound") }, { status: 404 });
}
