/**
 * Deploy service — trigger deploys via provider hooks/APIs.
 *
 * Supports: Vercel, Netlify, Fly.io, Cloudflare Pages, GitHub Pages, Custom webhook.
 * Deploy history stored in _data/deploy-log.json.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
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
        try { token = await resolveToken("oauth"); } catch { /* no token */ }
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

      case "github-pages":
        if ((token || config.deployApiToken) && (appName || config.deployAppName)) {
          const useToken = token || config.deployApiToken;
          const useRepo = appName || config.deployAppName;
          const pagesUrl = await githubPagesDispatch(useToken, useRepo);
          if (pagesUrl) {
            entry.url = pagesUrl;
            // Auto-save production URL if not set
            if (!config.deployProductionUrl) {
              try { await writeSiteConfig({ deployProductionUrl: pagesUrl }); } catch { /* non-fatal */ }
            }
          }
        } else if (config.deployHookUrl) {
          await postHook(config.deployHookUrl);
        } else {
          throw new Error("GitHub Pages requires a GitHub token. Connect GitHub via OAuth or add a token in Settings → Automation.");
        }
        entry.status = "success";
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

async function githubPagesDispatch(token: string, repo: string): Promise<string | undefined> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
  };

  // 1. Check if Pages is enabled
  const checkRes = await fetch(`https://api.github.com/repos/${repo}/pages`, {
    headers,
    signal: AbortSignal.timeout(10000),
  });

  if (checkRes.status === 404) {
    // 2. Pages not enabled — enable it automatically
    console.log(`[deploy] GitHub Pages not enabled on ${repo}, enabling...`);
    const enableRes = await fetch(`https://api.github.com/repos/${repo}/pages`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        source: { branch: "main", path: "/" },
        build_type: "workflow",
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!enableRes.ok) {
      const body = await enableRes.text().catch(() => "");
      if (enableRes.status === 422 && body.includes("plan does not support")) {
        throw new Error("GitHub Pages is not available for private repos on the Free plan. Upgrade to GitHub Pro/Team, or make the repo public.");
      }
      // 422 = already enabled (race), that's fine
      if (enableRes.status !== 422) {
        throw new Error(`Failed to enable GitHub Pages: ${enableRes.status} ${body.slice(0, 200)}`);
      }
    } else {
      const pagesData = await enableRes.json() as { html_url?: string };
      console.log(`[deploy] GitHub Pages enabled: ${pagesData.html_url}`);
      // Wait a moment for Pages to initialize
      await new Promise((r) => setTimeout(r, 2000));
      return pagesData.html_url;
    }
  }

  // 3. Pages is enabled — get current URL
  let pagesUrl: string | undefined;
  if (checkRes.ok) {
    const pagesData = await checkRes.json() as { html_url?: string };
    pagesUrl = pagesData.html_url;
  }

  // 4. Trigger a pages build
  const buildRes = await fetch(`https://api.github.com/repos/${repo}/pages/builds`, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(15000),
  });
  if (!buildRes.ok) {
    const body = await buildRes.text().catch(() => "");
    throw new Error(`GitHub Pages build trigger failed: ${buildRes.status} ${body.slice(0, 200)}`);
  }

  return pagesUrl;
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
