/**
 * Site Pool — manages lazy-loaded CMS instances per site.
 *
 * Each site gets its own CMS engine instance with its own config,
 * storage adapter, and content service. Instances are cached in memory.
 */
import { createCms } from "@webhouse/cms";
import type { CmsConfig } from "@webhouse/cms";
import { dirname, resolve } from "node:path";
import type { SiteEntry } from "./site-registry";

// ─── GitHub helpers ────────────────────────────────────────

/**
 * Resolve token reference:
 * - "env:VAR_NAME" → process.env.VAR_NAME
 * - "oauth" → read from github-token cookie (OAuth flow)
 * - raw string → return as-is
 */
async function resolveToken(token: string): Promise<string> {
  if (token.startsWith("env:")) {
    const envVar = token.slice(4);
    const resolved = process.env[envVar];
    if (!resolved) throw new Error(`Environment variable "${envVar}" is not set (needed for GitHub token)`);
    return resolved;
  }
  if (token === "oauth") {
    // 1. Try current user's OAuth cookie
    try {
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      const oauthToken = cookieStore.get("github-token")?.value;
      if (oauthToken) return oauthToken;
    } catch { /* outside request context */ }

    // 2. Fall back to site service token (persisted by admin who connected GitHub)
    try {
      const { getActiveSitePaths } = await import("./site-paths");
      const { dataDir } = await getActiveSitePaths();
      const fs = await import("fs/promises");
      const path = await import("path");
      const tokenPath = path.join(dataDir, "github-service-token.json");
      const raw = await fs.readFile(tokenPath, "utf-8");
      const stored = JSON.parse(raw) as { token?: string };
      if (stored.token) return stored.token;
    } catch { /* try site-specific path next */ }

    // 3. Scan all site cache dirs for a service token (survives cookie clear)
    try {
      const fs = await import("fs/promises");
      const pathMod = await import("path");
      const configPath = process.env.CMS_CONFIG_PATH;
      if (configPath) {
        const cacheBase = pathMod.join(pathMod.dirname(pathMod.resolve(configPath)), ".cache", "sites");
        const dirs = await fs.readdir(cacheBase, { withFileTypes: true }).catch(() => []);
        for (const dir of dirs) {
          if (!dir.isDirectory()) continue;
          const tokenPath = pathMod.join(cacheBase, dir.name, "_data", "github-service-token.json");
          try {
            const raw = await fs.readFile(tokenPath, "utf-8");
            const stored = JSON.parse(raw) as { token?: string };
            if (stored.token) return stored.token;
          } catch { continue; }
        }
      }
    } catch { /* exhausted */ }

    throw new Error("GitHub not connected — please connect via Sites → New Site → Connect GitHub");
  }
  return token;
}

/** Fetch a file from a GitHub repo and return its decoded text content */
async function fetchGitHubFile(owner: string, repo: string, path: string, branch: string, token: string): Promise<string> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (res.status === 404) throw new Error(`GitHub: file not found: ${owner}/${repo}/${path}`);
  if (res.status === 401) throw new Error(`GitHub: bad token or no access to ${owner}/${repo}`);
  if (!res.ok) throw new Error(`GitHub: fetch ${path} failed: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { content: string };
  return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8");
}

/** Fetch cms.config.ts from a GitHub repo and evaluate it with jiti */
async function loadGitHubConfig(site: SiteEntry): Promise<CmsConfig> {
  const gh = site.github;
  if (!gh) throw new Error(`Site "${site.id}" is github adapter but has no github config`);

  const token = await resolveToken(gh.token);
  const branch = gh.branch ?? "main";

  // Determine config file path within the repo
  let configPath = "cms.config.ts";
  if (site.configPath.startsWith("github://")) {
    // Format: github://owner/repo/path/to/cms.config.ts
    const parts = site.configPath.replace("github://", "").split("/");
    configPath = parts.slice(2).join("/"); // skip owner/repo
  }

  const configSource = await fetchGitHubFile(gh.owner, gh.repo, configPath, branch, token);

  // Write to a temp file so jiti can import it (jiti needs a file path)
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const tempDir = join(tmpdir(), "cms-github-configs", `${gh.owner}-${gh.repo}`);
  mkdirSync(tempDir, { recursive: true });
  const tempFile = join(tempDir, "cms.config.ts");
  writeFileSync(tempFile, configSource);

  const { createJiti } = await import("jiti");
  const jiti = createJiti(tempFile, { debug: false, moduleCache: false });
  const mod = (await jiti.import(tempFile)) as { default?: CmsConfig } | CmsConfig;
  const config = ((mod as { default?: CmsConfig }).default ?? mod) as CmsConfig;

  // Ensure storage config points to the right GitHub repo with resolved token
  config.storage = {
    adapter: "github",
    github: {
      owner: gh.owner,
      repo: gh.repo,
      branch,
      contentDir: gh.contentDir ?? "content",
      token,
    },
  };

  return config;
}

export interface CmsInstance {
  cms: Awaited<ReturnType<typeof createCms>>;
  config: CmsConfig;
  site: SiteEntry;
}

const pool = new Map<string, CmsInstance>();

function poolKey(orgId: string, siteId: string): string {
  return `${orgId}:${siteId}`;
}

export async function getOrCreateInstance(
  orgId: string,
  site: SiteEntry,
): Promise<CmsInstance> {
  const key = poolKey(orgId, site.id);

  // In dev, always reload config (file may have changed)
  if (pool.has(key) && process.env.NODE_ENV === "production") {
    return pool.get(key)!;
  }

  if (site.adapter === "github") {
    const config = await loadGitHubConfig(site);
    const cms = await createCms(config);
    const instance: CmsInstance = { cms, config, site };
    pool.set(key, instance);
    return instance;
  }

  // Filesystem adapter — load config via jiti
  const absoluteConfigPath = resolve(site.configPath);
  const projectDir = dirname(absoluteConfigPath);

  // Change cwd so relative paths resolve correctly
  process.chdir(projectDir);

  const { createJiti } = await import("jiti");
  const jiti = createJiti(absoluteConfigPath, { debug: false, moduleCache: false });
  const mod = await jiti.import(absoluteConfigPath) as { default?: CmsConfig } | CmsConfig;
  const config = ((mod as { default?: CmsConfig }).default ?? mod) as CmsConfig;

  const cms = await createCms(config);
  const instance: CmsInstance = { cms, config, site };
  pool.set(key, instance);
  return instance;
}

export function invalidate(orgId: string, siteId: string): void {
  pool.delete(poolKey(orgId, siteId));
}

export function invalidateAll(): void {
  pool.clear();
}
