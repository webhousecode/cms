/**
 * Deploy service — trigger deploys via provider hooks/APIs.
 *
 * Supports: Vercel, Netlify, Fly.io, Cloudflare Pages, GitHub Pages, Custom webhook.
 * Deploy history stored in _data/deploy-log.json.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, readdirSync, statSync, readFileSync, rmSync, mkdirSync, writeFileSync, cpSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
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

  // Auto-detect: any site with build.ts can deploy to GitHub Pages
  if (provider === "off") {
    const siteEntry = await getActiveSiteEntry();

    // Try to resolve a GitHub token (OAuth cookie → site service token → scan all sites)
    if (!token) {
      try {
        token = await resolveToken("oauth");
      } catch { /* no token available */ }
    }

    if (siteEntry?.adapter === "github" && siteEntry.configPath?.startsWith("github://")) {
      // GitHub-backed site — only auto-deploy if it has a build.ts (static site)
      // Next.js sites need explicit deploy config (Fly, Vercel, etc.)
      const sitePaths = await getActiveSitePaths();
      const buildFile = path.join(sitePaths.projectDir, "build.ts");
      if (existsSync(buildFile)) {
        const match = siteEntry.configPath.match(/^github:\/\/([^/]+\/[^/]+)/);
        if (match) {
          provider = "github-pages";
          appName = match[1];
        }
      }
    } else if (siteEntry?.adapter === "filesystem" && token) {
      // Filesystem site with build.ts → auto-create GitHub repo if needed
      const sitePaths = await getActiveSitePaths();
      const buildFile = path.join(sitePaths.projectDir, "build.ts");
      if (existsSync(buildFile)) {
        provider = "github-pages";
        // Check if we already have a repo for this site
        if (config.deployAppName) {
          appName = config.deployAppName;
        } else {
          // Auto-create a repo based on the site name
          appName = await autoCreateGitHubRepo(token, siteEntry.name, siteEntry.id);
          // Persist the repo name so we don't re-create on next deploy
          try { await writeSiteConfig({ deployAppName: appName }); } catch { /* non-fatal */ }
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

  // F35 — fire deploy.started webhook
  {
    const { fireDeployEvent } = await import("./webhook-events");
    fireDeployEvent("started", provider).catch(() => {});
  }

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

      case "flyio": {
        // Fly.io: deploy hook (simple) or full build+deploy pipeline
        if (config.deployHookUrl) {
          await postHook(config.deployHookUrl);
          entry.status = "success";
        } else {
          let useToken = token || config.deployApiToken;
          if (!useToken) {
            throw new Error("Fly.io requires an API token. Get one at fly.io/dashboard → Tokens.");
          }
          let useAppName = appName || config.deployAppName;
          // Auto-create app name if not configured
          if (!useAppName) {
            const siteEntry = await getActiveSiteEntry();
            if (siteEntry) {
              useAppName = flyAppName(siteEntry.name, siteEntry.id);
              try { await writeSiteConfig({ deployAppName: useAppName }); } catch { /* non-fatal */ }
            }
          }
          if (!useAppName) throw new Error("Fly.io requires an app name.");
          const flyUrl = await flyioBuildAndDeploy(useToken, useAppName, config.deployFlyOrg || undefined);
          if (flyUrl) {
            entry.url = flyUrl;
            const flyUpdates: Record<string, string> = {};
            if (!config.deployProductionUrl) flyUpdates.deployProductionUrl = flyUrl;
            const flyPreview = (await readSiteConfig()).previewSiteUrl;
            if (!flyPreview || flyPreview === "http://localhost:3000" || flyPreview === "") {
              flyUpdates.previewSiteUrl = flyUrl;
            }
            if (Object.keys(flyUpdates).length > 0) {
              try { await writeSiteConfig(flyUpdates); } catch { /* non-fatal */ }
            }
          }
          entry.status = "success";
        }
      }
        break;

      case "github-pages": {
        // GitHub Pages requires build.ts (static site builder)
        const ghSitePaths = await getActiveSitePaths();
        const ghBuildFile = path.join(ghSitePaths.projectDir, "build.ts");
        if (!existsSync(ghBuildFile)) {
          throw new Error("No build.ts found — this site doesn't support static builds. Configure a different deploy provider (Fly.io, Vercel) in Site Settings → Deploy.");
        }
        // Resolve token: explicit config → OAuth cookie → service token → scan all sites
        let useToken = token || config.deployApiToken;
        if (!useToken) {
          try { useToken = await resolveToken("oauth"); } catch { /* no token */ }
        }
        let useRepo = appName || config.deployAppName;
        // Auto-create repo for filesystem sites if needed
        if (useToken && !useRepo) {
          const siteEntry = await getActiveSiteEntry();
          if (siteEntry) {
            useRepo = await autoCreateGitHubRepo(useToken, siteEntry.name, siteEntry.id);
            try { await writeSiteConfig({ deployAppName: useRepo }); } catch { /* non-fatal */ }
          }
        }
        if (!useToken || !useRepo) {
          throw new Error("GitHub Pages requires a GitHub token. Connect GitHub via OAuth or add a token in Settings → Automation.");
        }
        const pagesUrl = await githubPagesBuildAndDeploy(useToken, useRepo);
        if (pagesUrl) {
          entry.url = pagesUrl;
          const updates: Record<string, string> = {};
          if (!config.deployProductionUrl) updates.deployProductionUrl = pagesUrl;
          // Auto-set previewSiteUrl so CMS preview works out of the box
          const currentPreview = (await readSiteConfig()).previewSiteUrl;
          if (!currentPreview || currentPreview === "http://localhost:3000" || currentPreview === "") {
            updates.previewSiteUrl = pagesUrl;
          }
          if (Object.keys(updates).length > 0) {
            try { await writeSiteConfig(updates); } catch { /* non-fatal */ }
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

  // Post-deploy: auto-set previewSiteUrl from any available production URL.
  // This covers ALL providers — webhook-based ones (Vercel, Netlify, etc.)
  // don't return a URL at deploy time, but the admin may have manually set
  // deployProductionUrl or deployCustomDomain. If previewSiteUrl is still
  // empty/default, populate it so CMS preview works.
  if (entry.status === "success") {
    try {
      const freshConfig = await readSiteConfig();
      const liveUrl = entry.url || freshConfig.deployProductionUrl || (freshConfig.deployCustomDomain ? `https://${freshConfig.deployCustomDomain}` : "");
      const preview = freshConfig.previewSiteUrl;
      if (liveUrl && (!preview || preview === "http://localhost:3000" || preview === "")) {
        await writeSiteConfig({ previewSiteUrl: liveUrl });
      }
    } catch { /* non-fatal */ }
  }

  entry.duration = Date.now() - start;

  // Save to log
  const log = await readLog();
  log.deploys.unshift(entry);
  await writeLog(log);

  // F35 — fire deploy.success / deploy.failed webhook
  {
    const { fireDeployEvent } = await import("./webhook-events");
    if (entry.status === "success") {
      fireDeployEvent("success", provider, { url: entry.url, durationMs: entry.duration }).catch(() => {});
    } else if (entry.status === "error") {
      fireDeployEvent("failed", provider, { durationMs: entry.duration, error: entry.error }).catch(() => {});
    }
  }

  return entry;
}

// ── Auto-create GitHub repo ─────────────────────────────────

/**
 * Create a public GitHub repo for a filesystem site.
 * Returns "owner/repo" string.
 */
async function autoCreateGitHubRepo(token: string, siteName: string, siteId: string): Promise<string> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };

  // Slugify site name for repo name
  const slug = siteName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || siteId;
  const repoName = `${slug}-site`;

  // Get authenticated user
  const userRes = await fetch("https://api.github.com/user", {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  if (!userRes.ok) throw new Error("Failed to get GitHub user — check your token.");
  const user = await userRes.json() as { login: string };

  const fullName = `${user.login}/${repoName}`;

  // Check if repo already exists
  const checkRes = await fetch(`https://api.github.com/repos/${fullName}`, {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  if (checkRes.ok) {
    console.log(`[deploy] Repo ${fullName} already exists`);
    return fullName;
  }

  // Create public repo
  console.log(`[deploy] Creating GitHub repo ${fullName}...`);
  const createRes = await fetch("https://api.github.com/user/repos", {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: repoName,
      description: `${siteName} — built with webhouse.app`,
      private: false,
      auto_init: true,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!createRes.ok) {
    const body = await createRes.text().catch(() => "");
    throw new Error(`Failed to create repo: ${createRes.status} ${body.slice(0, 200)}`);
  }

  console.log(`[deploy] Created repo ${fullName}`);

  // Push branded README to main branch
  try {
    await pushBrandedReadme(headers, fullName, siteName);
  } catch (err) {
    console.error("[deploy] Failed to push README:", err instanceof Error ? err.message : err);
  }

  return fullName;
}

/** Push a branded README.md to the repo's main branch */
async function pushBrandedReadme(headers: Record<string, string>, repo: string, siteName: string): Promise<void> {
  const repoName = repo.split("/")[1] ?? siteName;
  const pagesUrl = `https://${repo.split("/")[0]}.github.io/${repoName}`;
  const readme = `<div align="center">

<img src="https://raw.githubusercontent.com/webhousecode/cms/main/logo/webhouse.app-dark.svg" alt="webhouse.app" width="240" />

<br /><br />

# ${siteName}

**Built and managed with [webhouse.app](https://webhouse.app)** — the AI-native content management system.

[![Deployed with webhouse.app](https://img.shields.io/badge/deployed%20with-webhouse.app-F7BB2E?style=for-the-badge)](https://webhouse.app)
&nbsp;
[![GitHub Pages](https://img.shields.io/badge/live_site-GitHub%20Pages-222?style=for-the-badge&logo=github)](${pagesUrl})

</div>

---

## About

This site is powered by **[@webhouse/cms](https://github.com/webhousecode/cms)** — a file-based, AI-native CMS engine for TypeScript projects. Content is managed through a visual admin UI and deployed to GitHub Pages with one click.

### How it works

| | |
|---|---|
| **Content** | Managed visually in the [webhouse.app](https://webhouse.app) admin — no code needed to edit |
| **Storage** | Content stored as JSON, version-controlled in this repo |
| **Deploy** | One-click publish from the admin UI to GitHub Pages |
| **AI** | Built-in AI agents for content generation, SEO, and translation |
| **Output** | Static HTML — fast, secure, zero hosting costs |

### What is webhouse.app?

[webhouse.app](https://webhouse.app) is a new kind of CMS — **AI-native from the ground up.** You describe what you want, and AI builds it. You manage content visually. You deploy with one click. And you own all the code.

- **AI Site Builder** — describe your site and watch it build
- **Visual Editor** — rich text, blocks, media, interactives
- **SEO Automation** — OpenGraph, JSON-LD, sitemap, robots.txt auto-generated
- **Multi-site** — manage multiple sites from one admin
- **Open Source** — [github.com/webhousecode/cms](https://github.com/webhousecode/cms)

### Tech stack

| Layer | Technology |
|-------|-----------|
| CMS | [@webhouse/cms](https://www.npmjs.com/package/@webhouse/cms) |
| Admin | [webhouse.app](https://webhouse.app) |
| Hosting | GitHub Pages |
| Build | TypeScript SSG + post-build SEO enrichment |
| AI | Claude, GPT-4, or any LLM provider |

---

<div align="center">

**[webhouse.app](https://webhouse.app)** — the CMS that builds itself.

<sub>[@webhouse/cms](https://github.com/webhousecode/cms) &middot; [npm](https://www.npmjs.com/package/@webhouse/cms) &middot; [docs](https://github.com/webhousecode/cms/tree/main/docs/ai-guide)</sub>

</div>
`;

  // Get current README sha (needed for update)
  const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/README.md`, {
    headers, signal: AbortSignal.timeout(10000),
  });
  const sha = getRes.ok ? ((await getRes.json()) as { sha: string }).sha : undefined;

  await fetch(`https://api.github.com/repos/${repo}/contents/README.md`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: "docs: branded README — built with webhouse.app",
      content: Buffer.from(readme).toString("base64"),
      ...(sha ? { sha } : {}),
    }),
    signal: AbortSignal.timeout(10000),
  });
  console.log(`[deploy] Pushed branded README to ${repo}`);
}

// ── Provider implementations ─────────────────────────────────

async function postHook(url: string): Promise<void> {
  const res = await fetch(url, { method: "POST", signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Hook returned ${res.status}: ${body.slice(0, 200)}`);
  }
}

/**
 * Full Fly.io deploy pipeline:
 * 1. Run build.ts → deploy/
 * 2. F89 enrichment
 * 3. Generate Dockerfile (caddy static server) + fly.toml (region: arn)
 * 4. Create Fly app if it doesn't exist
 * 5. Deploy via flyctl --remote-only
 * 6. Configure custom domain if set
 * 7. Return the app URL
 */
async function flyioBuildAndDeploy(token: string, appName: string, orgSlug?: string): Promise<string | undefined> {
  const sitePaths = await getActiveSitePaths();
  const buildFile = path.join(sitePaths.projectDir, "build.ts");
  const dockerFile = path.join(sitePaths.projectDir, "Dockerfile");
  const hasBuildTs = existsSync(buildFile);
  const hasDockerfile = existsSync(dockerFile);

  if (!hasBuildTs && !hasDockerfile) {
    throw new Error("No build.ts or Dockerfile found — this site can't be deployed to Fly.io. Add a build.ts (static) or Dockerfile (Next.js/SSR) to the project root.");
  }

  // Check flyctl is available
  try {
    execFileSync("flyctl", ["version"], { stdio: "pipe", timeout: 5000 });
  } catch {
    throw new Error("flyctl CLI not found. Install it: curl -L https://fly.io/install.sh | sh");
  }

  const config = await readSiteConfig();
  const customDomain = config.deployCustomDomain || "";
  const appUrl = customDomain ? `https://${customDomain}` : `https://${appName}.fly.dev`;

  // ── Resolve org — used by both paths ──
  let org = orgSlug;
  if (!org) {
    try {
      const orgOutput = execFileSync("flyctl", ["orgs", "list", "--json"], {
        env: { ...process.env, FLY_API_TOKEN: token },
        timeout: 10000,
        stdio: "pipe",
      }).toString();
      const orgsMap = JSON.parse(orgOutput) as Record<string, string>;
      const slugs = Object.keys(orgsMap);
      org = slugs.find((s) => s !== "personal") ?? slugs[0] ?? "personal";
      console.log(`[deploy] Auto-detected Fly org: ${org} (${orgsMap[org]})`);
    } catch {
      org = "personal";
      console.log("[deploy] Could not detect org, falling back to personal");
    }
  }

  // ── Ensure Fly app exists — used by both paths ──
  console.log(`[deploy] Ensuring Fly app "${appName}" exists (org: ${org})...`);
  try {
    execFileSync("flyctl", ["status", "--app", appName], {
      env: { ...process.env, FLY_API_TOKEN: token },
      timeout: 10000,
      stdio: "pipe",
    });
    console.log(`[deploy] App ${appName} already exists`);
  } catch {
    console.log(`[deploy] Creating Fly app ${appName} in org ${org}...`);
    try {
      execFileSync("flyctl", ["apps", "create", appName, "--org", org], {
        env: { ...process.env, FLY_API_TOKEN: token },
        timeout: 15000,
        stdio: "pipe",
      });
      console.log(`[deploy] Created Fly app ${appName}`);
    } catch (err) {
      const msg = err instanceof Error ? (err as Error & { stderr?: Buffer }).stderr?.toString().slice(0, 200) || err.message : "Failed";
      throw new Error(`Failed to create Fly app "${appName}" in org "${org}": ${msg}`);
    }
  }

  // ── Case B: Dockerfile deploy (Next.js / SSR) ──
  if (hasDockerfile && !hasBuildTs) {
    return flyioDockerfileDeploy(token, appName, appUrl, customDomain, sitePaths.projectDir);
  }

  // ── Case A: build.ts deploy (static site via Caddy) ──

  // Clean deploy dir
  const deployDir = path.join(sitePaths.projectDir, "deploy");
  if (existsSync(deployDir)) {
    rmSync(deployDir, { recursive: true, force: true });
    console.log("[deploy] Cleaned deploy/ directory");
  }

  // Build with root paths — Fly serves at root, not under a subpath
  console.log(`[deploy] Running build.ts in ${sitePaths.projectDir} (Fly.io, root paths, out=deploy/)...`);
  try {
    execFileSync("npx", ["tsx", "build.ts"], {
      cwd: sitePaths.projectDir,
      timeout: 60000,
      env: { ...process.env, NODE_ENV: "production", BASE_PATH: "", BUILD_OUT_DIR: "deploy" },
      stdio: "pipe",
    });
  } catch (err) {
    const msg = err instanceof Error ? (err as Error & { stderr?: Buffer }).stderr?.toString().slice(0, 300) || err.message : "Build failed";
    throw new Error(`Build failed: ${msg}`);
  }

  if (!existsSync(deployDir)) {
    throw new Error("Build completed but no deploy/ directory was created.");
  }

  // F89 enrichment
  try {
    const { enrichDist } = await import("./post-build-enrich");
    const siteEntry = await getActiveSiteEntry();
    const contentDir = path.join(sitePaths.projectDir, "content");
    let siteGlobals: Record<string, unknown> = {};
    const globalsPath = path.join(contentDir, "globals", "site.json");
    if (existsSync(globalsPath)) {
      const raw = JSON.parse(readFileSync(globalsPath, "utf-8"));
      siteGlobals = raw?.data ?? raw ?? {};
    }
    await enrichDist(deployDir, contentDir, {
      baseUrl: appUrl,
      basePath: "",
      siteName: (siteGlobals.siteName as string) ?? siteEntry?.name ?? "Site",
      siteDescription: (siteGlobals.tagline as string) ?? (siteGlobals.siteDescription as string) ?? (siteGlobals.introText as string) ?? "",
      siteImage: (siteGlobals.heroImage as string) ?? (siteGlobals.ogImage as string),
      themeColor: (siteGlobals.themeColor as string) ?? "#000000",
      lang: (siteGlobals.lang as string) ?? "en",
    });
  } catch (err) {
    console.error("[deploy] Fly.io enrichment failed:", err instanceof Error ? err.message : err);
  }

  const files = collectFiles(deployDir, deployDir);
  console.log(`[deploy] Collected ${files.length} files from deploy/`);

  // Create temp deploy context with Dockerfile + fly.toml
  const tmpDir = path.join("/tmp", `fly-deploy-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  const publicDir = path.join(tmpDir, "public");
  mkdirSync(publicDir, { recursive: true });

  // Copy deploy/ contents to tmpDir/public/
  cpSync(deployDir, publicDir, { recursive: true });

  // Caddyfile — static file server with SPA support, gzip, security headers
  writeFileSync(path.join(tmpDir, "Caddyfile"), `:80 {
	root * /srv
	file_server
	try_files {path} {path}/index.html /index.html
	encode gzip

	header {
		X-Frame-Options "SAMEORIGIN"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
	}

	# Cache static assets aggressively
	@static path *.css *.js *.svg *.png *.jpg *.jpeg *.webp *.woff2 *.ico
	header @static Cache-Control "public, max-age=31536000, immutable"
}
`);

  // Dockerfile — minimal caddy image
  writeFileSync(path.join(tmpDir, "Dockerfile"), `FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY public/ /srv
`);

  // fly.toml — region always arn (Stockholm)
  writeFileSync(path.join(tmpDir, "fly.toml"), `app = "${appName}"
primary_region = "arn"

[build]

[http_service]
  internal_port = 80
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  size = "shared-cpu-1x"
  memory = "256mb"
`);

  // Deploy via flyctl (remote build on Fly's builders)
  console.log(`[deploy] Deploying ${files.length} files to Fly.io (${appName})...`);
  try {
    execFileSync("flyctl", ["deploy", "--remote-only", "--ha=false"], {
      cwd: tmpDir,
      env: { ...process.env, FLY_API_TOKEN: token },
      timeout: 180000, // 3 min for remote build
      stdio: "pipe",
    });
  } catch (err) {
    const msg = err instanceof Error ? (err as Error & { stderr?: Buffer }).stderr?.toString().slice(0, 300) || err.message : "Deploy failed";
    // Clean up before throwing
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }
    throw new Error(`Fly.io deploy failed: ${msg}`);
  }

  // Custom domain
  if (customDomain) {
    console.log(`[deploy] Adding custom domain: ${customDomain}...`);
    try {
      execFileSync("flyctl", ["certs", "add", customDomain, "--app", appName], {
        env: { ...process.env, FLY_API_TOKEN: token },
        timeout: 15000,
        stdio: "pipe",
      });
    } catch {
      // Certificate might already exist — non-fatal
      console.log(`[deploy] Custom domain cert already exists or pending`);
    }
  }

  // Clean up temp dir
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }

  console.log(`[deploy] Fly.io deploy complete: ${appUrl}`);
  return appUrl;
}

/**
 * Fly.io deploy for sites with their own Dockerfile (Next.js / SSR).
 * Deploys directly from the site's projectDir — no build.ts, no Caddy, no enrichment.
 * Generates fly.toml only if the site doesn't already have one.
 */
async function flyioDockerfileDeploy(
  token: string,
  appName: string,
  appUrl: string,
  customDomain: string,
  projectDir: string,
): Promise<string> {
  console.log(`[deploy] Dockerfile detected — deploying Next.js/SSR site from ${projectDir}`);

  // Detect build context from Dockerfile comment: "# Build context: /path/to/dir"
  // Some Dockerfiles need a parent directory as context (e.g. monorepo with workspace deps)
  const dockerfileContent = readFileSync(path.join(projectDir, "Dockerfile"), "utf-8");
  const contextMatch = dockerfileContent.match(/^#\s*Build context:\s*(.+)/m);
  const buildContext = contextMatch ? contextMatch[1].trim() : projectDir;
  const dockerfilePath = path.join(projectDir, "Dockerfile");

  // fly.toml always lives in the build context directory (flyctl reads it from cwd)
  const flyTomlPath = path.join(buildContext, "fly.toml");
  const flyTomlCreated = !existsSync(flyTomlPath);
  if (flyTomlCreated) {
    // Build section references the Dockerfile relative to build context
    const relDockerfile = path.relative(buildContext, dockerfilePath);
    console.log(`[deploy] Generating fly.toml in ${buildContext} (dockerfile: ${relDockerfile}, region: arn)`);
    writeFileSync(flyTomlPath, `app = "${appName}"
primary_region = "arn"

[build]
  dockerfile = "${relDockerfile}"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
`);
  } else {
    console.log(`[deploy] Using existing fly.toml from ${buildContext}`);
  }

  // Deploy from build context dir via flyctl (remote build on Fly's builders)
  console.log(`[deploy] Deploying to Fly.io (${appName}) via remote Docker build (context: ${buildContext})...`);
  try {
    execFileSync("flyctl", ["deploy", "--remote-only", "--ha=false"], {
      cwd: buildContext,
      env: { ...process.env, FLY_API_TOKEN: token },
      timeout: 300000, // 5 min — Next.js builds are heavier than static
      stdio: "pipe",
    });
  } catch (err) {
    const msg = err instanceof Error ? (err as Error & { stderr?: Buffer }).stderr?.toString().slice(0, 500) || err.message : "Deploy failed";
    // Clean up generated fly.toml on failure so it doesn't litter the context dir
    if (flyTomlCreated) try { rmSync(flyTomlPath); } catch { /* */ }
    throw new Error(`Fly.io deploy failed: ${msg}`);
  }

  // Clean up fly.toml from context dir if we generated it (keep project dir clean)
  if (flyTomlCreated && buildContext !== projectDir) {
    try { rmSync(flyTomlPath); } catch { /* */ }
  }

  // Custom domain
  if (customDomain) {
    console.log(`[deploy] Adding custom domain: ${customDomain}...`);
    try {
      execFileSync("flyctl", ["certs", "add", customDomain, "--app", appName], {
        env: { ...process.env, FLY_API_TOKEN: token },
        timeout: 15000,
        stdio: "pipe",
      });
    } catch {
      console.log(`[deploy] Custom domain cert already exists or pending`);
    }
  }

  console.log(`[deploy] Fly.io deploy complete: ${appUrl}`);
  return appUrl;
}

/**
 * Auto-create a Fly.io app name from site name.
 * Returns the app name (e.g. "boutique-site").
 */
function flyAppName(siteName: string, siteId: string): string {
  const slug = siteName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || siteId;
  return `${slug}-site`;
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

  // Custom domain → root path; otherwise /repo-name
  const config = await readSiteConfig();
  const customDomain = config.deployCustomDomain || "";
  const repoName = repo.split("/")[1] ?? "";
  const basePath = customDomain ? "" : `/${repoName}`;

  // Clean output dir before build to remove orphaned files from previous builds
  const deployDir = path.join(sitePaths.projectDir, "deploy");
  if (existsSync(deployDir)) {
    rmSync(deployDir, { recursive: true, force: true });
    console.log("[deploy] Cleaned deploy/ directory");
  }

  console.log(`[deploy] Running build.ts in ${sitePaths.projectDir} (BASE_PATH=${basePath || "(root)"}, out=deploy/)...`);
  try {
    execFileSync("npx", ["tsx", "build.ts"], {
      cwd: sitePaths.projectDir,
      timeout: 60000,
      env: { ...process.env, NODE_ENV: "production", BASE_PATH: basePath, BUILD_OUT_DIR: "deploy" },
      stdio: "pipe",
    });
  } catch (err) {
    const msg = err instanceof Error ? (err as Error & { stderr?: Buffer }).stderr?.toString().slice(0, 300) || err.message : "Build failed";
    throw new Error(`Build failed: ${msg}`);
  }

  // 2. Collect deploy/ files (separate from dist/ which stays preview-ready)
  const distDir = path.join(sitePaths.projectDir, "deploy");
  if (!existsSync(distDir)) {
    throw new Error("Build completed but no dist/ directory was created.");
  }

  // Write CNAME file for custom domain
  if (customDomain) {
    const { writeFileSync: wfs } = await import("node:fs");
    wfs(path.join(distDir, "CNAME"), customDomain);
    console.log(`[deploy] Added CNAME: ${customDomain}`);
  }

  // F89: Post-build enrichment — inject SEO, OG, JSON-LD, generate sitemap etc.
  try {
    const { enrichDist } = await import("./post-build-enrich");
    const siteEntry = await getActiveSiteEntry();
    // Read site globals for metadata
    const contentDir = path.join(sitePaths.projectDir, "content");
    let siteGlobals: Record<string, unknown> = {};
    const globalsPath = path.join(contentDir, "globals", "site.json");
    if (existsSync(globalsPath)) {
      const raw = JSON.parse(readFileSync(globalsPath, "utf-8"));
      siteGlobals = raw?.data ?? raw ?? {};
    }
    const baseUrl = customDomain
      ? `https://${customDomain}`
      : `https://${repo.split("/")[0]}.github.io/${repo.split("/")[1]}`;
    await enrichDist(distDir, contentDir, {
      baseUrl,
      basePath,
      siteName: (siteGlobals.siteName as string) ?? siteEntry?.name ?? "Site",
      siteDescription: (siteGlobals.tagline as string) ?? (siteGlobals.siteDescription as string) ?? (siteGlobals.introText as string) ?? "",
      siteImage: (siteGlobals.heroImage as string) ?? (siteGlobals.ogImage as string),
      themeColor: (siteGlobals.themeColor as string) ?? "#000000",
      lang: (siteGlobals.lang as string) ?? "en",
    });
  } catch (err) {
    // Non-fatal — deploy continues even if enrichment fails
    console.error("[deploy] Post-build enrichment failed:", err instanceof Error ? err.message : err);
  }

  const files = collectFiles(distDir, distDir);
  if (files.length === 0) {
    throw new Error("Build completed but dist/ is empty.");
  }
  console.log(`[deploy] Collected ${files.length} files from dist/`);

  // 3. Push to gh-pages branch via GitHub API
  // Create a tree with all files, then create a commit, then update gh-pages ref
  console.log(`[deploy] Pushing ${files.length} files to ${repo} gh-pages branch...`);

  // Create blobs in parallel batches (sequential was too slow — 2000+ files
  // at 1 API call each took 2+ minutes and timed out the SSE stream).
  const BATCH_SIZE = 20;
  const blobs: { path: string; sha: string }[] = [];
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (f) => {
        const content = readFileSync(f.fullPath);
        const blobRes = await fetch(`https://api.github.com/repos/${repo}/git/blobs`, {
          method: "POST",
          headers,
          body: JSON.stringify({ content: content.toString("base64"), encoding: "base64" }),
          signal: AbortSignal.timeout(30000),
        });
        if (!blobRes.ok) throw new Error(`Failed to create blob for ${f.relativePath}: ${blobRes.status}`);
        const blob = await blobRes.json() as { sha: string };
        return { path: f.relativePath, sha: blob.sha };
      }),
    );
    blobs.push(...results);
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
      // GitHub API sometimes returns 500 when Pages is already enabled (race condition)
      // or 409/422 for other conflicts — treat as non-fatal, Pages may already be active
      if (enableRes.status === 500 || enableRes.status === 409) {
        console.log(`[deploy] Pages enable returned ${enableRes.status} — may already be active, continuing...`);
      } else if (enableRes.status !== 422) {
        throw new Error(`Failed to enable GitHub Pages: ${enableRes.status}`);
      }
    } else {
      const data = await enableRes.json() as { html_url?: string };
      pagesUrl = data.html_url;
    }
    // If we didn't get a URL from enable, construct it
    if (!pagesUrl) {
      pagesUrl = `https://${repo.split("/")[0]}.github.io/${repo.split("/")[1]}`;
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

  // 5. Configure custom domain if set
  if (customDomain) {
    console.log(`[deploy] Setting custom domain: ${customDomain}...`);
    // Always use custom domain URL regardless of API response
    pagesUrl = `https://${customDomain}`;
    try {
      await fetch(`https://api.github.com/repos/${repo}/pages`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          source: { branch: "gh-pages", path: "/" },
          cname: customDomain,
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch { /* non-fatal */ }
    console.log(`[deploy] Custom domain: ${pagesUrl}`);
  }

  console.log(`[deploy] GitHub Pages URL: ${pagesUrl}`);
  return pagesUrl;
}

/** Recursively collect all files in a directory (skips dotfile directories like .well-known) */
function collectFiles(dir: string, baseDir: string): { fullPath: string; relativePath: string }[] {
  const results: { fullPath: string; relativePath: string }[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) continue; // skip dotfiles/dotdirs — GitHub Pages/API issues
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
