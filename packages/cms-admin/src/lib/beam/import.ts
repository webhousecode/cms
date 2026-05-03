/**
 * F122 — Beam Import Engine.
 *
 * Extracts a .beam archive (ZIP), validates manifest + checksums,
 * writes files to the target site directory, and registers the site.
 */
import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { addSite, loadRegistry, findSite } from "../site-registry";
import { SECRET_FIELDS, ORG_SETTINGS_SECRET_FIELDS, clearRedactedSecrets } from "./types";
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

  // Find a place for the site under the active project directory
  const { getBeamSitesDir } = await import("./paths");
  const sitesBaseDir = await getBeamSitesDir();
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
    } else if (relativePath.startsWith("source/")) {
      // F143 P2: strip the source/ namespace and write to siteDir root.
      // build.ts → siteDir/build.ts
      // source/public/logo.svg → siteDir/public/logo.svg
      // package.json → siteDir/package.json
      const stripped = relativePath.slice("source/".length);
      targetPath = path.join(siteDir, stripped);
      // sourceFiles stat — ensure object key exists for v2 manifests
      if (typeof stats.sourceFiles !== "number") stats.sourceFiles = 0;
      stats.sourceFiles++;
    } else {
      // Unknown path — write to site root
      targetPath = path.join(siteDir, relativePath);
    }

    // Ensure parent directory exists and write
    mkdirSync(path.dirname(targetPath), { recursive: true });

    // Strip BEAM_REDACTED placeholders from known secret-bearing JSON files before
    // writing to disk. The push side intentionally redacts secrets for transport;
    // leaving the placeholder strings on disk would let consumers (getApiKey, etc.)
    // treat "BEAM_REDACTED" as a real credential and call APIs with garbage,
    // surfacing as an opaque 401 instead of falling through to env-var fallback.
    const writeContent = scrubRedactedSecretFile(relativePath, content);
    writeFileSync(targetPath, writeContent);
  }

  // ── 4. Register site in registry ──
  const configFile = existsSync(path.join(siteDir, "cms.config.ts"))
    ? path.join(siteDir, "cms.config.ts")
    : path.join(siteDir, "cms.config.json");

  // If the imported config is missing a `storage` block, the @webhouse/cms
  // engine silently defaults to SQLite (stored in cwd-relative .cms/) — so the
  // site's content/ directory is never read or written, edits go to a phantom
  // SQLite db that disappears on container restart, and the site is broken in
  // a way that's only visible when you trace the create flow back to disk.
  // Patch in a filesystem-adapter block that matches the registry entry's
  // contentDir so the site works out-of-the-box after import.
  ensureStorageBlock(configFile);

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

/**
 * Patch a freshly-imported cms.config.{ts,json} to include an explicit
 * filesystem storage block if one is missing.
 *
 * Without storage in the config, @webhouse/cms.createCms falls back to SQLite,
 * which means the site's `content/` directory (the whole point of a beam
 * archive) is ignored at runtime. Edits then go to a transient SQLite file
 * the user can't find, and reads return empty. Detection is by substring on
 * the source — config is parsed by jiti at runtime, so we don't try to
 * roundtrip the AST here; if the file already mentions `storage:` we leave
 * it alone, otherwise we append a minimal block before the closing
 * `defineConfig({...})` so the import is usable as soon as it lands.
 */
function ensureStorageBlock(configFile: string): void {
  if (!existsSync(configFile)) return;
  let source: string;
  try {
    source = readFileSync(configFile, "utf-8");
  } catch {
    return;
  }

  // Already has any kind of storage configuration — assume the importer knew
  // what they wanted (filesystem, github, supabase, sqlite, …) and leave it.
  if (/\bstorage\s*:/.test(source)) return;

  const isJson = configFile.endsWith(".json");
  let patched: string | null = null;

  if (isJson) {
    try {
      const obj = JSON.parse(source) as Record<string, unknown>;
      if ("storage" in obj) return;
      obj.storage = { adapter: "filesystem", filesystem: { contentDir: "content" } };
      patched = JSON.stringify(obj, null, 2);
    } catch {
      return;
    }
  } else {
    // TS/JS config: insert before the final `});` of defineConfig.
    // Match the LAST `});` in the file — defineConfig is the outermost call.
    const closingMatch = source.match(/\n\s*\}\s*\)\s*;\s*$/);
    if (!closingMatch || closingMatch.index === undefined) return;
    const insertAt = closingMatch.index;
    const block =
      "\n  storage: {\n" +
      "    adapter: \"filesystem\",\n" +
      "    filesystem: {\n" +
      "      contentDir: \"content\",\n" +
      "    },\n" +
      "  },";
    patched = source.slice(0, insertAt) + block + source.slice(insertAt);
  }

  if (patched && patched !== source) {
    try { writeFileSync(configFile, patched, "utf-8"); } catch { /* non-fatal */ }
  }
}

/**
 * If `relativePath` matches a known secret-bearing JSON file in _data/, parse the
 * buffer, drop any field whose value is exactly "BEAM_REDACTED", and return the
 * re-serialised buffer. Returns the original buffer for unrelated files or on
 * parse failure (so binary/unknown files pass through untouched).
 */
function scrubRedactedSecretFile(relativePath: string, content: Buffer): Buffer {
  if (!relativePath.startsWith("_data/")) return content;
  const basename = path.basename(relativePath);
  const dataPath = relativePath.slice("_data/".length);

  let fields: readonly string[] | undefined = SECRET_FIELDS[basename];
  // Org settings live at _data/org-settings/<orgId>.json
  if (!fields && dataPath.startsWith("org-settings/") && basename.endsWith(".json")) {
    fields = ORG_SETTINGS_SECRET_FIELDS;
  }
  if (!fields) return content;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content.toString("utf-8"));
  } catch {
    return content;
  }
  if (!parsed || typeof parsed !== "object") return content;

  const changed = clearRedactedSecrets(parsed, fields);
  if (!changed) return content;
  return Buffer.from(JSON.stringify(parsed, null, 2), "utf-8");
}
