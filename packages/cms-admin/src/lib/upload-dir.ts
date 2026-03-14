import path from "path";
import { getActiveSitePaths } from "./site-paths";

/**
 * Resolves the upload directory for the currently active site.
 * In single-site mode: UPLOAD_DIR env var or {cwd}/public/uploads.
 * In multi-site mode: from site registry entry.
 */
export async function getUploadDir(): Promise<string> {
  const paths = await getActiveSitePaths();
  return paths.uploadDir;
}

/**
 * Legacy sync export — only works in single-site mode.
 * Kept for backwards compatibility during migration.
 */
export const UPLOAD_DIR: string =
  process.env.UPLOAD_DIR ??
  path.join(process.cwd(), "public", "uploads");

/**
 * Returns the safe absolute path for a file within the given upload dir.
 * Throws if the resolved path would escape the dir (path traversal guard).
 */
export function safeUploadPath(segments: string[], baseDir?: string): string {
  const dir = baseDir ?? UPLOAD_DIR;
  const clean = segments
    .map((s) => s.replace(/\.\./g, "").replace(/^[\\/]+/, "").trim())
    .filter(Boolean);
  const resolved = path.join(dir, ...clean);
  if (!resolved.startsWith(dir + path.sep) && resolved !== dir) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}
