/**
 * POST /api/admin/beam/import — Chunked upload + verify + import of a .beam archive.
 *
 * Why chunks: Fly.io's edge proxy caps request bodies at ~10 MB. We split
 * client-side into 4 MB pieces, write them to a volume-backed temp dir
 * keyed by uploadId, verify SHA-256 of the assembled buffer matches what
 * the client claimed, and only then run the import. Nothing is registered
 * (no site name, no registry entry) until the archive is byte-for-byte
 * verified.
 *
 * Two actions, both POST, action chosen via `?action=`:
 *   - action=chunk     query: uploadId, index            body: chunk bytes
 *   - action=finalize  query: uploadId, orgId, filename, total, sha256, overwrite?, skipMedia?
 *
 * Auth: middleware-protected (admin routes); we double-check role here.
 */
import { NextRequest, NextResponse } from "next/server";
import { importBeamArchive } from "@/lib/beam/import";
import { getSiteRole } from "@/lib/require-role";
import { getBeamTmpDir } from "@/lib/beam/paths";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 300;

function safeUploadId(id: string | null): string | null {
  if (!id) return null;
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(id)) return null;
  return id;
}

function chunkPath(baseDir: string, uploadId: string, index: number): string {
  return path.join(baseDir, uploadId, `chunk-${String(index).padStart(6, "0")}.bin`);
}

export async function POST(request: NextRequest) {
  const role = await getSiteRole();
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const tmpBase = await getBeamTmpDir();

  try {
    if (action === "chunk") {
      const uploadId = safeUploadId(url.searchParams.get("uploadId"));
      const indexRaw = url.searchParams.get("index");
      const index = indexRaw ? Number(indexRaw) : NaN;
      if (!uploadId) {
        return NextResponse.json({ error: "Invalid uploadId" }, { status: 400 });
      }
      if (!Number.isInteger(index) || index < 0 || index > 10_000) {
        return NextResponse.json({ error: "Invalid chunk index" }, { status: 400 });
      }
      const dir = path.join(tmpBase, uploadId);
      await mkdir(dir, { recursive: true });
      const buf = Buffer.from(await request.arrayBuffer());
      if (buf.length === 0) {
        return NextResponse.json({ error: "Empty chunk" }, { status: 400 });
      }
      await writeFile(chunkPath(tmpBase, uploadId, index), buf);
      return NextResponse.json({ success: true, received: buf.length });
    }

    if (action === "finalize") {
      const uploadId = safeUploadId(url.searchParams.get("uploadId"));
      const orgId = url.searchParams.get("orgId");
      const filename = url.searchParams.get("filename") ?? "";
      const totalRaw = url.searchParams.get("total");
      const total = totalRaw ? Number(totalRaw) : NaN;
      const claimedSha256 = (url.searchParams.get("sha256") ?? "").toLowerCase();
      const overwrite = url.searchParams.get("overwrite") === "true";
      const skipMedia = url.searchParams.get("skipMedia") === "true";

      if (!uploadId) {
        return NextResponse.json({ error: "Invalid uploadId" }, { status: 400 });
      }
      if (!orgId) {
        return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
      }
      if (!Number.isInteger(total) || total < 1 || total > 10_000) {
        return NextResponse.json({ error: "Invalid chunk count" }, { status: 400 });
      }
      if (filename && !filename.endsWith(".beam")) {
        return NextResponse.json({ error: "File must be a .beam archive" }, { status: 400 });
      }
      if (claimedSha256 && !/^[a-f0-9]{64}$/.test(claimedSha256)) {
        return NextResponse.json({ error: "Invalid sha256 (must be 64 hex chars)" }, { status: 400 });
      }

      const uploadDir = path.join(tmpBase, uploadId);

      // Reassemble + hash. Reads from volume-backed dir so partial uploads
      // survive machine restarts; we only commit after the hash matches.
      const parts: Buffer[] = [];
      for (let i = 0; i < total; i++) {
        try {
          parts.push(await readFile(chunkPath(tmpBase, uploadId, i)));
        } catch {
          return NextResponse.json({
            error: `Missing chunk ${i} of ${total} — upload incomplete. Retry the upload.`,
          }, { status: 400 });
        }
      }
      const buffer = Buffer.concat(parts);
      const actualSha256 = createHash("sha256").update(buffer).digest("hex");

      console.log(`[beam/import] finalize uploadId=${uploadId} chunks=${total} bytes=${buffer.length} sha256=${actualSha256}`);

      if (claimedSha256 && actualSha256 !== claimedSha256) {
        return NextResponse.json({
          error: `SHA-256 mismatch: client said ${claimedSha256}, server got ${actualSha256}. Upload was corrupted in transit; retry.`,
        }, { status: 400 });
      }

      // Only NOW — buffer assembled, hash verified — do we run the actual
      // import (which extracts files and registers the site).
      try {
        const result = await importBeamArchive(buffer, orgId, { overwrite, skipMedia });
        return NextResponse.json({ success: true, sha256: actualSha256, ...result });
      } finally {
        rm(uploadDir, { recursive: true, force: true }).catch(() => {
          /* best-effort cleanup */
        });
      }
    }

    if (action === "abort") {
      const uploadId = safeUploadId(url.searchParams.get("uploadId"));
      if (!uploadId) {
        return NextResponse.json({ error: "Invalid uploadId" }, { status: 400 });
      }
      await rm(path.join(tmpBase, uploadId), { recursive: true, force: true }).catch(() => {});
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({
      error: "Missing or invalid ?action= (expected 'chunk', 'finalize', or 'abort')",
    }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    console.error("[beam/import]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
