/**
 * F122 — Beam types.
 *
 * A .beam file is a ZIP archive containing a complete, portable site package.
 * Secrets are stripped on export and listed as required on import.
 */

export interface BeamManifest {
  /** Archive format version */
  version: 1;
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
  ],
  "ai-config.json": [
    "anthropicApiKey",
    "openaiApiKey",
    "googleApiKey",
  ],
  "mcp-keys.json": ["key"],
};

/** Placeholder value for stripped secrets */
export const BEAM_REDACTED = "BEAM_REDACTED";

/** Directories under _data/ to EXCLUDE from beam archive */
export const EXCLUDED_DATA_DIRS = new Set([
  "backups",
  "deploy-log.json",
]);
