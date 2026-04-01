/**
 * POST /api/admin/beam/import — Upload and import a .beam archive.
 *
 * Expects multipart/form-data with:
 *   - file: the .beam archive
 *   - orgId: target org ID
 *   - overwrite: "true" to overwrite existing site (optional)
 *   - skipMedia: "true" to skip media files (optional)
 *
 * Auth: middleware-protected (admin routes).
 */
import { NextRequest, NextResponse } from "next/server";
import { importBeamArchive } from "@/lib/beam/import";
import { getSiteRole } from "@/lib/require-role";

export async function POST(request: NextRequest) {
  const role = await getSiteRole();
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const orgId = formData.get("orgId") as string | null;
    const overwrite = formData.get("overwrite") === "true";
    const skipMedia = formData.get("skipMedia") === "true";

    if (!file) {
      return NextResponse.json({ error: "Missing .beam file" }, { status: 400 });
    }
    if (!orgId) {
      return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
    }
    if (!file.name.endsWith(".beam")) {
      return NextResponse.json({ error: "File must be a .beam archive" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
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
