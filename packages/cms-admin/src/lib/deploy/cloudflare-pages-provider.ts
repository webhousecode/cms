/**
 * Cloudflare Pages (Direct Upload) deploy provider.
 *
 * Replaces the legacy `cloudflare` provider (which was only a generic webhook).
 * This one talks to the real Cloudflare Pages API:
 *   - POST /accounts/:id/pages/projects          (create project if missing)
 *   - POST /accounts/:id/pages/projects/:name/deployments  (multipart upload)
 *
 * Auth: Cloudflare API token with "Account:Cloudflare Pages:Edit" permission.
 * No wrangler CLI dependency — pure HTTP.
 *
 * Docs: https://developers.cloudflare.com/api/operations/pages-deployment-create-deployment
 */

import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

export interface CloudflarePagesConfig {
  accountId: string;
  projectName: string;
  apiToken: string;
  productionBranch?: string; // defaults to "main"
}

export interface CloudflarePagesDeployResult {
  url: string;
  deploymentId: string;
  filesUploaded: number;
  durationMs: number;
}

const API_BASE = "https://api.cloudflare.com/client/v4";

// ── Public entry point ────────────────────────────────────────────────────

export async function cloudflarePagesDeploy(
  config: CloudflarePagesConfig,
  localDir: string,
): Promise<CloudflarePagesDeployResult> {
  const start = Date.now();
  assertProjectSlug(config.projectName);

  // Ensure project exists (idempotent)
  await ensureProject(config);

  // Collect files for upload
  const files = await collectFiles(localDir);
  if (files.length === 0) {
    throw new Error("No files to deploy — the build directory is empty.");
  }

  // Create deployment via multipart form
  const deployment = await createDeployment(config, localDir, files);

  return {
    url: deployment.url,
    deploymentId: deployment.id,
    filesUploaded: files.length,
    durationMs: Date.now() - start,
  };
}

// ── Project management ────────────────────────────────────────────────────

async function ensureProject(config: CloudflarePagesConfig): Promise<void> {
  const { accountId, projectName, apiToken } = config;
  const getRes = await fetch(
    `${API_BASE}/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}`,
    {
      headers: { Authorization: `Bearer ${apiToken}` },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (getRes.ok) return;
  if (getRes.status !== 404) {
    const err = await getRes.text().catch(() => "");
    throw new Error(`Cloudflare Pages: fetching project failed (${getRes.status}): ${err.slice(0, 200)}`);
  }

  // Create — "Direct Upload" project type
  const createRes = await fetch(`${API_BASE}/accounts/${accountId}/pages/projects`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: projectName,
      production_branch: config.productionBranch ?? "main",
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!createRes.ok) {
    const err = await createRes.text().catch(() => "");
    throw new Error(`Cloudflare Pages: creating project failed (${createRes.status}): ${err.slice(0, 300)}`);
  }
  console.log(`[cloudflare-pages] Created project ${projectName}`);
}

// ── Deployment ────────────────────────────────────────────────────────────

async function createDeployment(
  config: CloudflarePagesConfig,
  rootDir: string,
  files: string[],
): Promise<{ id: string; url: string }> {
  const { accountId, projectName, apiToken } = config;

  // Cloudflare expects multipart/form-data with one part per file. In Node 20+
  // we can build a FormData with Blob parts from file bytes.
  const form = new FormData();
  let totalBytes = 0;
  for (const rel of files) {
    const full = path.join(rootDir, rel);
    const data = await readFileAsUint8Array(full);
    totalBytes += data.byteLength;
    // Cloudflare uses relative paths as field names with leading slash
    const fieldName = "/" + rel.split(path.sep).join("/");
    form.append(fieldName, new Blob([data as BlobPart]), rel);
  }
  console.log(`[cloudflare-pages] Uploading ${files.length} files (${Math.round(totalBytes / 1024)} KB)...`);

  const res = await fetch(
    `${API_BASE}/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}/deployments`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}` },
      body: form,
      signal: AbortSignal.timeout(300000), // 5 min
    },
  );
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Cloudflare Pages: deployment failed (${res.status}): ${err.slice(0, 400)}`);
  }

  const json = (await res.json()) as {
    result?: { id: string; url: string; aliases?: string[] };
    success: boolean;
    errors?: Array<{ message: string }>;
  };
  if (!json.success || !json.result) {
    const msg = json.errors?.map((e) => e.message).join("; ") ?? "unknown error";
    throw new Error(`Cloudflare Pages: deployment rejected: ${msg}`);
  }
  return {
    id: json.result.id,
    url: json.result.url,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function collectFiles(rootDir: string): Promise<string[]> {
  const out: string[] = [];
  await walk(rootDir, rootDir, out);
  return out;
}

async function walk(rootDir: string, dir: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(rootDir, full, out);
    } else if (entry.isFile()) {
      out.push(path.relative(rootDir, full));
    }
  }
  void stat;
}

async function readFileAsUint8Array(fullPath: string): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  await pipeline(createReadStream(fullPath), async function* (source) {
    for await (const chunk of source) chunks.push(chunk as Buffer);
  });
  return new Uint8Array(Buffer.concat(chunks));
}

function assertProjectSlug(name: string): void {
  // Cloudflare Pages project names: lowercase letters, digits, hyphens.
  if (!/^[a-z0-9]([a-z0-9-]{0,56}[a-z0-9])?$/.test(name)) {
    throw new Error(
      `Cloudflare Pages project name "${name}" is invalid. Use lowercase letters, digits, and hyphens (max 58 chars).`,
    );
  }
}
