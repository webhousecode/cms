/**
 * POST /api/admin/beam/export — Create and download a .beam archive.
 *
 * Returns the .beam file as a binary download.
 * Auth: middleware-protected (admin routes).
 */
import { NextResponse } from "next/server";
import { createReadStream, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createBeamArchive } from "@/lib/beam/export";
import { getSiteRole } from "@/lib/require-role";

export async function POST() {
  const role = await getSiteRole();
  if (role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { filePath, fileName, manifest } = await createBeamArchive();

    // Read the archive into memory and clean up temp file
    const buf = await readFile(filePath);
    try { rmSync(filePath); } catch { /* ignore */ }

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "X-Beam-Id": manifest.beamId,
        "X-Beam-Stats": JSON.stringify(manifest.stats),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed";
    console.error("[beam/export]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
