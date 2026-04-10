import { NextRequest, NextResponse } from "next/server";
import os from "os";
import { getMobileSession } from "@/lib/mobile-auth";
import { getSitePathsFor } from "@/lib/site-paths";
import { FilesystemMediaAdapter } from "@/lib/media/filesystem";
import { signMobileUploadUrl } from "@/app/api/mobile/uploads/route";
import { existsSync } from "fs";
import { join } from "path";
import { readFile } from "fs/promises";

function getLanBaseUrl(reqUrl: URL): string {
  let base = `${reqUrl.protocol}//${reqUrl.host}`;
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(base)) {
    const ifaces = os.networkInterfaces();
    for (const list of Object.values(ifaces)) {
      for (const i of list ?? []) {
        if (i.family === "IPv4" && !i.internal) {
          return base.replace(/localhost|127\.0\.0\.1|0\.0\.0\.0/, i.address);
        }
      }
    }
  }
  return base;
}

/**
 * GET /api/mobile/media?orgId=...&siteId=...&q=...
 *
 * List media files for a site. Returns signed URLs for images.
 * Optional search via ?q= parameter.
 */
export async function GET(req: NextRequest) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const orgId = req.nextUrl.searchParams.get("orgId");
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!orgId || !siteId) {
    return NextResponse.json({ error: "orgId and siteId required" }, { status: 400 });
  }

  const query = req.nextUrl.searchParams.get("q")?.toLowerCase() ?? "";

  try {
    const paths = await getSitePathsFor(orgId, siteId);
    if (!paths) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    const adapter = new FilesystemMediaAdapter(paths.uploadDir, paths.dataDir);
    let files = await adapter.listMedia();

    // Filter out WebP variants
    files = files.filter((f) => !/-\d+w\.webp$/i.test(f.name));

    // Search filter
    if (query) {
      files = files.filter((f) => f.name.toLowerCase().includes(query));
    }

    // Sort newest first
    files.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Load AI metadata directly from site's data dir (no cookies needed)
    let allMeta: any[] = [];
    try {
      const metaPath = join(paths.dataDir, "media-meta.json");
      const raw = await readFile(metaPath, "utf-8");
      allMeta = JSON.parse(raw);
    } catch { /* no meta file yet */ }
    const metaMap = new Map(allMeta.map((m: any) => [m.key, m]));

    // Sign URLs + resolve thumbnails (400w WebP variant if available)
    const baseUrl = getLanBaseUrl(new URL(req.url));
    const signed = files.map((f) => {
      const signedUrl = f.url.startsWith("/uploads/")
        ? signMobileUploadUrl(baseUrl, orgId, siteId, f.url)
        : f.url;

      // Try to find a 400w WebP thumbnail for faster grid loading
      let thumbUrl = signedUrl;
      if (f.isImage && f.url.startsWith("/uploads/")) {
        const dotIdx = f.name.lastIndexOf(".");
        if (dotIdx > 0) {
          const thumbName = `${f.name.slice(0, dotIdx)}-400w.webp`;
          const thumbPath = f.folder
            ? join(paths!.uploadDir, f.folder, thumbName)
            : join(paths!.uploadDir, thumbName);
          if (existsSync(thumbPath)) {
            const thumbRelative = f.folder
              ? `/uploads/${f.folder}/${thumbName}`
              : `/uploads/${thumbName}`;
            thumbUrl = signMobileUploadUrl(baseUrl, orgId, siteId, thumbRelative);
          }
        }
      }

      // AI metadata
      const metaKey = f.folder ? `${f.folder}/${f.name}` : f.name;
      const meta = metaMap.get(metaKey) as any;

      return {
        name: f.name,
        folder: f.folder,
        url: signedUrl,
        thumbUrl,
        size: f.size,
        isImage: f.isImage,
        mediaType: f.mediaType,
        createdAt: f.createdAt,
        aiCaption: meta?.aiCaption ?? null,
        aiAlt: meta?.aiAlt ?? null,
        aiTags: meta?.aiTags ?? null,
        aiAnalyzedAt: meta?.aiAnalyzedAt ?? null,
      };
    });

    return NextResponse.json({ files: signed, total: signed.length });
  } catch (err) {
    console.error("[mobile/media] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
