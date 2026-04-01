/**
 * F122 — Beam Import Engine.
 *
 * Extracts a .beam archive (ZIP), validates manifest + checksums,
 * writes files to the target site directory, and registers the site.
 */
import { existsSync, mkdirSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { addSite, loadRegistry, findSite } from "../site-registry";
import type { BeamManifest, BeamImportResult } from "./types";

/**
 * Import a .beam archive into the CMS.
 *
 * @param archiveBuffer — Raw ZIP bytes (from upload or file read)
 * @param targetOrgId — Org to import into
 * @param options — Import options
 */
export async function importBeamArchive(
  archiveBuffer: Buffer,
  targetOrgId: string,
  options?: {
    /** Overwrite if site ID already exists */
    overwrite?: boolean;
    /** Use a different site ID (rename on import) */
    newSiteId?: string;
    /** Skip media files (faster for large sites) */
    skipMedia?: boolean;
  },
): Promise<BeamImportResult> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(archiveBuffer);

  // ── 1. Read and validate manifest ──
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    throw new Error("Invalid .beam archive: missing manifest.json");
  }
  const manifest: BeamManifest = JSON.parse(await manifestFile.async("string"));
  if (manifest.version !== 1) {
    throw new Error(`Unsupported beam version: ${manifest.version}`);
  }

  // ── 2. Determine site ID and target directory ──
  const siteId = options?.newSiteId ?? manifest.site.id ?? randomUUID();
  const siteName = manifest.site.name ?? "Imported Site";

  // Find a place for the site. Use CMS admin's working directory as base.
  const cmsAdminDir = process.cwd();
  const sitesBaseDir = path.join(cmsAdminDir, ".beam-sites");
  const siteDir = path.join(sitesBaseDir, siteId);

  // Check for existing site
  const registry = await loadRegistry();
  if (registry) {
    const existing = findSite(registry, targetOrgId, siteId);
    if (existing && !options?.overwrite) {
      throw new Error(`Site "${siteId}" already exists in org "${targetOrgId}". Use overwrite option.`);
    }
  }

  // Clean and create target directory
  if (existsSync(siteDir) && options?.overwrite) {
    rmSync(siteDir, { recursive: true, force: true });
  }
  mkdirSync(siteDir, { recursive: true });

  const contentDir = path.join(siteDir, "content");
  const uploadDir = path.join(siteDir, "public", "uploads");
  const dataDir = path.join(siteDir, "_data");
  mkdirSync(contentDir, { recursive: true });
  mkdirSync(uploadDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });

  // ── 3. Extract files and verify checksums ──
  let checksumErrors = 0;
  const stats = { ...manifest.stats, contentFiles: 0, mediaFiles: 0, dataFiles: 0 };

  for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue;
    if (relativePath === "manifest.json") continue;
    if (relativePath === "registry-entry.json") continue;

    // Skip media if requested
    if (options?.skipMedia && relativePath.startsWith("uploads/")) continue;

    const content = await zipEntry.async("nodebuffer");

    // Verify checksum
    if (manifest.checksums[relativePath]) {
      const actual = createHash("sha256").update(content).digest("hex");
      if (actual !== manifest.checksums[relativePath]) {
        console.warn(`[beam] Checksum mismatch: ${relativePath}`);
        checksumErrors++;
      }
    }

    // Determine target path
    let targetPath: string;
    if (relativePath.startsWith("content/")) {
      targetPath = path.join(siteDir, relativePath);
      stats.contentFiles++;
    } else if (relativePath.startsWith("uploads/")) {
      targetPath = path.join(siteDir, "public", relativePath);
      stats.mediaFiles++;
    } else if (relativePath.startsWith("_data/")) {
      targetPath = path.join(siteDir, relativePath);
      stats.dataFiles++;
    } else if (relativePath === "cms.config.ts" || relativePath === "cms.config.json") {
      targetPath = path.join(siteDir, relativePath);
    } else {
      // Unknown path — write to site root
      targetPath = path.join(siteDir, relativePath);
    }

    // Ensure parent directory exists and write
    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, content);
  }

  // ── 4. Register site in registry ──
  const configFile = existsSync(path.join(siteDir, "cms.config.ts"))
    ? path.join(siteDir, "cms.config.ts")
    : path.join(siteDir, "cms.config.json");

  await addSite(targetOrgId, {
    id: siteId,
    name: siteName,
    adapter: "filesystem",
    configPath: configFile,
    contentDir: contentDir,
    uploadDir: uploadDir,
  });

  return {
    siteId,
    siteName,
    stats,
    secretsRequired: manifest.secretsRequired,
    checksumErrors,
  };
}
