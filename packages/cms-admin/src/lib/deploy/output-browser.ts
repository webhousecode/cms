/**
 * Sandboxed read-only browser for the active site's `deploy/` output.
 *
 * Serves as visual confirmation that a build produced the expected
 * files. NEVER allows escape from `<projectDir>/deploy/` — the rel
 * argument is resolved + re-checked to live under the deploy root.
 *
 * Public API:
 *   - resolveDeployRoot()   → absolute path to the active site's deploy/
 *   - listDir(rel)          → entries one level deep
 *   - readFile(rel)         → { buffer, mime, sizeBytes }
 *   - getStats()            → totals for the deploy/ tree (count, size)
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { getActiveSitePaths } from "../site-paths";

export interface DeployEntry {
  name: string;
  type: "file" | "directory";
  /** Relative path from deploy/ root (without leading slash). */
  path: string;
  size?: number;
  mtime?: string;
}

export interface DeployStats {
  totalFiles: number;
  totalBytes: number;
  htmlPages: number;
  /** When the deploy directory itself was last modified (rough deploy time). */
  lastModified?: string;
}

export interface ReadFileResult {
  buffer: Buffer;
  mime: string;
  sizeBytes: number;
}

const MIME = new Map<string, string>([
  [".html", "text/html; charset=utf-8"],
  [".htm", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".mjs", "application/javascript; charset=utf-8"],
  [".json", "application/json"],
  [".xml", "application/xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
  [".ico", "image/x-icon"],
  [".webmanifest", "application/manifest+json"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB — preview ceiling, larger files refused

export async function resolveDeployRoot(): Promise<string> {
  const { projectDir } = await getActiveSitePaths();
  return path.join(projectDir, "deploy");
}

/**
 * Resolve a user-supplied rel path against the deploy root with strict
 * containment check. Returns the absolute path or throws on escape.
 */
function safeResolve(deployRoot: string, rel: string): string {
  const cleaned = (rel ?? "").replace(/^\/+/, "");
  const abs = path.resolve(deployRoot, cleaned);
  // Containment check: abs MUST start with deployRoot + path.sep (or equal it)
  const rootWithSep = deployRoot.endsWith(path.sep) ? deployRoot : deployRoot + path.sep;
  if (abs !== deployRoot && !abs.startsWith(rootWithSep)) {
    throw new Error(`Path escapes deploy root: ${rel}`);
  }
  return abs;
}

export async function listDir(rel = ""): Promise<DeployEntry[]> {
  const root = await resolveDeployRoot();
  if (!existsSync(root)) return [];
  const abs = safeResolve(root, rel);
  if (!existsSync(abs)) return [];
  let stat;
  try { stat = statSync(abs); } catch { return []; }
  if (!stat.isDirectory()) return [];

  const entries: DeployEntry[] = [];
  for (const name of readdirSync(abs)) {
    if (name.startsWith(".")) continue; // skip dotfiles (.git, .DS_Store, etc.)
    const childAbs = path.join(abs, name);
    let childStat;
    try { childStat = statSync(childAbs); } catch { continue; }
    const childRel = rel ? `${rel}/${name}` : name;
    entries.push({
      name,
      type: childStat.isDirectory() ? "directory" : "file",
      path: childRel,
      ...(childStat.isFile() && { size: childStat.size }),
      mtime: childStat.mtime.toISOString(),
    });
  }
  // Directories first, then files, both alphabetical
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

export async function readFile(rel: string): Promise<ReadFileResult | null> {
  const root = await resolveDeployRoot();
  if (!existsSync(root)) return null;
  const abs = safeResolve(root, rel);
  if (!existsSync(abs)) return null;
  let stat;
  try { stat = statSync(abs); } catch { return null; }
  if (!stat.isFile()) return null;
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(`File too large to preview (${stat.size} bytes > ${MAX_FILE_BYTES})`);
  }
  const buffer = readFileSync(abs);
  const ext = path.extname(abs).toLowerCase();
  const mime = MIME.get(ext) ?? "application/octet-stream";
  return { buffer, mime, sizeBytes: stat.size };
}

export async function getStats(): Promise<DeployStats> {
  const root = await resolveDeployRoot();
  if (!existsSync(root)) return { totalFiles: 0, totalBytes: 0, htmlPages: 0 };

  let totalFiles = 0;
  let totalBytes = 0;
  let htmlPages = 0;
  let lastModified: string | undefined;

  function walk(dir: string): void {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      if (name.startsWith(".")) continue;
      const abs = path.join(dir, name);
      let stat;
      try { stat = statSync(abs); } catch { continue; }
      if (stat.isDirectory()) walk(abs);
      else {
        totalFiles++;
        totalBytes += stat.size;
        if (name.endsWith(".html") || name.endsWith(".htm")) htmlPages++;
        const mt = stat.mtime.toISOString();
        if (!lastModified || mt > lastModified) lastModified = mt;
      }
    }
  }
  walk(root);
  return {
    totalFiles,
    totalBytes,
    htmlPages,
    ...(lastModified && { lastModified }),
  };
}
