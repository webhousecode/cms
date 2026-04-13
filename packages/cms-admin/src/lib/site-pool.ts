/**
 * Site Pool — manages lazy-loaded CMS instances per site.
 *
 * Each site gets its own CMS engine instance with its own config,
 * storage adapter, and content service. Instances are cached in memory.
 */
import { createCms, VALID_FIELD_TYPES } from "@webhouse/cms";
import type { CmsConfig } from "@webhouse/cms";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { SiteEntry } from "./site-registry";
import { ZodError } from "zod";

/**
 * Resolve all relative paths in a CmsConfig to absolute paths anchored at
 * `projectDir`. Mutates the config in place.
 *
 * Why: each site's cms.config.ts typically uses a relative `contentDir: 'content'`
 * which is resolved against process.cwd() by the filesystem adapter. If two
 * concurrent requests load different sites, process.cwd() (set via chdir) would
 * race and one site could end up reading another site's content. By
 * absolutizing here we make the config self-contained and immune to chdir races.
 */
function absolutizeConfigPaths(config: CmsConfig, projectDir: string): void {
  const fs = (config.storage as { filesystem?: { contentDir?: string } } | undefined)?.filesystem;
  if (fs?.contentDir && !isAbsolute(fs.contentDir)) {
    fs.contentDir = join(projectDir, fs.contentDir);
  }
}

/**
 * F79: Format config loading errors into human-readable messages.
 */
function formatSiteError(err: unknown, site: SiteEntry): string {
  if (err instanceof ZodError) {
    const issues = err.issues.map((issue) => {
      const path = issue.path.join(".");
      if (issue.code === "invalid_enum_value" && path.endsWith(".type")) {
        const received = (issue as { received?: string }).received ?? "";
        const validTypes = VALID_FIELD_TYPES.join(", ");
        return `Invalid field type "${received}" at ${path}. Valid types: ${validTypes}`;
      }
      return `${path}: ${issue.message}`;
    });
    return `Site "${site.name}" config validation failed:\n${issues.join("\n")}`;
  }
  if (err instanceof Error) {
    if (err.message.includes("Cannot find module") || err.message.includes("ENOENT")) {
      return `Site "${site.name}": Config file not found at "${site.configPath}". Check the path in site settings.`;
    }
    return `Site "${site.name}": ${err.message}`;
  }
  return `Site "${site.name}": Unknown error loading config`;
}

// ─── GitHub helpers ────────────────────────────────────────

/**
 * Resolve token reference:
 * - "env:VAR_NAME" → process.env.VAR_NAME
 * - "oauth" → read from github-token cookie (OAuth flow)
 * - raw string → return as-is
 */
export async function resolveToken(token: string): Promise<string> {
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
const poolTimestamps = new Map<string, number>();

/** GitHub config cache TTL — avoid re-fetching cms.config.ts on every request */
const GITHUB_CACHE_TTL_MS = 120_000; // 2 minutes
/** Filesystem config cache TTL in dev — avoid jiti re-import on every request */
const FS_DEV_CACHE_TTL_MS = 5_000; // 5 seconds

function poolKey(orgId: string, siteId: string): string {
  return `${orgId}:${siteId}`;
}

export async function getOrCreateInstance(
  orgId: string,
  site: SiteEntry,
): Promise<CmsInstance> {
  const key = poolKey(orgId, site.id);

  if (pool.has(key)) {
    // Production: always use cache
    if (process.env.NODE_ENV === "production") return pool.get(key)!;
    // Dev: cache for TTL to avoid jiti re-import on every request
    const ts = poolTimestamps.get(key) ?? 0;
    const ttl = site.adapter === "github" ? GITHUB_CACHE_TTL_MS : FS_DEV_CACHE_TTL_MS;
    if (Date.now() - ts < ttl) return pool.get(key)!;
  }

  try {
    if (site.adapter === "github") {
      const config = await loadGitHubConfig(site);
      const cms = await createCms(config);
      const instance: CmsInstance = { cms, config, site };
      pool.set(key, instance);
      poolTimestamps.set(key, Date.now());
      return instance;
    }

    // Filesystem adapter — load config via jiti
    const absoluteConfigPath = resolve(site.configPath);
    const projectDir = dirname(absoluteConfigPath);

    const { createJiti } = await import("jiti");
    const jiti = createJiti(absoluteConfigPath, { debug: false, moduleCache: false });
    const mod = await jiti.import(absoluteConfigPath) as { default?: CmsConfig } | CmsConfig;
    const config = ((mod as { default?: CmsConfig }).default ?? mod) as CmsConfig;

    // Resolve any relative paths in the config to absolute paths anchored at
    // projectDir. We must NOT use process.chdir() here — it mutates global
    // process state and races between concurrent requests for different sites,
    // causing one site's filesystem adapter to read another site's content
    // (the worst kind of cross-site data leak).
    absolutizeConfigPaths(config, projectDir);

    // strict: throw if any relative filesystem path slipped through. This is
    // the runtime backstop against the cross-site data leak that
    // absolutizeConfigPaths is meant to prevent.
    const cms = await createCms(config, { strict: true });
    const instance: CmsInstance = { cms, config, site };
    pool.set(key, instance);
    poolTimestamps.set(key, Date.now());
    return instance;
  } catch (err) {
    // F79: Graceful error handling — format ZodError and config loading errors
    const message = formatSiteError(err, site);
    throw new Error(message);
  }
}

export function invalidate(orgId: string, siteId: string): void {
  pool.delete(poolKey(orgId, siteId));
}

export function invalidateAll(): void {
  pool.clear();
}
