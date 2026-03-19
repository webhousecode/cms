/**
 * Deploy service — trigger deploys via provider hooks/APIs.
 *
 * Supports: Vercel, Netlify, Fly.io, Cloudflare Pages, GitHub Pages, Custom webhook.
 * Deploy history stored in _data/deploy-log.json.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { getActiveSitePaths, getActiveSiteEntry } from "./site-paths";
import { readSiteConfig, writeSiteConfig } from "./site-config";
import { resolveToken } from "./site-pool";

export type DeployProvider = "off" | "vercel" | "netlify" | "flyio" | "cloudflare" | "github-pages" | "custom";

export interface DeployEntry {
  id: string;
  provider: DeployProvider;
  status: "triggered" | "success" | "error";
  timestamp: string;
  url?: string;
  error?: string;
  duration?: number;
}

interface DeployLog {
  deploys: DeployEntry[];
}

// ── Log persistence ──────────────────────────────────────────

async function logPath(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  return path.join(dataDir, "deploy-log.json");
}

async function readLog(): Promise<DeployLog> {
  const p = await logPath();
  if (!existsSync(p)) return { deploys: [] };
  const raw = await readFile(p, "utf-8");
  return JSON.parse(raw) as DeployLog;
}

async function writeLog(log: DeployLog): Promise<void> {
  const p = await logPath();
  await mkdir(path.dirname(p), { recursive: true });
  // Keep last 50
  log.deploys = log.deploys.slice(0, 50);
  await writeFile(p, JSON.stringify(log, null, 2));
}

export async function listDeploys(): Promise<DeployEntry[]> {
  return (await readLog()).deploys;
}

// ── Deploy trigger ───────────────────────────────────────────

export async function triggerDeploy(): Promise<DeployEntry> {
  const config = await readSiteConfig();
  let provider = config.deployProvider;
  let token = config.deployApiToken;
  let appName = config.deployAppName;

  // Auto-detect: GitHub-backed sites can deploy to GitHub Pages without manual config
  if (provider === "off") {
    const siteEntry = await getActiveSiteEntry();
    if (siteEntry?.adapter === "github" && siteEntry.configPath?.startsWith("github://")) {
      // Extract owner/repo from configPath: "github://owner/repo/..."
      const match = siteEntry.configPath.match(/^github:\/\/([^/]+\/[^/]+)/);
      if (match) {
        provider = "github-pages";
        appName = match[1];
        // Read GitHub token: try service token first, then OAuth cookie
        try {
          token = await resolveToken("oauth");
        } catch {
          // Direct fallback: read service token file from site's data dir
          try {
            const { dataDir } = await getActiveSitePaths();
            const tokenFile = path.join(dataDir, "github-service-token.json");
            const raw = await readFile(tokenFile, "utf-8");
            const stored = JSON.parse(raw) as { token?: string };
            if (stored.token) token = stored.token;
          } catch { /* no token available */ }
        }
      }
    }
  }

  if (provider === "off") {
    return { id: uid(), provider, status: "error", timestamp: now(), error: "No deploy provider configured" };
  }

  const entry: DeployEntry = {
    id: uid(),
    provider,
    status: "triggered",
    timestamp: now(),
  };

  const start = Date.now();

  try {
    switch (provider) {
      case "vercel":
      case "netlify":
      case "cloudflare":
      case "custom":
        // All use deploy hook URL — simple POST
        if (!config.deployHookUrl) throw new Error("Deploy hook URL not configured");
        await postHook(config.deployHookUrl);
        entry.status = "success";
        break;

      case "flyio":
        // Fly.io uses their Machines API or deploy hook
        if (config.deployHookUrl) {
          await postHook(config.deployHookUrl);
        } else if (config.deployApiToken && config.deployAppName) {
          await flyDeploy(config.deployApiToken, config.deployAppName);
        } else {
          throw new Error("Fly.io requires either a deploy hook URL or API token + app name");
        }
        entry.status = "success";
        break;

      case "github-pages": {
        const useToken = token || config.deployApiToken;
        const useRepo = appName || config.deployAppName;
        if (!useToken || !useRepo) {
          throw new Error("GitHub Pages requires a GitHub token. Connect GitHub via OAuth or add a token in Settings → Automation.");
        }
        const pagesUrl = await githubPagesBuildAndDeploy(useToken, useRepo);
        if (pagesUrl) {
          entry.url = pagesUrl;
          if (!config.deployProductionUrl) {
            try { await writeSiteConfig({ deployProductionUrl: pagesUrl }); } catch { /* non-fatal */ }
          }
        }
        entry.status = "success";
      }
        break;
    }
  } catch (err) {
    entry.status = "error";
    entry.error = err instanceof Error ? err.message : String(err);
  }

  entry.duration = Date.now() - start;

  // Save to log
  const log = await readLog();
  log.deploys.unshift(entry);
  await writeLog(log);

  return entry;
}

// ── Provider implementations ─────────────────────────────────

async function postHook(url: string): Promise<void> {
  const res = await fetch(url, { method: "POST", signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Hook returned ${res.status}: ${body.slice(0, 200)}`);
  }
}

async function flyDeploy(token: string, appName: string): Promise<void> {
  // Trigger a new machine deployment via Fly.io Machines API
  const res = await fetch(`https://api.machines.dev/v1/apps/${appName}/machines`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Fly.io API error: ${res.status}`);
  // For a full redeploy, we'd restart all machines
  const machines = await res.json() as { id: string }[];
  for (const m of machines.slice(0, 5)) {
    await fetch(`https://api.machines.dev/v1/apps/${appName}/machines/${m.id}/restart`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
  }
}

/**
 * Full GitHub Pages deploy pipeline:
 * 1. Run build.ts → generates dist/
 * 2. Push dist/ contents to gh-pages branch via GitHub API
 * 3. Enable GitHub Pages if not already enabled
 * 4. Return the Pages URL
 */
async function githubPagesBuildAndDeploy(token: string, repo: string): Promise<string | undefined> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };

  // 1. Run build
  const sitePaths = await getActiveSitePaths();
  const buildFile = path.join(sitePaths.projectDir, "build.ts");
  if (!existsSync(buildFile)) {
    throw new Error("No build.ts found — this site doesn't support static builds.");
  }

  console.log(`[deploy] Running build.ts in ${sitePaths.projectDir}...`);
  try {
    execSync("npx tsx build.ts", {
      cwd: sitePaths.projectDir,
      timeout: 60000,
      env: { ...process.env, NODE_ENV: "production" },
      stdio: "pipe",
    });
  } catch (err) {
    const msg = err instanceof Error ? (err as Error & { stderr?: Buffer }).stderr?.toString().slice(0, 300) || err.message : "Build failed";
    throw new Error(`Build failed: ${msg}`);
  }

  // 2. Collect dist/ files
  const distDir = path.join(sitePaths.projectDir, "dist");
  if (!existsSync(distDir)) {
    throw new Error("Build completed but no dist/ directory was created.");
  }

  const files = collectFiles(distDir, distDir);
  if (files.length === 0) {
    throw new Error("Build completed but dist/ is empty.");
  }
  console.log(`[deploy] Collected ${files.length} files from dist/`);

  // 3. Push to gh-pages branch via GitHub API
  // Create a tree with all files, then create a commit, then update gh-pages ref
  console.log(`[deploy] Pushing ${files.length} files to ${repo} gh-pages branch...`);

  // Create blobs for each file
  const blobs: { path: string; sha: string }[] = [];
  for (const f of files) {
    const content = readFileSync(f.fullPath);
    const blobRes = await fetch(`https://api.github.com/repos/${repo}/git/blobs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ content: content.toString("base64"), encoding: "base64" }),
      signal: AbortSignal.timeout(15000),
    });
    if (!blobRes.ok) throw new Error(`Failed to create blob for ${f.relativePath}: ${blobRes.status}`);
    const blob = await blobRes.json() as { sha: string };
    blobs.push({ path: f.relativePath, sha: blob.sha });
  }

  // Create tree
  const treeRes = await fetch(`https://api.github.com/repos/${repo}/git/trees`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      tree: blobs.map((b) => ({
        path: b.path,
        mode: "100644",
        type: "blob",
        sha: b.sha,
      })),
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!treeRes.ok) throw new Error(`Failed to create tree: ${treeRes.status}`);
  const tree = await treeRes.json() as { sha: string };

  // Get current gh-pages ref (might not exist)
  let parentSha: string | undefined;
  const refRes = await fetch(`https://api.github.com/repos/${repo}/git/refs/heads/gh-pages`, {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  if (refRes.ok) {
    const ref = await refRes.json() as { object: { sha: string } };
    parentSha = ref.object.sha;
  }

  // Create commit
  const commitBody: Record<string, unknown> = {
    message: `Deploy from webhouse.app — ${new Date().toLocaleString("da-DK")}`,
    tree: tree.sha,
  };
  if (parentSha) commitBody.parents = [parentSha];
  const commitRes = await fetch(`https://api.github.com/repos/${repo}/git/commits`, {
    method: "POST",
    headers,
    body: JSON.stringify(commitBody),
    signal: AbortSignal.timeout(15000),
  });
  if (!commitRes.ok) throw new Error(`Failed to create commit: ${commitRes.status}`);
  const commit = await commitRes.json() as { sha: string };

  // Update or create gh-pages ref
  if (parentSha) {
    const updateRes = await fetch(`https://api.github.com/repos/${repo}/git/refs/heads/gh-pages`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ sha: commit.sha, force: true }),
      signal: AbortSignal.timeout(10000),
    });
    if (!updateRes.ok) throw new Error(`Failed to update gh-pages ref: ${updateRes.status}`);
  } else {
    const createRes = await fetch(`https://api.github.com/repos/${repo}/git/refs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ref: "refs/heads/gh-pages", sha: commit.sha }),
      signal: AbortSignal.timeout(10000),
    });
    if (!createRes.ok) throw new Error(`Failed to create gh-pages ref: ${createRes.status}`);
  }

  console.log(`[deploy] Pushed ${files.length} files to gh-pages branch`);

  // 4. Ensure GitHub Pages is enabled on gh-pages branch
  const checkRes = await fetch(`https://api.github.com/repos/${repo}/pages`, {
    headers,
    signal: AbortSignal.timeout(10000),
  });

  let pagesUrl: string | undefined;

  if (checkRes.status === 404) {
    console.log(`[deploy] Enabling GitHub Pages on gh-pages branch...`);
    const enableRes = await fetch(`https://api.github.com/repos/${repo}/pages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ source: { branch: "gh-pages", path: "/" } }),
      signal: AbortSignal.timeout(10000),
    });
    if (!enableRes.ok) {
      const body = await enableRes.text().catch(() => "");
      if (enableRes.status === 422 && body.includes("plan does not support")) {
        throw new Error("GitHub Pages is not available for private repos on the Free plan. Make the repo public or upgrade your plan.");
      }
      if (enableRes.status !== 422) {
        throw new Error(`Failed to enable GitHub Pages: ${enableRes.status}`);
      }
    } else {
      const data = await enableRes.json() as { html_url?: string };
      pagesUrl = data.html_url;
    }
  } else if (checkRes.ok) {
    const data = await checkRes.json() as { html_url?: string; source?: { branch?: string } };
    pagesUrl = data.html_url;
    // Ensure it's pointing at gh-pages, not main
    if (data.source?.branch !== "gh-pages") {
      await fetch(`https://api.github.com/repos/${repo}/pages`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ source: { branch: "gh-pages", path: "/" } }),
        signal: AbortSignal.timeout(10000),
      });
    }
  }

  console.log(`[deploy] GitHub Pages URL: ${pagesUrl}`);
  return pagesUrl;
}

/** Recursively collect all files in a directory */
function collectFiles(dir: string, baseDir: string): { fullPath: string; relativePath: string }[] {
  const results: { fullPath: string; relativePath: string }[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...collectFiles(full, baseDir));
    } else {
      results.push({ fullPath: full, relativePath: path.relative(baseDir, full) });
    }
  }
  return results;
}

/** Check GitHub Pages status for a repo */
export async function checkGitHubPagesStatus(token: string, repo: string): Promise<{
  enabled: boolean;
  url?: string;
  status?: string;
  error?: string;
}> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/pages`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404) return { enabled: false };
    if (!res.ok) return { enabled: false, error: `API error: ${res.status}` };
    const data = await res.json() as { html_url?: string; status?: string };
    return { enabled: true, url: data.html_url, status: data.status };
  } catch (err) {
    return { enabled: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Helpers ──────────────────────────────────────────────────

function uid() { return `dpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }
function now() { return new Date().toISOString(); }
