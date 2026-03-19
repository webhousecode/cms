/**
 * Deploy service — trigger deploys via provider hooks/APIs.
 *
 * Supports: Vercel, Netlify, Fly.io, Cloudflare Pages, GitHub Pages, Custom webhook.
 * Deploy history stored in _data/deploy-log.json.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { getActiveSitePaths } from "./site-paths";
import { readSiteConfig } from "./site-config";

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
  const provider = config.deployProvider;

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
        // Trigger GitHub Actions workflow_dispatch
        if (config.deployApiToken && config.deployAppName) {
          await githubPagesDispatch(config.deployApiToken, config.deployAppName);
        } else if (config.deployHookUrl) {
          await postHook(config.deployHookUrl);
        } else {
          throw new Error("GitHub Pages requires API token + repo (owner/repo) or a deploy hook URL");
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

async function githubPagesDispatch(token: string, repo: string): Promise<void> {
  // repo format: "owner/repo"
  // Trigger the pages build via workflow_dispatch on the default "pages" workflow
  // or via the Pages API
  const res = await fetch(`https://api.github.com/repos/${repo}/pages/builds`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub Pages API error: ${res.status} ${body.slice(0, 200)}`);
  }
}

// ── Helpers ──────────────────────────────────────────────────

function uid() { return `dpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }
function now() { return new Date().toISOString(); }
