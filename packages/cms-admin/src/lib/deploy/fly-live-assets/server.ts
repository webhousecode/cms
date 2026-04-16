// Fly Live sync-endpoint server. Runs inside the Docker image.
// Serves static files from /srv/current AND handles HMAC-signed /_icd/* endpoints.
//
// Admin-side client: deploy-service.ts → flyLiveBuildAndDeploy()
// Auth scheme: HMAC-SHA256 over `${timestamp}\n${method}\n${pathWithQuery}\n${sha256(body)}`.
// Atomic deploys: staging dir under /srv/deploys/<id>/, symlink swap at /srv/current.

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  access,
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const SERVER_VERSION = "1.0.0";
const PORT = Number(process.env.PORT || 8080);
const DATA_ROOT = process.env.SITE_DATA_ROOT || "/srv";
const CURRENT = join(DATA_ROOT, "current");
const DEPLOYS = join(DATA_ROOT, "deploys");
const SYNC_SECRET = process.env.SYNC_SECRET;
const MAX_SKEW_SECONDS = 300;
const KEEP_DEPLOYS = 5;

if (!SYNC_SECRET) {
  console.error("[fly-live] SYNC_SECRET env var is required");
  process.exit(1);
}

await ensureDirs();

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname.startsWith("/_icd/")) {
      return handleIcd(req, url);
    }

    return serveStatic(url.pathname);
  },
  error(err) {
    console.error("[fly-live] server error", err);
    return new Response("Internal error", { status: 500 });
  },
});

console.log(`[fly-live] v${SERVER_VERSION} listening on :${PORT} (data root: ${DATA_ROOT})`);

// ─── HTTP handlers ────────────────────────────────────────────────────────────

async function handleIcd(req: Request, url: URL): Promise<Response> {
  const body = req.method === "GET" || req.method === "HEAD" ? new Uint8Array() : new Uint8Array(await req.arrayBuffer());
  const authErr = verifyAuth(req, url, body);
  if (authErr) return authErr;

  // GET /_icd/health
  if (req.method === "GET" && url.pathname === "/_icd/health") {
    return json({ ok: true, version: SERVER_VERSION });
  }

  // GET /_icd/manifest
  if (req.method === "GET" && url.pathname === "/_icd/manifest") {
    const files = await buildManifest(CURRENT);
    const deployId = await readCurrentDeployId();
    return json({ deployId, files });
  }

  // POST /_icd/deploys  → { deployId }
  if (req.method === "POST" && url.pathname === "/_icd/deploys") {
    const deployId = await beginDeploy();
    return json({ deployId });
  }

  // PUT /_icd/deploys/:id/files?path=X
  const putMatch = url.pathname.match(/^\/_icd\/deploys\/([\w-]+)\/files$/);
  if (putMatch && req.method === "PUT") {
    const deployId = putMatch[1]!;
    const relPath = url.searchParams.get("path");
    if (!relPath) return json({ error: "path query param required" }, 400);
    const err = await writeDeployFile(deployId, relPath, body);
    return err ?? json({ ok: true });
  }

  // DELETE /_icd/deploys/:id/files?path=X
  if (putMatch && req.method === "DELETE") {
    const deployId = putMatch[1]!;
    const relPath = url.searchParams.get("path");
    if (!relPath) return json({ error: "path query param required" }, 400);
    const err = await deleteDeployFile(deployId, relPath);
    return err ?? json({ ok: true });
  }

  // POST /_icd/deploys/:id/commit
  const commitMatch = url.pathname.match(/^\/_icd\/deploys\/([\w-]+)\/commit$/);
  if (commitMatch && req.method === "POST") {
    const deployId = commitMatch[1]!;
    const err = await commitDeploy(deployId);
    return err ?? json({ ok: true, deployId });
  }

  // DELETE /_icd/deploys/:id
  const abortMatch = url.pathname.match(/^\/_icd\/deploys\/([\w-]+)$/);
  if (abortMatch && req.method === "DELETE") {
    const deployId = abortMatch[1]!;
    await abortDeploy(deployId);
    return json({ ok: true });
  }

  // POST /_icd/rollback  { deployId? }
  if (req.method === "POST" && url.pathname === "/_icd/rollback") {
    try {
      const { deployId } = body.length > 0 ? JSON.parse(new TextDecoder().decode(body)) : {};
      const picked = await rollback(deployId);
      return json({ ok: true, deployId: picked });
    } catch (e) {
      return json({ error: String((e as Error).message) }, 400);
    }
  }

  return json({ error: "not found" }, 404);
}

async function serveStatic(pathname: string): Promise<Response> {
  let rel = decodeURIComponent(pathname.replace(/^\/+/, ""));
  if (rel === "") rel = "index.html";

  // Path traversal guard
  const full = resolve(CURRENT, rel);
  if (!full.startsWith(resolve(CURRENT) + "/") && full !== resolve(CURRENT)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const s = await stat(full);
    if (s.isDirectory()) {
      const idx = join(full, "index.html");
      try {
        await access(idx);
        return fileResponse(idx);
      } catch {
        return new Response("Not found", { status: 404 });
      }
    }
    return fileResponse(full);
  } catch {
    // Try .html fallback for clean URLs
    try {
      const htmlFallback = `${full}.html`;
      await access(htmlFallback);
      return fileResponse(htmlFallback);
    } catch {
      // 404 page if present
      try {
        const fourOhFour = join(CURRENT, "404.html");
        await access(fourOhFour);
        return fileResponse(fourOhFour, 404);
      } catch {
        return new Response("Not found", { status: 404 });
      }
    }
  }
}

function fileResponse(fullPath: string, status = 200): Response {
  const file = Bun.file(fullPath);
  return new Response(file, { status });
}

// ─── HMAC auth ────────────────────────────────────────────────────────────────

function verifyAuth(req: Request, url: URL, body: Uint8Array): Response | null {
  const sig = req.headers.get("x-cms-signature");
  const ts = req.headers.get("x-cms-timestamp");
  if (!sig || !ts) return json({ error: "missing auth headers" }, 401);

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return json({ error: "bad timestamp" }, 401);
  const skew = Math.abs(Math.floor(Date.now() / 1000) - tsNum);
  if (skew > MAX_SKEW_SECONDS) return json({ error: "timestamp skew too large" }, 401);

  const bodyHash = createHash("sha256").update(body).digest("hex");
  const pathWithQuery = url.pathname + url.search;
  const payload = `${ts}\n${req.method}\n${pathWithQuery}\n${bodyHash}`;
  const expected = createHmac("sha256", SYNC_SECRET!).update(payload).digest("hex");
  const given = sig.replace(/^sha256=/, "");

  if (expected.length !== given.length) return json({ error: "invalid signature" }, 401);
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (!timingSafeEqual(a, b)) return json({ error: "invalid signature" }, 401);
  return null;
}

// ─── Manifest / diff ──────────────────────────────────────────────────────────

async function buildManifest(rootResolved: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    await walk(rootResolved, rootResolved, out);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  return out;
}

async function walk(rootResolved: string, dir: string, out: Record<string, string>) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
    throw e;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(rootResolved, full, out);
    } else if (entry.isFile()) {
      const rel = relative(rootResolved, full);
      const bytes = await readFile(full);
      out[rel] = createHash("sha256").update(bytes).digest("hex");
    }
  }
}

// ─── Deploy lifecycle ─────────────────────────────────────────────────────────

async function ensureDirs() {
  await mkdir(DEPLOYS, { recursive: true });
  // Bootstrap: if /srv/current does not exist, create an initial empty deploy
  try {
    await lstat(CURRENT);
  } catch {
    const initial = join(DEPLOYS, "initial");
    await mkdir(initial, { recursive: true });
    await writeFile(
      join(initial, "index.html"),
      '<!doctype html><meta charset="utf-8"><title>Awaiting first deploy</title><body style="font-family:system-ui;padding:2rem;color:#666"><h1>Fly Live — awaiting first content deploy</h1><p>CMS admin will push files here.</p></body>',
    );
    await symlink(initial, CURRENT);
  }
}

async function readCurrentDeployId(): Promise<string | null> {
  try {
    const target = await readlinkSafe(CURRENT);
    if (!target) return null;
    return target.split("/").pop() ?? null;
  } catch {
    return null;
  }
}

async function readlinkSafe(p: string): Promise<string | null> {
  try {
    // Bun + Node both expose readlink via fs/promises
    const { readlink } = await import("node:fs/promises");
    return await readlink(p);
  } catch {
    return null;
  }
}

async function beginDeploy(): Promise<string> {
  const id = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const dir = join(DEPLOYS, id);
  await mkdir(dir, { recursive: true });

  // Copy current tree as starting point. Use cp with hard-link-if-possible
  // to avoid doubling disk usage. On the same filesystem this is near-free.
  try {
    const currentTarget = await readlinkSafe(CURRENT);
    if (currentTarget) {
      const src = currentTarget.startsWith("/") ? currentTarget : join(DATA_ROOT, currentTarget);
      await cp(src, dir, { recursive: true, errorOnExist: false, force: true });
    }
  } catch (e) {
    // Empty start is fine
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("[fly-live] begin: could not copy current tree:", (e as Error).message);
    }
  }
  return id;
}

async function writeDeployFile(
  deployId: string,
  relPath: string,
  body: Uint8Array,
): Promise<Response | null> {
  const deployDir = join(DEPLOYS, deployId);
  if (!(await pathExists(deployDir))) {
    return json({ error: "deploy not found" }, 404);
  }
  const guarded = safeJoin(deployDir, relPath);
  if (!guarded) return json({ error: "path traversal rejected" }, 400);

  await mkdir(dirname(guarded), { recursive: true });
  // Atomic per-file: write to .tmp then rename.
  const tmp = `${guarded}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, body);
  await rename(tmp, guarded);
  return null;
}

async function deleteDeployFile(deployId: string, relPath: string): Promise<Response | null> {
  const deployDir = join(DEPLOYS, deployId);
  if (!(await pathExists(deployDir))) {
    return json({ error: "deploy not found" }, 404);
  }
  const guarded = safeJoin(deployDir, relPath);
  if (!guarded) return json({ error: "path traversal rejected" }, 400);
  try {
    await unlink(guarded);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  return null;
}

async function commitDeploy(deployId: string): Promise<Response | null> {
  const deployDir = join(DEPLOYS, deployId);
  if (!(await pathExists(deployDir))) {
    return json({ error: "deploy not found" }, 404);
  }
  // Atomic symlink swap: write new symlink to .new then rename over current.
  const tmpLink = `${CURRENT}.swap-${Date.now()}`;
  await symlink(deployDir, tmpLink);
  await rename(tmpLink, CURRENT);
  await pruneOldDeploys();
  return null;
}

async function abortDeploy(deployId: string): Promise<void> {
  const deployDir = join(DEPLOYS, deployId);
  await rm(deployDir, { recursive: true, force: true });
}

async function rollback(explicitId?: string): Promise<string | null> {
  const entries = await readdir(DEPLOYS, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort(); // timestamp-prefixed, lexical sort = chronological

  const currentId = await readCurrentDeployId();

  let target: string | null = null;
  if (explicitId) {
    if (!dirs.includes(explicitId)) throw new Error(`deploy ${explicitId} not found`);
    target = explicitId;
  } else {
    const idx = currentId ? dirs.indexOf(currentId) : -1;
    if (idx > 0) target = dirs[idx - 1] ?? null;
    else target = null;
  }
  if (!target) throw new Error("no previous deploy to roll back to");

  const tmpLink = `${CURRENT}.swap-${Date.now()}`;
  await symlink(join(DEPLOYS, target), tmpLink);
  await rename(tmpLink, CURRENT);
  return target;
}

async function pruneOldDeploys() {
  const entries = await readdir(DEPLOYS, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse(); // newest first
  const keep = new Set(dirs.slice(0, KEEP_DEPLOYS));
  const currentId = await readCurrentDeployId();
  if (currentId) keep.add(currentId);

  for (const name of dirs) {
    if (!keep.has(name)) {
      await rm(join(DEPLOYS, name), { recursive: true, force: true });
    }
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function safeJoin(root: string, rel: string): string | null {
  const full = resolve(root, rel);
  const rootRes = resolve(root);
  if (full === rootRes) return null;
  if (!full.startsWith(rootRes + "/")) return null;
  return full;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
