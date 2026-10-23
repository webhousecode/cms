/**
 * POST /api/beam/receive/file — Receive a single file during Live Beam.
 *
 * Public endpoint (beam session authenticated via beamId from initiate).
 * Receives files one at a time and writes them to the target site directory.
 *
 * Body: multipart/form-data with:
 *   - beamId: string
 *   - path: relative path in beam archive (e.g. "content/posts/hello.json")
 *   - checksum: SHA-256 hex digest
 *   - file: the file content
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getBeamSession, updateBeamSession } from "@/lib/beam/session";
import { getServerTSafe } from "@/i18n/server";

export async function POST(request: NextRequest) {
  const t = await getServerTSafe();
  try {
    const formData = await request.formData();
    const beamId = formData.get("beamId") as string | null;
    const filePath = formData.get("path") as string | null;
    const checksum = formData.get("checksum") as string | null;
    const file = formData.get("file") as File | null;

    if (!beamId || !filePath || !file) {
      return NextResponse.json(
        { error: t("errApi.beamReceive.missingFileFields") },
        { status: 400 },
      );
    }

    // Verify beam session exists
    const session = getBeamSession(beamId);
    if (!session || session.phase === "error" || session.phase === "done") {
      return NextResponse.json(
        { error: t("errApi.common.invalidBeamSession") },
        { status: 403 },
      );
    }

    // Read file content
    const content = Buffer.from(await file.arrayBuffer());

    // Verify checksum if provided
    let checksumOk = true;
    if (checksum) {
      const actual = createHash("sha256").update(content).digest("hex");
      if (actual !== checksum) {
        console.warn(`[beam/receive/file] Checksum mismatch: ${filePath}`);
        checksumOk = false;
      }
    }

    // Determine target directory — .beam-sites under the project directory
    const { getBeamSitesDir } = await import("@/lib/beam/paths");
    const beamRoot = path.resolve(await getBeamSitesDir());
    const siteDir = path.join(beamRoot, session.siteId);
    // Security W41 NY-K2 — the traversal guard below compares against siteDir,
    // which the sender chose; siteDir itself must be a direct child of beam-sites.
    if (path.dirname(path.resolve(siteDir)) !== beamRoot) {
      return NextResponse.json({ error: t("errApi.beamReceive.invalidSiteId") }, { status: 400 });
    }

    // Resolve target path based on prefix
    let targetPath: string;
    if (filePath.startsWith("content/")) {
      targetPath = path.join(siteDir, filePath);
    } else if (filePath.startsWith("uploads/")) {
      targetPath = path.join(siteDir, "public", filePath);
    } else if (filePath.startsWith("_data/")) {
      targetPath = path.join(siteDir, filePath);
    } else if (filePath === "cms.config.ts" || filePath === "cms.config.json") {
      targetPath = path.join(siteDir, filePath);
    } else if (filePath.startsWith("source/")) {
      // F143 P2: strip the source/ namespace and write to siteDir root.
      // build.ts → siteDir/build.ts, source/public/X → siteDir/public/X.
      // Symmetric with import.ts and createBeamArchive's source/ section.
      targetPath = path.join(siteDir, filePath.slice("source/".length));
    } else {
      targetPath = path.join(siteDir, filePath);
    }

    // Path traversal guard
    const resolved = path.resolve(targetPath);
    if (!resolved.startsWith(path.resolve(siteDir))) {
      return NextResponse.json(
        { error: t("errApi.beamReceive.pathTraversal") },
        { status: 400 },
      );
    }

    // Ensure parent directory exists and write
    mkdirSync(path.dirname(resolved), { recursive: true });
    writeFileSync(resolved, content);

    // Update session progress
    updateBeamSession(beamId, {
      phase: "files",
      transferredFiles: session.transferredFiles + 1,
      transferredBytes: session.transferredBytes + content.length,
      currentFile: filePath,
      checksumErrors: session.checksumErrors + (checksumOk ? 0 : 1),
    });

    return NextResponse.json({
      success: true,
      path: filePath,
      size: content.length,
      checksumOk,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : t("errApi.beamReceive.fileFailed");
    console.error("[beam/receive/file]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
