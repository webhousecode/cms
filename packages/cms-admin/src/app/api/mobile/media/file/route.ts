import { NextRequest, NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { getSitePathsFor } from "@/lib/site-paths";
import { FilesystemMediaAdapter } from "@/lib/media/filesystem";

const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  avif: "image/avif",
};

/**
 * GET /api/mobile/media/file?orgId=...&siteId=...&path=og/photo.jpg
 *
 * Serve a media file authenticated via Bearer JWT (not signed token).
 * Used by chat inline images where JS can set headers.
 */
export async function GET(req: NextRequest) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const orgId = req.nextUrl.searchParams.get("orgId");
  const siteId = req.nextUrl.searchParams.get("siteId");
  const filePath = req.nextUrl.searchParams.get("path");
  if (!orgId || !siteId || !filePath) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }
  if (filePath.includes("..")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const paths = await getSitePathsFor(orgId, siteId);
    if (!paths) return NextResponse.json({ error: "Site not found" }, { status: 404 });

    const adapter = new FilesystemMediaAdapter(paths.uploadDir, paths.dataDir);
    const data = await adapter.readFile(filePath.split("/"));
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
