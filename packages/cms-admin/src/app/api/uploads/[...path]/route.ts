import { NextRequest, NextResponse } from "next/server";
import { getMediaAdapter } from "@/lib/media";
import { withSiteContext } from "@/lib/site-context";
import { loadRegistry, findSiteOrgId } from "@/lib/site-registry";

const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  avif: "image/avif", pdf: "application/pdf",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
  flac: "audio/flac", aac: "audio/aac", m4a: "audio/mp4",
  html: "text/html",
};

/** Types a browser runs as a document (scripts, same-origin access). */
const ACTIVE_CONTENT = new Set(["html", "htm", "svg", "xhtml", "xml"]);

/**
 * Resolve `?site=<id>` to (orgId, siteId) so callers without cms-admin
 * cookies (i.e. consumer sites doing /uploads/* rewrites) can fetch
 * the correct site's files. Same pattern as /api/cms/[collection]/[slug].
 */
async function resolveSiteCtx(siteId: string | null): Promise<{ orgId: string; siteId: string } | null> {
  if (!siteId) return null;
  const registry = await loadRegistry();
  if (!registry) return null;
  const orgId = findSiteOrgId(registry, siteId); // F208: ambiguous → null
  if (orgId) return { orgId, siteId };
  return null;
}

async function serveFile(segments: string[]): Promise<NextResponse> {
  const ext = segments[segments.length - 1].split(".").pop()?.toLowerCase() ?? "";
  const contentType = MIME[ext] ?? "application/octet-stream";
  try {
    const adapter = await getMediaAdapter();
    const data = await adapter.readFile(segments);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        // Permissive CORS — these are public static assets and sites consume
        // them cross-origin (e.g. sanneandersen.dk's <img src="https://webhouse.app/...">).
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff",
        // Security W41 H4 — an uploaded HTML or SVG file is served from the
        // ADMIN's origin; a script in it ran with the admin's cookies (and the
        // media/htmldoc iframes add allow-same-origin). A sandbox CSP gives the
        // document an opaque origin: it still renders, its scripts can no
        // longer reach the admin.
        ...(ACTIVE_CONTENT.has(ext) ? { "Content-Security-Policy": "sandbox allow-scripts allow-popups allow-forms" } : {}),
      },
    });
  } catch (err: unknown) {
    if ((err as Error).message === "Path traversal detected")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  const overrideSite = req.nextUrl.searchParams.get("site");
  if (!overrideSite) return serveFile(segments);
  const ctx = await resolveSiteCtx(overrideSite);
  if (!ctx) return NextResponse.json({ error: `site not found: ${overrideSite}` }, { status: 404 });
  return withSiteContext(ctx, () => serveFile(segments));
}
