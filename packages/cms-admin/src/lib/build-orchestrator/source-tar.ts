/**
 * F144 P3 — Source-tar packager.
 *
 * Walks a site's projectDir + content tree and emits a gzipped tar that
 * the ephemeral builder VM extracts at /build/source. Excludes the same
 * dirs as beam (node_modules, .next, .git, dist, …) so the tarball stays
 * small and predictable.
 *
 * Returned Buffer is base64-encoded into Fly Machines `files:` payload
 * by the orchestrator.
 */
import archiver from "archiver";
import { readdirSync, statSync, createReadStream } from "node:fs";
import path from "node:path";
import { PassThrough } from "node:stream";

import { EXCLUDED_SOURCE_DIRS } from "../beam/types";

export interface PackSourceTarResult {
  /** gzipped tar contents */
  tarGz: Buffer;
  /** Number of files included */
  fileCount: number;
  /** Total bytes (uncompressed payload size, approximate) */
  rawBytes: number;
}

export interface PackSourceTarOptions {
  /** Root directory to package. */
  projectDir: string;
  /**
   * Optional content directory to merge into source/content/ at archive
   * root. Use for filesystem sites where content lives next to source.
   * For github-adapter sites, leave undefined — the build VM pulls from
   * the repo separately.
   */
  contentDir?: string;
  /**
   * Extra top-level dirs/files to exclude beyond EXCLUDED_SOURCE_DIRS.
   * Entries match by exact name relative to projectDir root.
   */
  extraExcludes?: string[];
}

/**
 * Build a tar.gz of a project's source tree. Synchronous-feeling API
 * but internally streams to keep memory bounded for medium-sized sites.
 */
export async function packSourceTar(
  opts: PackSourceTarOptions,
): Promise<PackSourceTarResult> {
  const { projectDir, contentDir, extraExcludes = [] } = opts;

  const excluded = new Set([...EXCLUDED_SOURCE_DIRS, ...extraExcludes]);

  let fileCount = 0;
  let rawBytes = 0;

  const archive = archiver("tar", { gzip: true, gzipOptions: { level: 6 } });
  const sink = new PassThrough();
  archive.pipe(sink);

  const chunks: Buffer[] = [];
  sink.on("data", (chunk: Buffer) => chunks.push(chunk));

  // Walk projectDir top-level
  for (const entry of readdirSync(projectDir)) {
    if (excluded.has(entry)) continue;
    const abs = path.join(projectDir, entry);
    let stat;
    try { stat = statSync(abs); } catch { continue; }

    if (stat.isDirectory()) {
      walkDir(abs, entry, (absPath, archivePath, sz) => {
        archive.file(absPath, { name: archivePath });
        fileCount++;
        rawBytes += sz;
      }, excluded);
    } else {
      archive.file(abs, { name: entry });
      fileCount++;
      rawBytes += stat.size;
    }
  }

  // Optional content dir → mounted at "content/" inside the tar
  if (contentDir) {
    let cstat;
    try { cstat = statSync(contentDir); } catch { cstat = null; }
    if (cstat?.isDirectory()) {
      walkDir(contentDir, "content", (absPath, archivePath, sz) => {
        archive.file(absPath, { name: archivePath });
        fileCount++;
        rawBytes += sz;
      });
    }
  }

  await archive.finalize();
  await new Promise<void>((resolve, reject) => {
    sink.on("end", resolve);
    sink.on("error", reject);
  });

  return { tarGz: Buffer.concat(chunks), fileCount, rawBytes };
}

/**
 * Recursively walk a directory and call onFile for each non-directory
 * entry. archivePrefix is the path inside the tar (so caller controls
 * where the tree mounts). excluded is checked at every level for sub-
 * dir names.
 */
function walkDir(
  rootAbs: string,
  archivePrefix: string,
  onFile: (absPath: string, archivePath: string, sizeBytes: number) => void,
  excluded?: Set<string>,
): void {
  let entries: string[];
  try { entries = readdirSync(rootAbs); } catch { return; }

  for (const entry of entries) {
    if (excluded?.has(entry)) continue;
    const abs = path.join(rootAbs, entry);
    const archivePath = `${archivePrefix}/${entry}`;
    let stat;
    try { stat = statSync(abs); } catch { continue; }

    if (stat.isDirectory()) {
      walkDir(abs, archivePath, onFile, excluded);
    } else {
      onFile(abs, archivePath, stat.size);
    }
  }
}
