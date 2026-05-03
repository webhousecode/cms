/**
 * F122 — Beam types.
 *
 * A .beam file is a ZIP archive containing a complete, portable site package.
 * Secrets are stripped on export and listed as required on import.
 */

export interface BeamManifest {
  /**
   * Archive format version.
   *   1 — initial F122 format (content + uploads + _data + cms.config)
   *   2 — F143 P2: adds `source/` section (build.ts, package.json, public/, etc.)
   *       so receiver can build the site without per-site node_modules.
   *       Backward-compatible: v1 receivers will fall through `source/`
   *       paths via the import-side fallback branch (write to siteDir root)
   *       without crashing, but the build won't work until receiver upgrades.
   */
  version: 1 | 2;
  /** Unique beam transfer ID */
  beamId: string;
  /** Source CMS instance (e.g. "localhost:3010") */
  sourceInstance: string;
  /** ISO timestamp of export */
  exportedAt: string;
  /** Site metadata */
  site: {
    id: string;
    name: string;
    adapter: "filesystem" | "github";
  };
  /** Content statistics */
  stats: {
    contentFiles: number;
    mediaFiles: number;
    dataFiles: number;
    /**
     * F143 P2 — count of source files (build.ts, package.json, public/, ...).
     * Optional for v1 archives; always present in v2.
     */
    sourceFiles?: number;
    totalSizeBytes: number;
    collections: Record<string, number>;
  };
  /** SHA-256 checksums per file path (relative to archive root) */
  checksums: Record<string, string>;
  /** List of secrets that must be configured manually after import */
  secretsRequired: string[];
}

export interface BeamExportResult {
  /** Absolute path to .beam file */
  filePath: string;
  /** Filename (e.g. "my-blog.beam") */
  fileName: string;
  /** Archive manifest */
  manifest: BeamManifest;
}

export interface BeamImportResult {
  /** Site ID (new or existing) */
  siteId: string;
  /** Site name */
  siteName: string;
  /** Import statistics */
  stats: BeamManifest["stats"];
  /** Secrets that need manual configuration */
  secretsRequired: string[];
  /** Number of files with checksum mismatches (0 = clean) */
  checksumErrors: number;
}

/** Fields in _data/ JSON files that contain secrets and must be redacted */
export const SECRET_FIELDS: Record<string, string[]> = {
  "site-config.json": [
    "deployApiToken",
    "deployHookUrl",
    "revalidateSecret",
    "calendarToken",
    "deployFlyLiveSyncSecret",
    "resendApiKey",
  ],
  "ai-config.json": [
    "anthropicApiKey",
    "openaiApiKey",
    // Both names kept: actual field is geminiApiKey; googleApiKey is legacy for any
    // older configs still on disk. Without geminiApiKey, push left real keys in plaintext.
    "geminiApiKey",
    "googleApiKey",
    "braveApiKey",
    "tavilyApiKey",
    "webSearchApiKey",
  ],
  "mcp-keys.json": ["key"],
};

/** Org-level settings file (path is _data/org-settings/<orgId>.json — match by basename prefix). */
export const ORG_SETTINGS_SECRET_FIELDS: string[] = [
  "deployApiToken",
  "deployGitHubToken",
  "deployVercelHookUrl",
  "deployNetlifyHookUrl",
  "deployCloudflareHookUrl",
  "aiAnthropicApiKey",
  "aiOpenaiApiKey",
  "aiGeminiApiKey",
  "aiBraveApiKey",
  "aiTavilyApiKey",
  "resendApiKey",
];

/** Placeholder value for stripped secrets */
export const BEAM_REDACTED = "BEAM_REDACTED";

/**
 * Strip BEAM_REDACTED placeholder values from a config object so callers fall back
 * to env vars or org-level values instead of using the placeholder string as a real
 * secret. Mutates the object in place; returns true if anything was cleared.
 *
 * Used on both the read path (defensive: legacy data on disk) and on beam-import
 * (preventive: never write placeholders to disk in the first place).
 */
export function clearRedactedSecrets(
  obj: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  let changed = false;
  for (const field of fields) {
    if (obj[field] === BEAM_REDACTED) {
      delete obj[field];
      changed = true;
    }
  }
  return changed;
}

/** Directories under _data/ to EXCLUDE from beam archive */
export const EXCLUDED_DATA_DIRS = new Set([
  "backups",
  "deploy-log.json",
]);

/**
 * F143 P2 — Directories at the project-root level to EXCLUDE when
 * beaming source files (build.ts, package.json, public/, ...). Each
 * receiver-side cms-admin re-installs deps via the build server (F143
 * Phase 3+), so per-site `node_modules` and per-site framework build
 * caches are pure transport waste.
 */
export const EXCLUDED_SOURCE_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  ".cache",
  "dist",
  "deploy",
  ".git",
  "_data",      // already beamed via dedicated _data/ section
  "_revisions", // local revision history, not portable
  "content",    // already beamed via dedicated content/ section (CMS API)
]);

/**
 * F143 P2 — Files at the project-root level to INCLUDE when beaming
 * source. The walker also descends into public/ recursively (excluding
 * public/uploads/ which is already covered by the dedicated uploads/
 * section in the archive).
 *
 * Multiple build entry-point names supported because some teams write
 * `build.ts`, others `build.mjs`, others a custom name. We pick whatever
 * matches; the build server runtime resolves the entry from cms.config
 * or defaults to "build.ts".
 */
export const SOURCE_ROOT_FILES = new Set([
  "build.ts",
  "build.mjs",
  "build.js",
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "tsconfig.json",
  "tsconfig.build.json",
  ".npmrc",
]);
