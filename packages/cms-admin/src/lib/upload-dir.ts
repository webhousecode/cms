import path from "path";

/**
 * Resolves the upload directory.
 * In production/Docker: set UPLOAD_DIR env var.
 * In development: falls back to {cms-admin}/public/uploads.
 *
 * Uses process.cwd() which is reliable in Next.js (always the project root).
 */
export const UPLOAD_DIR: string =
  process.env.UPLOAD_DIR ??
  path.join(process.cwd(), "public", "uploads");

/**
 * Returns the safe absolute path for a file within UPLOAD_DIR.
 * Throws if the resolved path would escape UPLOAD_DIR (path traversal guard).
 *
 * @param segments — path segments relative to UPLOAD_DIR, e.g. ["folder", "file.jpg"]
 */
export function safeUploadPath(segments: string[]): string {
  // Sanitize each segment: strip ".." and leading slashes
  const clean = segments
    .map((s) => s.replace(/\.\./g, "").replace(/^[\\/]+/, "").trim())
    .filter(Boolean);
  const resolved = path.join(UPLOAD_DIR, ...clean);
  // Double-check it stays within UPLOAD_DIR
  if (!resolved.startsWith(UPLOAD_DIR + path.sep) && resolved !== UPLOAD_DIR) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}
