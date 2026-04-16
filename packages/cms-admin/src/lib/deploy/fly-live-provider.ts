/**
 * Fly Live deploy provider — incremental content sync via HMAC-signed endpoints.
 *
 * Two modes:
 *   1. Infrastructure setup (first deploy or explicit rebuild): create Fly app,
 *      volume, secret, push Docker image with sync-endpoint server.
 *   2. Content sync (every subsequent deploy): build site → diff manifest →
 *      push only changed files to the running container. Typical edit < 1 s.
 *
 * Auth scheme: HMAC-SHA256 over `${ts}\n${method}\n${pathWithQuery}\n${sha256(body)}`.
 * Matches packages/cms-admin/src/lib/deploy/fly-live-assets/server.ts:verifyAuth.
 */

import { createHash, createHmac, randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

export interface FlyLiveConfig {
  appName: string;
  region: string;
  volumeName: string;
  syncSecret: string;
  customDomain?: string;
}

export interface FlyLiveDeployResult {
  url: string;
  mode: "initial" | "sync" | "rebuild";
  filesUploaded: number;
  filesRemoved: number;
  filesUnchanged: number;
  durationMs: number;
  serverVersion?: string;
}

const CLIENT_EXPECTED_SERVER_VERSION = "1.0.0";
const DEFAULT_TIMEOUT = 30000;

// ── Public entry points ───────────────────────────────────────────────────

/**
 * Full deploy flow. If infrastructure isn't up, provisions it first.
 * Returns URL + details of what was synced.
 */
export async function flyLiveDeploy(
  token: string,
  config: FlyLiveConfig,
  deployDir: string,
  opts?: { forceRebuildInfra?: boolean },
): Promise<FlyLiveDeployResult> {
  const start = Date.now();
  const appUrl = config.customDomain ? `https://${config.customDomain}` : `https://${config.appName}.fly.dev`;

  let mode: "initial" | "sync" | "rebuild" = "sync";
  let serverVersion: string | undefined;

  // Check if infrastructure is up
  let infraHealthy = false;
  if (!opts?.forceRebuildInfra) {
    try {
      const health = await icdHealth(appUrl, config.syncSecret);
      serverVersion = health.version;
      infraHealthy = health.version === CLIENT_EXPECTED_SERVER_VERSION;
      if (!infraHealthy) {
        console.log(`[fly-live] Server version mismatch: got ${health.version}, expected ${CLIENT_EXPECTED_SERVER_VERSION} — rebuilding infra`);
      }
    } catch (err) {
      console.log(`[fly-live] No healthy infra (${(err as Error).message}) — provisioning`);
      infraHealthy = false;
    }
  }

  if (!infraHealthy) {
    await ensureInfrastructure(token, config);
    await waitForIcdHealth(appUrl, config.syncSecret);
    mode = opts?.forceRebuildInfra ? "rebuild" : "initial";
  }

  // Always: content sync
  const sync = await syncContent(appUrl, config.syncSecret, deployDir);

  return {
    url: appUrl,
    mode,
    filesUploaded: sync.uploaded,
    filesRemoved: sync.removed,
    filesUnchanged: sync.unchanged,
    durationMs: Date.now() - start,
    serverVersion,
  };
}

/**
 * Explicit infrastructure rebuild. Useful when the sync-endpoint server has
 * been upgraded in a new cms-admin release. Preserves volume data.
 */
export async function flyLiveRebuildInfra(token: string, config: FlyLiveConfig): Promise<void> {
  await ensureInfrastructure(token, config, { force: true });
  const appUrl = config.customDomain ? `https://${config.customDomain}` : `https://${config.appName}.fly.dev`;
  await waitForIcdHealth(appUrl, config.syncSecret);
}

/**
 * Generate a fresh HMAC secret (64 hex chars). Called on first deploy if
 * the site config doesn't have one yet.
 */
export function generateSyncSecret(): string {
  return randomBytes(32).toString("hex");
}

// ── Infrastructure provisioning ───────────────────────────────────────────

async function ensureInfrastructure(
  token: string,
  config: FlyLiveConfig,
  opts?: { force?: boolean },
): Promise<void> {
  assertFlyctl();

  const { appName, region, volumeName, syncSecret } = config;
  const org = resolveFlyOrg(token);

  // Ensure app exists
  try {
    runFlyctl(["status", "--app", appName], token);
    console.log(`[fly-live] App ${appName} exists`);
  } catch {
    console.log(`[fly-live] Creating app ${appName} in org ${org}...`);
    runFlyctl(["apps", "create", appName, "--org", org], token);
  }

  // Set sync secret (idempotent — flyctl replaces)
  console.log(`[fly-live] Setting SYNC_SECRET...`);
  runFlyctl(["secrets", "set", `SYNC_SECRET=${syncSecret}`, "--app", appName, "--stage"], token);

  // Ensure volume exists
  let volumeExists = false;
  try {
    const out = runFlyctl(["volumes", "list", "--app", appName, "--json"], token);
    const volumes = JSON.parse(out) as Array<{ name: string }>;
    volumeExists = volumes.some((v) => v.name === volumeName);
  } catch {
    volumeExists = false;
  }
  if (!volumeExists) {
    console.log(`[fly-live] Creating volume ${volumeName} (1gb, ${region})...`);
    runFlyctl(
      ["volumes", "create", volumeName, "--app", appName, "--region", region, "--size", "1", "--yes"],
      token,
    );
  }

  // Build temp deploy context from bundled assets
  const assetsDir = path.join(__dirname, "fly-live-assets");
  if (!existsSync(assetsDir)) {
    throw new Error(`fly-live-assets directory missing at ${assetsDir} — cms-admin bundle is corrupt`);
  }
  const tmpDir = path.join("/tmp", `fly-live-deploy-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  cpSync(path.join(assetsDir, "server.ts"), path.join(tmpDir, "server.ts"));
  cpSync(path.join(assetsDir, "Dockerfile"), path.join(tmpDir, "Dockerfile"));
  if (existsSync(path.join(assetsDir, ".dockerignore"))) {
    cpSync(path.join(assetsDir, ".dockerignore"), path.join(tmpDir, ".dockerignore"));
  }
  const flyTomlTemplate = readFileSync(path.join(assetsDir, "fly.toml.template"), "utf-8");
  const flyToml = flyTomlTemplate
    .replace(/\{\{APP_NAME\}\}/g, appName)
    .replace(/\{\{REGION\}\}/g, region)
    .replace(/\{\{VOLUME_NAME\}\}/g, volumeName);
  writeFileSync(path.join(tmpDir, "fly.toml"), flyToml);

  // Deploy via flyctl (remote builder)
  console.log(`[fly-live] Deploying sync-endpoint image to Fly...`);
  try {
    runFlyctl(["deploy", "--remote-only", "--ha=false"], token, { cwd: tmpDir, timeoutMs: 180000 });
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }
  }

  // Custom domain
  if (config.customDomain) {
    try {
      runFlyctl(["certs", "add", config.customDomain, "--app", appName], token);
    } catch { /* cert may already exist */ }
  }

  console.log(`[fly-live] Infrastructure ready at https://${appName}.fly.dev`);
  void opts;
}

function resolveFlyOrg(token: string): string {
  try {
    const out = runFlyctl(["orgs", "list", "--json"], token, { timeoutMs: 10000 });
    const orgsMap = JSON.parse(out) as Record<string, string>;
    const slugs = Object.keys(orgsMap);
    return slugs.find((s) => s !== "personal") ?? slugs[0] ?? "personal";
  } catch {
    return "personal";
  }
}

function assertFlyctl(): void {
  try {
    execFileSync("flyctl", ["version"], { stdio: "pipe", timeout: 5000 });
  } catch {
    throw new Error("flyctl CLI not found. Install it: curl -L https://fly.io/install.sh | sh");
  }
}

function runFlyctl(
  args: string[],
  token: string,
  opts?: { cwd?: string; timeoutMs?: number },
): string {
  try {
    return execFileSync("flyctl", args, {
      env: { ...process.env, FLY_API_TOKEN: token },
      cwd: opts?.cwd,
      timeout: opts?.timeoutMs ?? 30000,
      stdio: "pipe",
    }).toString();
  } catch (err) {
    const stderr = (err as Error & { stderr?: Buffer }).stderr?.toString() ?? "";
    const msg = stderr.slice(0, 300) || (err as Error).message;
    throw new Error(`flyctl ${args[0]} failed: ${msg}`);
  }
}

// ── Content sync ──────────────────────────────────────────────────────────

export async function syncContent(
  appUrl: string,
  secret: string,
  localDir: string,
): Promise<{ uploaded: number; removed: number; unchanged: number; deployId: string }> {
  // 1. Build local manifest
  const local = await buildManifest(localDir);

  // 2. Fetch remote manifest
  const remote = await icdGet<{ deployId: string | null; files: Record<string, string> }>(
    appUrl,
    secret,
    "/_icd/manifest",
  );

  // 3. Diff
  const diff = diffManifests(local, remote.files);
  console.log(
    `[fly-live] Diff: ${diff.added.length} added, ${diff.changed.length} changed, ${diff.removed.length} removed, ${diff.unchanged} unchanged`,
  );

  // 4. Short-circuit if nothing to do
  if (diff.added.length === 0 && diff.changed.length === 0 && diff.removed.length === 0) {
    return { uploaded: 0, removed: 0, unchanged: diff.unchanged, deployId: remote.deployId ?? "" };
  }

  // 5. Begin deploy
  const begin = await icdPost<{ deployId: string }>(appUrl, secret, "/_icd/deploys", new Uint8Array());
  const deployId = begin.deployId;

  // 6. Push changed + added
  const toUpload = [...diff.added, ...diff.changed];
  for (const rel of toUpload) {
    const full = path.join(localDir, rel);
    const body = new Uint8Array(await readFile(full));
    await icdPut(appUrl, secret, `/_icd/deploys/${deployId}/files?path=${encodeURIComponent(rel)}`, body);
  }

  // 7. Delete removed
  for (const rel of diff.removed) {
    await icdDelete(appUrl, secret, `/_icd/deploys/${deployId}/files?path=${encodeURIComponent(rel)}`);
  }

  // 8. Commit — atomic symlink swap on the server
  await icdPost(appUrl, secret, `/_icd/deploys/${deployId}/commit`, new Uint8Array());

  return {
    uploaded: toUpload.length,
    removed: diff.removed.length,
    unchanged: diff.unchanged,
    deployId,
  };
}

async function buildManifest(rootDir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await walk(rootDir, rootDir, out);
  return out;
}

async function walk(rootDir: string, dir: string, out: Record<string, string>) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(rootDir, full, out);
    } else if (entry.isFile()) {
      const rel = path.relative(rootDir, full).split(path.sep).join("/");
      const bytes = await readFile(full);
      out[rel] = createHash("sha256").update(bytes).digest("hex");
    }
  }
  void stat;
}

export function diffManifests(
  local: Record<string, string>,
  remote: Record<string, string>,
): { added: string[]; changed: string[]; removed: string[]; unchanged: number } {
  const added: string[] = [];
  const changed: string[] = [];
  let unchanged = 0;

  for (const [relPath, hash] of Object.entries(local)) {
    const remoteHash = remote[relPath];
    if (!remoteHash) added.push(relPath);
    else if (remoteHash !== hash) changed.push(relPath);
    else unchanged++;
  }
  const removed = Object.keys(remote).filter((r) => !(r in local));
  return { added, changed, removed, unchanged };
}

// ── HMAC-signed HTTP client ───────────────────────────────────────────────

export function signIcdRequest(
  method: string,
  pathWithQuery: string,
  body: Uint8Array,
  secret: string,
): { timestamp: string; signature: string } {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const payload = `${timestamp}\n${method.toUpperCase()}\n${pathWithQuery}\n${bodyHash}`;
  const hmac = createHmac("sha256", secret).update(payload).digest("hex");
  return { timestamp, signature: `sha256=${hmac}` };
}

async function icdFetch(
  method: string,
  appUrl: string,
  secret: string,
  pathWithQuery: string,
  body: Uint8Array,
): Promise<Response> {
  const { timestamp, signature } = signIcdRequest(method, pathWithQuery, body, secret);
  const url = appUrl.replace(/\/+$/, "") + pathWithQuery;
  const res = await fetch(url, {
    method,
    headers: {
      "X-CMS-Timestamp": timestamp,
      "X-CMS-Signature": signature,
      "Content-Type": "application/octet-stream",
    },
    body: method === "GET" || method === "HEAD" ? undefined : (body as unknown as BodyInit),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ICD ${method} ${pathWithQuery} failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return res;
}

async function icdGet<T>(appUrl: string, secret: string, pathWithQuery: string): Promise<T> {
  const res = await icdFetch("GET", appUrl, secret, pathWithQuery, new Uint8Array());
  return (await res.json()) as T;
}

async function icdPost<T>(
  appUrl: string,
  secret: string,
  pathWithQuery: string,
  body: Uint8Array,
): Promise<T> {
  const res = await icdFetch("POST", appUrl, secret, pathWithQuery, body);
  const ct = res.headers.get("content-type") ?? "";
  return ct.includes("application/json") ? ((await res.json()) as T) : ({} as T);
}

async function icdPut(
  appUrl: string,
  secret: string,
  pathWithQuery: string,
  body: Uint8Array,
): Promise<void> {
  await icdFetch("PUT", appUrl, secret, pathWithQuery, body);
}

async function icdDelete(appUrl: string, secret: string, pathWithQuery: string): Promise<void> {
  await icdFetch("DELETE", appUrl, secret, pathWithQuery, new Uint8Array());
}

async function icdHealth(appUrl: string, secret: string): Promise<{ ok: boolean; version: string }> {
  return icdGet(appUrl, secret, "/_icd/health");
}

async function waitForIcdHealth(appUrl: string, secret: string, maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const h = await icdHealth(appUrl, secret);
      if (h.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Sync endpoint did not come online within ${maxAttempts * 2}s`);
}
