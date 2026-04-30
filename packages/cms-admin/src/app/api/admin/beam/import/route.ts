/**
 * POST /api/admin/beam/import — Upload and import a .beam archive.
 *
 * Body: raw binary (.beam ZIP bytes). Metadata in query string.
 *
 * We deliberately avoid `multipart/form-data` here because Next.js'
 * `request.formData()` parser fails on large bodies (>~10 MB) with
 * "Failed to parse body as FormData" — the .beam archives we're
 * importing routinely exceed that. Raw binary via `request.arrayBuffer()`
 * has no such limit.
 *
 * Query params:
 *   - orgId (required): target org ID
 *   - filename (optional): original filename for logging/validation
 *   - overwrite=true to overwrite existing site
 *   - skipMedia=true to skip media files
 *
 * Auth: middleware-protected (admin routes).
 */
import { NextRequest, NextResponse } from "next/server";
import { importBeamArchive } from "@/lib/beam/import";
import { getSiteRole } from "@/lib/require-role";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const role = await getSiteRole();
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const orgId = url.searchParams.get("orgId");
    const filename = url.searchParams.get("filename") ?? "";
    const overwrite = url.searchParams.get("overwrite") === "true";
    const skipMedia = url.searchParams.get("skipMedia") === "true";

    if (!orgId) {
      return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
    }
    if (filename && !filename.endsWith(".beam")) {
      return NextResponse.json({ error: "File must be a .beam archive" }, { status: 400 });
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    const buffer = Buffer.from(await request.arrayBuffer());

    console.log(`[beam/import] received bytes=${buffer.length} content-length=${contentLength} filename=${filename || "<none>"}`);

    if (buffer.length === 0) {
      return NextResponse.json({ error: "Empty body — no .beam payload received" }, { status: 400 });
    }
    if (contentLength > 0 && buffer.length !== contentLength) {
      return NextResponse.json({
        error: `Truncated upload: expected ${contentLength} bytes, received ${buffer.length}`,
      }, { status: 400 });
    }
    // ZIP files end with the End of Central Directory marker `PK\x05\x06`.
    // If absent, the upload was mangled in transit (often because something
    // along the chain treated the body as text).
    const last22 = buffer.subarray(Math.max(0, buffer.length - 22));
    const eocdIndex = last22.indexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (eocdIndex === -1) {
      // Search wider in case there's a comment field
      const widerScan = buffer.subarray(Math.max(0, buffer.length - 65557));
      const wideEocd = widerScan.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
      if (wideEocd === -1) {
        return NextResponse.json({
          error: `Upload mangled: no ZIP end-of-central-directory in ${buffer.length}-byte body. Body was likely corrupted in transit (text encoding or proxy buffering).`,
        }, { status: 400 });
      }
    }

    const result = await importBeamArchive(buffer, orgId, { overwrite, skipMedia });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    console.error("[beam/import]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
