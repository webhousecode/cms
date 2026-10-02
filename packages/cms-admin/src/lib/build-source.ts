/**
 * F205.3 — build a site from its own repo, not from a stale copy on the volume.
 *
 * Measured 2026-10-02: trailmem.com was built from
 * /data/cms-admin/beam-sites/trail/build.ts, a Beam snapshot from May. trail's
 * pushes to broberg-ai/trail never reached it; the copy had drifted ~435 lines.
 *
 * When a site names a build source (repo + path + ref) in its site config, every
 * deploy first lays the repo's files for that path over the site's project
 * folder. Content stays where it is — the CMS owns it — so the overlay skips
 * everything the CMS writes at runtime. Nothing on the volume is ever deleted.
 */
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

export interface BuildSource {
  repo: string;
  path: string;
  ref: string;
}

/** The site-config fields, all three required; anything else means "not linked". */
export function buildSourceFrom(cfg: { buildSourceRepo?: string; buildSourcePath?: string; buildSourceRef?: string }): BuildSource | null {
  const repo = cfg.buildSourceRepo?.trim() ?? "";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return null;
  const p = (cfg.buildSourcePath ?? "").trim().replace(/^\/+|\/+$/g, "");
  if (p.split("/").includes("..")) return null;
  const ref = cfg.buildSourceRef?.trim() || "main";
  return { repo, path: p, ref };
}

/**
 * What the CMS writes at runtime (content, uploads, schema, revisions, build
 * output) or what must never come from git (env files, installed modules).
 * The overlay skips all of it — overwriting any of these would lose edits made
 * in the admin, or ship a secret.
 */
const SKIP_DIRS = ["content", "_data", "_revisions", "deploy", "dist", "node_modules", "public/uploads", ".git"];
const SKIP_FILES = ["cms.config.ts", "cms.config.json", "webhouse-schema.json"];

export function shouldSync(rel: string): boolean {
  if (!rel || rel.startsWith("/") || rel.split("/").some((s) => s === ".." || s === "")) return false;
  if (SKIP_FILES.includes(rel)) return false;
  if (SKIP_DIRS.some((d) => rel === d || rel.startsWith(d + "/"))) return false;
  const base = rel.split("/").pop()!;
  if (base.startsWith(".env")) return false;
  return true;
}

const MAX_FILES = 3000;
const MAX_BYTES = 60 * 1024 * 1024;

export interface SyncResult {
  sha: string;
  written: number;
  skipped: number;
}

/**
 * Fetch `src.path` at `src.ref` from GitHub and write it over `projectDir`.
 * Returns the commit sha that was built, so the deploy can say which one.
 */
export async function syncBuildSource(
  projectDir: string,
  src: BuildSource,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SyncResult> {
  const api = `https://api.github.com/repos/${src.repo}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
  const get = async (url: string) => {
    const res = await fetchImpl(url, { headers });
    if (!res.ok) throw new Error(`build source: GitHub ${res.status} for ${url.replace(api, src.repo)}`);
    return res.json();
  };

  const commit = (await get(`${api}/commits/${encodeURIComponent(src.ref)}`)) as { sha: string };
  const tree = (await get(`${api}/git/trees/${commit.sha}?recursive=1`)) as {
    truncated: boolean;
    tree: { path: string; type: string; mode: string; sha: string; size?: number }[];
  };
  // A truncated tree silently omits files — a partial overlay would build a
  // half-old site and report success. Refuse instead.
  if (tree.truncated) throw new Error("build source: repository tree too large (GitHub truncated it)");

  const prefix = src.path ? src.path + "/" : "";
  const root = path.resolve(projectDir);
  const files: { rel: string; sha: string }[] = [];
  let skipped = 0;
  let bytes = 0;
  for (const e of tree.tree) {
    if (e.type !== "blob" || !e.path.startsWith(prefix)) continue;
    // Symlinks (120000) could point outside the project folder.
    if (e.mode === "120000") { skipped++; continue; }
    const rel = e.path.slice(prefix.length);
    if (!shouldSync(rel)) { skipped++; continue; }
    const dest = path.resolve(root, rel);
    if (!dest.startsWith(root + path.sep)) { skipped++; continue; }
    files.push({ rel, sha: e.sha });
    bytes += e.size ?? 0;
  }
  if (files.length === 0) throw new Error(`build source: nothing to build under ${src.repo}/${src.path || "."} at ${src.ref}`);
  if (files.length > MAX_FILES || bytes > MAX_BYTES) {
    throw new Error(`build source: ${files.length} files / ${bytes} bytes exceeds the limit`);
  }

  // Download everything BEFORE writing anything: a failure halfway must not
  // leave the folder as a mix of two commits.
  const blobs = await Promise.all(
    files.map(async (f) => {
      const b = (await get(`${api}/git/blobs/${f.sha}`)) as { content: string; encoding: string };
      return { rel: f.rel, data: Buffer.from(b.content, b.encoding === "base64" ? "base64" : "utf8") };
    }),
  );
  for (const b of blobs) {
    const dest = path.join(root, b.rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, b.data);
  }
  return { sha: commit.sha, written: blobs.length, skipped };
}
