import { NextRequest, NextResponse } from "next/server";
import { getSitePathsFor } from "@/lib/site-paths";
import { signPreviewToken, verifyPreviewToken } from "@/lib/preview-token";
import { FilesystemMediaAdapter } from "@/lib/media/filesystem";

export { signMobileUploadUrl };

const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  avif: "image/avif",
};

/** Generate a signed URL for serving an uploaded file to mobile (1hr TTL). */
function signMobileUploadUrl(
  baseUrl: string,
  orgId: string,
  siteId: string,
  filePath: string,
): string {
  const cleanPath = filePath.replace(/^\/uploads\//, "");
  const payload = `mobile-upload:${orgId}/${siteId}/${cleanPath}`;
  const tok = signPreviewToken(payload);
  const params = new URLSearchParams({ orgId, siteId, path: cleanPath, tok });
  return `${baseUrl}/api/mobile/uploads?${params.toString()}`;
}

/**
 * GET /api/mobile/uploads?orgId=...&siteId=...&path=photo.jpg&tok=...
 *
 * Serve uploaded files for mobile — authenticated via HMAC-signed token.
 * No JWT in URL, no cookies. Token is generated server-side with 1hr TTL.
 */
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId");
  const siteId = req.nextUrl.searchParams.get("siteId");
  const filePath = req.nextUrl.searchParams.get("path");
  const tok = req.nextUrl.searchParams.get("tok");

  if (!orgId || !siteId || !filePath || !tok) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  // Verify HMAC-signed token (1hr TTL)
  const payload = `mobile-upload:${orgId}/${siteId}/${filePath}`;
  if (!verifyPreviewToken(tok, payload)) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 });
  }

  // Security: no path traversal
  if (filePath.includes("..")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const paths = await getSitePathsFor(orgId, siteId);
    if (!paths) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    const adapter = new FilesystemMediaAdapter(paths.uploadDir, paths.dataDir);
    const segments = filePath.split("/");
    const data = await adapter.readFile(segments);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const ext = segments[segments.length - 1].split(".").pop()?.toLowerCase() ?? "";
    const contentType = MIME[ext] ?? "application/octet-stream";

    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
