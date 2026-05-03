/**
 * F122 — Beam Export Engine.
 *
 * Creates a .beam archive (ZIP) from a complete site: content, media,
 * config, _data (with secrets stripped), and a manifest with checksums.
 */
import { existsSync, readdirSync, statSync, readFileSync, createWriteStream, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import archiver from "archiver";
import { getActiveSitePaths, getActiveSiteEntry } from "../site-paths";
import { getAdminCms, getAdminConfig } from "../cms";
import type { BeamManifest, BeamExportResult } from "./types";
import {
  SECRET_FIELDS,
  BEAM_REDACTED,
  EXCLUDED_DATA_DIRS,
  EXCLUDED_SOURCE_DIRS,
  SOURCE_ROOT_FILES,
} from "./types";

/**
 * Create a .beam archive from the active site.
 * Returns the archive path and manifest.
 */
export async function createBeamArchive(): Promise<BeamExportResult> {
  const sitePaths = await getActiveSitePaths();
  const siteEntry = await getActiveSiteEntry();
  const { dataDir, projectDir, configPath, uploadDir } = sitePaths;

  const siteName = (siteEntry?.name ?? "site").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
  const beamId = randomUUID();
  const fileName = `${siteName}.beam`;

  // Output to temp dir inside _data (not inside backups/)
  const beamDir = path.join(dataDir, "beam-tmp");
  mkdirSync(beamDir, { recursive: true });
  const filePath = path.join(beamDir, fileName);

  const checksums: Record<string, string> = {};
  const stats: BeamManifest["stats"] = {
    contentFiles: 0,
    mediaFiles: 0,
    dataFiles: 0,
    sourceFiles: 0,
    totalSizeBytes: 0,
    collections: {},
  };
  const secretsRequired: string[] = [];

  // Fetch all content via CMS API (works for both filesystem and GitHub)
  const cms = await getAdminCms();
  const config = await getAdminConfig();
  const allContent: Record<string, unknown[]> = {};

  for (const col of config.collections) {
    try {
      const { documents } = await cms.content.findMany(col.name, {});
      allContent[col.name] = documents;
      stats.collections[col.name] = documents.length;
      stats.contentFiles += documents.length;
    } catch {
      allContent[col.name] = [];
      stats.collections[col.name] = 0;
    }
  }

  // Build the ZIP archive
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(filePath);
    const archive = archiver("zip", { zlib: { level: 6 } });

    output.on("close", () => {
      stats.totalSizeBytes = archive.pointer();
      resolve();
    });
    archive.on("error", (err) => reject(err));
    archive.pipe(output);

    // ── Content ──
    for (const [colName, docs] of Object.entries(allContent)) {
      for (const doc of docs) {
        const d = doc as { slug?: string; id?: string };
        const slug = d.slug ?? d.id ?? "unknown";
        const jsonStr = JSON.stringify(doc, null, 2);
        const archivePath = `content/${colName}/${slug}.json`;
        checksums[archivePath] = sha256(jsonStr);
        archive.append(jsonStr, { name: archivePath });
      }
    }

    // ── cms.config.ts ──
    if (!configPath.startsWith("github://") && existsSync(configPath)) {
      const configBuf = readFileSync(configPath);
      checksums["cms.config.ts"] = sha256(configBuf);
      archive.file(configPath, { name: "cms.config.ts" });
    } else if (configPath.startsWith("github://")) {
      const configJson = JSON.stringify(
        { collections: config.collections.map((c: any) => ({ name: c.name, label: c.label, fields: c.fields, sourceLocale: c.sourceLocale, locales: c.locales, urlPrefix: c.urlPrefix })) },
        null, 2,
      );
      checksums["cms.config.json"] = sha256(configJson);
      archive.append(configJson, { name: "cms.config.json" });
    }

    // ── Media (uploads/) ──
    if (existsSync(uploadDir)) {
      walkDir(uploadDir, (absPath, relPath) => {
        const archivePath = `uploads/${relPath}`;
        checksums[archivePath] = sha256(readFileSync(absPath));
        archive.file(absPath, { name: archivePath });
        stats.mediaFiles++;
      });
    }

    // ── _data/ (with secret stripping) ──
    if (existsSync(dataDir)) {
      for (const entry of readdirSync(dataDir)) {
        if (EXCLUDED_DATA_DIRS.has(entry)) continue;
        if (entry === "beam-tmp") continue;
        const full = path.join(dataDir, entry);
        const stat = statSync(full);

        if (stat.isDirectory()) {
          walkDir(full, (absPath, relPath) => {
            const archivePath = `_data/${entry}/${relPath}`;
            const content = readFileSync(absPath);
            checksums[archivePath] = sha256(content);
            archive.file(absPath, { name: archivePath });
            stats.dataFiles++;
          });
        } else {
          const archivePath = `_data/${entry}`;
          let content = readFileSync(full, "utf-8");

          // Strip secrets from known config files
          const fieldList = SECRET_FIELDS[entry];
          if (fieldList) {
            try {
              const obj = JSON.parse(content);
              const stripped = stripSecrets(obj, fieldList);
              if (stripped.length > 0) secretsRequired.push(...stripped);
              content = JSON.stringify(obj, null, 2);
            } catch { /* not JSON, include as-is */ }
          }

          checksums[archivePath] = sha256(content);
          archive.append(content, { name: archivePath });
          stats.dataFiles++;
        }
      }
    }

    // ── Registry entry (stripped) ──
    if (siteEntry) {
      const regEntry = { ...siteEntry } as Record<string, unknown>;
      // Strip GitHub token
      if (regEntry.github && typeof regEntry.github === "object") {
        const gh = { ...(regEntry.github as Record<string, unknown>) };
        if (gh.token) {
          gh.token = BEAM_REDACTED;
          secretsRequired.push("GITHUB_TOKEN");
        }
        regEntry.github = gh;
      }
      const regJson = JSON.stringify(regEntry, null, 2);
      checksums["registry-entry.json"] = sha256(regJson);
      archive.append(regJson, { name: "registry-entry.json" });
    }

    // ── F143 P2: Source files (build.ts, package.json, public/, etc.) ──
    // Skipped for github-adapter sites because their projectDir is a temp
    // dir with only cms.config.ts (per site-pool.ts). The actual source
    // lives in the GH repo and the build server pulls from there.
    if (
      !configPath.startsWith("github://") &&
      existsSync(projectDir) &&
      siteEntry?.adapter !== "github"
    ) {
      // Walk projectDir's root for source-relevant files.
      for (const entry of readdirSync(projectDir)) {
        // Skip directories the build server should never receive.
        if (EXCLUDED_SOURCE_DIRS.has(entry)) continue;

        const abs = path.join(projectDir, entry);
        let stat;
        try {
          stat = statSync(abs);
        } catch {
          continue; // broken symlink, missing during walk, etc.
        }

        if (stat.isDirectory()) {
          // Only recurse into `public/` for now — that's where static
          // assets, logos, favicons, fonts live. Other root directories
          // are either excluded above or domain-specific and shouldn't
          // be auto-shipped.
          if (entry !== "public") continue;
          walkDir(abs, (absPath, relPath) => {
            // public/uploads/ is handled by the dedicated uploads/ section
            // above — skip it here to avoid duplication + checksum drift.
            if (relPath.startsWith("uploads/") || relPath === "uploads") return;
            const archivePath = `source/public/${relPath}`;
            const buf = readFileSync(absPath);
            checksums[archivePath] = sha256(buf);
            archive.file(absPath, { name: archivePath });
            stats.sourceFiles = (stats.sourceFiles ?? 0) + 1;
          });
        } else if (SOURCE_ROOT_FILES.has(entry)) {
          // Top-level whitelisted files: build.ts, package.json, lockfiles, tsconfig
          const archivePath = `source/${entry}`;
          const buf = readFileSync(abs);
          checksums[archivePath] = sha256(buf);
          archive.file(abs, { name: archivePath });
          stats.sourceFiles = (stats.sourceFiles ?? 0) + 1;
        }
        // Files NOT in SOURCE_ROOT_FILES are silently skipped — keeps the
        // archive minimal and predictable. Site-specific custom files at
        // project root (e.g. README.md, .env.example) are not transported
        // unless explicitly added to SOURCE_ROOT_FILES.
      }
    }

    archive.finalize();
  });

  // Deduplicate secrets
  const uniqueSecrets = [...new Set(secretsRequired)];

  const manifest: BeamManifest = {
    // F143 P2: bumped to 2 to signal source/ section presence. Receivers
    // on v1 still process the archive (unknown paths fall through the
    // import-side branch table to the "write to siteDir root" fallback).
    version: 2,
    beamId,
    sourceInstance: process.env.HOSTNAME || "localhost",
    exportedAt: new Date().toISOString(),
    site: {
      id: siteEntry?.id ?? "unknown",
      name: siteEntry?.name ?? siteName,
      adapter: (siteEntry?.adapter as "filesystem" | "github") ?? "filesystem",
    },
    stats,
    checksums,
    secretsRequired: uniqueSecrets,
  };

  // Prepend manifest to the archive (rewrite with manifest as first entry)
  // Actually, we need to inject manifest into the already-written ZIP.
  // Simpler: write manifest as a sidecar JSON file, and also inject it into the ZIP.
  // Since archive is finalized, let's write it alongside.
  // Better approach: build manifest before finalize. But we need checksums from all files.
  // Solution: re-open archive and add manifest. archiver doesn't support this.
  // Pragmatic solution: write manifest.json next to .beam file, and include
  // the manifest inside the archive by creating a second pass.
  //
  // Actually, the simplest approach: we already computed everything.
  // Let's create the archive in two phases: content first in a temp,
  // then final archive with manifest.
  //
  // Even simpler: use JSZip to add the manifest to the existing ZIP.
  const JSZip = (await import("jszip")).default;
  const zipBuf = readFileSync(filePath);
  const zip = await JSZip.loadAsync(zipBuf);
  const manifestJson = JSON.stringify(manifest, null, 2);
  zip.file("manifest.json", manifestJson);
  const finalBuf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const { writeFileSync } = await import("node:fs");
  writeFileSync(filePath, finalBuf);

  return { filePath, fileName, manifest };
}

// ── Helpers ──

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function walkDir(dir: string, cb: (absPath: string, relPath: string) => void, prefix = "") {
  for (const entry of readdirSync(dir)) {
    const abs = path.join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      walkDir(abs, cb, rel);
    } else {
      cb(abs, rel);
    }
  }
}

/**
 * Strip secret values from an object, replacing with BEAM_REDACTED.
 * Returns list of secret field names that were found and stripped.
 */
function stripSecrets(obj: Record<string, unknown>, fields: string[]): string[] {
  const found: string[] = [];
  for (const field of fields) {
    if (field in obj && obj[field] && obj[field] !== "" && obj[field] !== BEAM_REDACTED) {
      // For arrays of objects (e.g. mcp-keys.json has [{key: "..."}])
      if (Array.isArray(obj[field])) {
        for (const item of obj[field] as Record<string, unknown>[]) {
          if (typeof item === "object" && item && field in item && item[field]) {
            item[field] = BEAM_REDACTED;
            found.push(field.toUpperCase());
          }
        }
      } else {
        obj[field] = BEAM_REDACTED;
        found.push(field.toUpperCase());
      }
    }
  }
  return found;
}
