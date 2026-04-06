/**
 * Clone Site — full filesystem copy of a site with secret stripping.
 *
 * Used by the "Clone site" action in the Sites list. Creates a complete
 * independent copy of a filesystem site including content, media,
 * cms.config.ts, and _data/ (with secrets stripped). The new site is
 * registered in the same org as the source.
 *
 * GitHub-backed sites are not supported (clone would require creating
 * a new repo, which is a more involved flow).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { loadRegistry, addSite, type SiteEntry } from "./site-registry";
import { SECRET_FIELDS, BEAM_REDACTED, EXCLUDED_DATA_DIRS } from "./beam/types";

const EXCLUDED_DATA_FILES = new Set([
  "backups",          // too large
  "deploy-log.json",  // not portable
  "beam-tmp",         // temp
  "beam-tokens.json", // single-use tokens
  "beam-sessions",    // ephemeral
  "user-state",       // per-user, ephemeral
  "webhook-deliveries.jsonl",
  "notification-log.jsonl",
]);

export interface CloneOptions {
  /** Source site ID to clone from */
  sourceSiteId: string;
  /** Target org ID (defaults to source's org) */
  targetOrgId?: string;
  /** New site name (e.g. "Agentic CMS Demo") */
  newName: string;
  /** Optional new site ID (auto-generated from name if not set) */
  newSiteId?: string;
}

export interface CloneResult {
  siteId: string;
  siteName: string;
  projectDir: string;
  filesCount: number;
  totalSizeBytes: number;
}

/**
 * Clone a filesystem-backed site.
 *
 * 1. Find source site in registry
 * 2. Copy entire project directory to a new sibling location
 * 3. Strip secrets in _data/{site-config,ai-config,mcp-keys}.json
 * 4. Remove ephemeral _data subdirs (backups, user-state, etc.)
 * 5. Register new site in target org
 */
export async function cloneSite(options: CloneOptions): Promise<CloneResult> {
  const { sourceSiteId, newName } = options;

  // ── 1. Find source site ──
  const registry = await loadRegistry();
  if (!registry) {
    throw new Error("No registry — single-site mode does not support cloning");
  }

  let sourceOrg = null;
  let sourceSite: SiteEntry | null = null;
  for (const org of registry.orgs) {
    const site = org.sites.find((s) => s.id === sourceSiteId);
    if (site) {
      sourceOrg = org;
      sourceSite = site;
      break;
    }
  }

  if (!sourceSite || !sourceOrg) {
    throw new Error(`Site "${sourceSiteId}" not found`);
  }

  if (sourceSite.adapter !== "filesystem") {
    throw new Error("Only filesystem-backed sites can be cloned");
  }

  const targetOrgId = options.targetOrgId ?? sourceOrg.id;

  // ── 2. Determine source + target paths ──
  const sourceConfigPath = path.resolve(sourceSite.configPath);
  if (!existsSync(sourceConfigPath)) {
    throw new Error(`Source config not found: ${sourceConfigPath}`);
  }
  const sourceDir = path.dirname(sourceConfigPath);

  // Generate new site ID + slug
  const slug = newName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || `cloned-${Date.now()}`;
  const newSiteId = options.newSiteId ?? slug;

  // Check for duplicate ID across all orgs
  for (const org of registry.orgs) {
    if (org.sites.some((s) => s.id === newSiteId)) {
      throw new Error(`Site ID "${newSiteId}" already exists`);
    }
  }

  // Target dir: sibling of source with the new slug
  const sourceParent = path.dirname(sourceDir);
  const targetDir = path.join(sourceParent, slug);

  if (existsSync(targetDir)) {
    throw new Error(`Target directory already exists: ${targetDir}`);
  }

  // ── 3. Copy directory tree ──
  let filesCount = 0;
  let totalSizeBytes = 0;

  function copyTree(src: string, dst: string, relPath = "") {
    mkdirSync(dst, { recursive: true });
    for (const entry of readdirSync(src)) {
      // Skip ephemeral / sensitive _data subdirs at the right level
      if (relPath === "_data" && EXCLUDED_DATA_FILES.has(entry)) continue;
      if (relPath === "_data" && EXCLUDED_DATA_DIRS.has(entry)) continue;
      // Skip Next.js / build artifacts
      if (entry === "node_modules" || entry === ".next" || entry === "dist" || entry === ".cache") continue;
      // Skip git
      if (entry === ".git") continue;

      const srcPath = path.join(src, entry);
      const dstPath = path.join(dst, entry);
      const stat = statSync(srcPath);

      if (stat.isDirectory()) {
        copyTree(srcPath, dstPath, relPath ? `${relPath}/${entry}` : entry);
      } else {
        copyFileSync(srcPath, dstPath);
        filesCount++;
        totalSizeBytes += stat.size;
      }
    }
  }

  try {
    copyTree(sourceDir, targetDir);
  } catch (err) {
    // Clean up partial copy on error
    try { rmSync(targetDir, { recursive: true, force: true }); } catch { /* ignore */ }
    throw err;
  }

  // Symlink node_modules from source so cms.config.ts imports resolve.
  // This is necessary because jiti loads the cloned cms.config.ts which
  // imports from "@webhouse/cms" — without node_modules the layout crashes.
  const sourceNodeModules = path.join(sourceDir, "node_modules");
  const targetNodeModules = path.join(targetDir, "node_modules");
  if (existsSync(sourceNodeModules) && !existsSync(targetNodeModules)) {
    try {
      symlinkSync(sourceNodeModules, targetNodeModules, "dir");
    } catch { /* non-fatal — user can run pnpm install in target dir */ }
  }

  // ── 4. Strip secrets in _data ──
  const targetDataDir = path.join(targetDir, "_data");
  if (existsSync(targetDataDir)) {
    for (const [filename, fields] of Object.entries(SECRET_FIELDS)) {
      const filePath = path.join(targetDataDir, filename);
      if (!existsSync(filePath)) continue;
      try {
        const obj = JSON.parse(readFileSync(filePath, "utf-8"));
        for (const field of fields) {
          if (Array.isArray(obj[field])) {
            for (const item of obj[field] as Record<string, unknown>[]) {
              if (typeof item === "object" && item && field in item && item[field]) {
                item[field] = BEAM_REDACTED;
              }
            }
          } else if (field in obj && obj[field] && obj[field] !== "") {
            obj[field] = BEAM_REDACTED;
          }
        }
        writeFileSync(filePath, JSON.stringify(obj, null, 2));
      } catch { /* not JSON, skip */ }
    }
  }

  // ── 5. Register the new site ──
  const newConfigPath = path.join(targetDir, path.basename(sourceConfigPath));

  // Try to derive contentDir / uploadDir relative to new project dir
  const newContentDir = path.join(targetDir, "content");
  const newUploadDir = path.join(targetDir, "public", "uploads");

  await addSite(targetOrgId, {
    id: newSiteId,
    name: newName,
    adapter: "filesystem",
    configPath: newConfigPath,
    ...(existsSync(newContentDir) ? { contentDir: newContentDir } : {}),
    ...(existsSync(newUploadDir) ? { uploadDir: newUploadDir } : {}),
  });

  return {
    siteId: newSiteId,
    siteName: newName,
    projectDir: targetDir,
    filesCount,
    totalSizeBytes,
  };
}
