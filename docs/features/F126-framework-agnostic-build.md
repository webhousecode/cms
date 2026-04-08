# F126 — Framework-Agnostic Build Pipeline

**Status:** Planned
**Size:** Large
**Tier:** 1 (v1.0 — Launch)
**Created:** 2026-04-08
**Related:** F125 (Framework-Agnostic Consumer Guides), F12 (Deploy Targets), F67 (Security Gate), F79 (Config Validator)

> Let CMS admin's "Build" button invoke ANY build system, not just our native TypeScript `npx cms build`. Configure custom build commands per site so Laravel, Hugo, Jekyll, Django, Rails, Astro, Eleventy, or any framework can be the renderer — while keeping the visual editor, AI agents, and deploy adapters working unchanged. Complete the "universal CMS" story that F125 starts.

---

## Why this matters

### The blocking problem

F125 gives Laravel / Django / Rails / Go / .NET developers **read access** to @webhouse/cms content. They can load JSON files and render them. That unlocks a huge audience — but it's only half the story.

The other half: **when a content editor saves in CMS admin, what happens next?**

Today, CMS admin's build + save-trigger pipeline assumes TypeScript everywhere:

- "Build" button runs `npx cms build` (our native pipeline) — hardcoded
- ICD (Instant Content Deployment) on save assumes `dist/` output
- Deploy adapters expect files in `dist/`
- Preview URL assumes a Next.js or sirv-served build

A Laravel developer can edit content beautifully in CMS admin, save it, and then… has to open a terminal, SSH into their server, run `php artisan build`, and trigger a deploy. That's not "one CMS, every framework." That's "one CMS, one framework, plus manual steps."

### What F126 changes

After F126 ships, the "Build" button in CMS admin runs **whatever command the site's `cms.config.ts` says to run**. The command is declared in config, executed with full security controls, logs are streamed to a side panel in real time, and deploy adapters pick up the resulting output directory regardless of framework.

This closes the loop:

1. Editor saves content in CMS admin (F125 layer writes JSON)
2. Editor clicks "Build" (F126 spawns `php artisan build` / `hugo --minify` / etc.)
3. F12 deploy adapter pushes the resulting output to Netlify / Vercel / Fly / etc.

All from one button. All from a visual UI. With any framework.

### The competitive story

Together with F125, this puts @webhouse/cms in a unique position:

| CMS | Editor UI | AI agents | Multi-framework | One-click build+deploy |
|-----|----------|-----------|-----------------|------------------------|
| WordPress | Yes | No | PHP only | Yes (PHP pipeline) |
| Contentful | Yes | No | Any (via API) | No — customer builds |
| Sanity | Yes | No | Any (via GROQ) | No — customer builds |
| Strapi | Yes | No | Any (via REST) | No |
| Keystatic | Yes | No | JS/TS only | No |
| Netlify CMS / Decap | Limited | No | Static sites | Via Netlify |
| **@webhouse/cms** | **Yes** | **Yes** | **Any (F125)** | **Yes (F126)** |

Nobody else has all four. That's the positioning we unlock.

---

## What ships (deliverables)

### 1. `build.command` in `cms.config.ts`

New optional fields in the `BuildConfig` interface. All backwards compatible — existing configs continue to work unchanged (native pipeline runs when no command is specified).

```typescript
export interface BuildConfig {
  outDir?: string;
  baseUrl?: string;
  rss?: RssConfig;
  robots?: RobotsConfig;

  // ── NEW in F126 ──────────────────────────────────────

  /** Shell command to execute. If omitted, the native CMS pipeline runs. */
  command?: string;

  /** Working directory for the command (relative to config file). Default: config dir. */
  workingDir?: string;

  /** Env vars to set for the command. Allowlisted — see security section. */
  env?: Record<string, string>;

  /** Timeout in seconds. Default: 300. Max: 900. */
  timeout?: number;

  /** Multiple build profiles (optional — overrides command/outDir when present). */
  profiles?: BuildProfile[];

  /** Default profile name (used when profiles[] is set). */
  defaultProfile?: string;

  /** Docker mode for isolated builds (optional). */
  docker?: DockerConfig;
}

export interface BuildProfile {
  name: string;
  command: string;
  outDir: string;
  workingDir?: string;
  env?: Record<string, string>;
  description?: string;
  /** Override preview URL for this profile. */
  previewUrl?: string;
  /** Docker config for this profile. */
  docker?: DockerConfig;
}

export interface DockerConfig {
  image: string;              // e.g. "php:8.3-cli", "python:3.12", "golang:1.22"
  volumes?: string[];         // additional volume mounts
  env?: Record<string, string>;
  workdir?: string;           // inside container
}
```

### 2. Build Executor

A secure, streaming command executor in CMS admin that:

- Validates the command against an allowlist (per-org setting)
- Validates the working directory is under the site's project directory
- Spawns with `shell: false` (no shell injection)
- Enforces timeout with `SIGKILL` escalation
- Streams stdout/stderr line-by-line to the caller
- Returns structured result: exit code, duration, output, stderr tail
- Optionally runs inside Docker for full isolation

**File:** `packages/cms-admin/src/lib/build/executor.ts`

### 3. Build API Route (NDJSON streaming)

New API route that clients (CMS admin UI) subscribe to for real-time build progress:

**Endpoint:** `POST /api/cms/build/execute`
**Auth:** Admin role required
**Rate limit:** 1 concurrent build per site, 10/hour per user

**Request body:**
```typescript
{
  profile?: string;   // profile name, or omit for default
  env?: Record<string, string>;  // additional env overrides (allowlisted)
}
```

**Response:** NDJSON stream of events:
```typescript
type BuildEvent =
  | { type: 'start';    profile: string; command: string; workingDir: string; timeout: number }
  | { type: 'log';      stream: 'stdout' | 'stderr'; line: string; timestamp: string }
  | { type: 'progress'; percent?: number; message?: string }
  | { type: 'complete'; success: boolean; exitCode: number; duration: number; outDir: string; outDirAbs: string }
  | { type: 'error';    message: string; code?: string };
```

### 4. Build Log Panel UI

A slide-out panel in CMS admin that shows real-time build output.

**File:** `packages/cms-admin/src/components/build/build-log-panel.tsx`

Features:
- Slides in from the right side
- Real-time log streaming with auto-scroll
- ANSI color support (for colored terminal output)
- "Copy logs" button
- "Download logs" button
- Status bar: profile name, duration, exit code
- "Cancel build" button (sends SIGTERM)
- Persistent across page navigation (continues in background)
- Shows previous 5 builds with quick re-open

### 5. Split Build Button

The existing "Build" button becomes a split button when multiple profiles are configured:

```
[Build ▾]
  → native (npx cms build)       → dist/
  → laravel (php artisan build)  → public/
  → docker (container build)     → build/docker/
```

Single profile? Just a regular button running the default.

**File:** `packages/cms-admin/src/components/admin-header.tsx`

### 6. Deploy Adapter Integration

Deploy adapters (Vercel, Netlify, Fly.io, GitHub Pages) already read from `build.outDir`. They need to respect the **resolved** outDir from the active profile:

**File:** `packages/cms-admin/src/lib/deploy/resolve-out-dir.ts`

```typescript
export function resolveBuildOutDir(config: CmsConfig, profileName?: string): string {
  if (config.build?.profiles && config.build.profiles.length > 0) {
    const profile = config.build.profiles.find(p => p.name === profileName)
      ?? config.build.profiles.find(p => p.name === config.build?.defaultProfile)
      ?? config.build.profiles[0];
    return profile.outDir;
  }
  return config.build?.outDir ?? 'dist';
}
```

All deploy adapters call `resolveBuildOutDir()` before zipping/uploading.

### 7. ICD (Instant Content Deployment) Integration

When content is saved with ICD enabled:

1. Trigger `executeBuild()` with the default profile
2. Stream logs to a toast notification (not the full panel)
3. On success → trigger deploy (existing flow)
4. On failure → show error toast with link to full log

**File:** `packages/cms-admin/src/lib/icd/auto-build.ts`

### 8. Docs (7 bilingual pages)

New docs pages on docs.webhouse.app:

1. `custom-build-commands` (EN+DA) — Overview of build.command
2. `build-profiles` (EN+DA) — Multiple profiles, when to use
3. `docker-builds` (EN+DA) — Using Docker for isolated builds
4. `build-security` (EN+DA) — Allowlist, org settings, best practices
5. `build-laravel` (EN+DA) — Laravel-specific config + troubleshooting
6. `build-hugo` (EN+DA) — Hugo-specific config
7. `build-rails` (EN+DA) — Rails/Jekyll-specific config

---

## Technical Design

### Build Executor

**File:** `packages/cms-admin/src/lib/build/executor.ts`

```typescript
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { randomUUID } from 'crypto';

export interface ExecuteOptions {
  command: string;
  workingDir: string;            // absolute, validated by caller
  env?: Record<string, string>;
  timeout: number;               // seconds
  docker?: DockerConfig;
  onLog?: (line: string, stream: 'stdout' | 'stderr') => void;
  signal?: AbortSignal;          // for cancellation
}

export interface ExecuteResult {
  success: boolean;
  exitCode: number | null;
  stdout: string;                // truncated to last 10KB
  stderr: string;                // truncated to last 10KB
  duration: number;              // ms
  buildId: string;
  cancelled: boolean;
}

const ALLOWED_ENV_VARS = new Set([
  'APP_ENV', 'NODE_ENV', 'RAILS_ENV', 'DJANGO_SETTINGS_MODULE',
  'HUGO_ENV', 'JEKYLL_ENV', 'BASE_URL', 'BASE_PATH',
  'BUILD_OUT_DIR', 'PUBLIC_URL', 'DOTNET_ENVIRONMENT',
]);

const BLOCKED_ENV_VARS = new Set([
  'LD_PRELOAD', 'LD_LIBRARY_PATH', 'DYLD_INSERT_LIBRARIES',
  'PATH', 'HOME', 'USER', 'SHELL',
]);

export async function executeBuild(opts: ExecuteOptions): Promise<ExecuteResult> {
  const buildId = randomUUID();
  const start = Date.now();

  // Filter env vars
  const safeEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(opts.env ?? {})) {
    if (BLOCKED_ENV_VARS.has(key)) {
      throw new Error(`Environment variable "${key}" is blocked for security reasons.`);
    }
    if (ALLOWED_ENV_VARS.has(key)) {
      safeEnv[key] = value;
    }
    // Unknown vars are silently dropped — the caller should validate first
  }

  // Parse command into argv — no shell
  const argv = parseCommand(opts.command);
  if (argv.length === 0) {
    throw new Error('Empty command');
  }
  const [cmd, ...args] = argv;

  // Docker wrapping
  let spawnCmd = cmd!;
  let spawnArgs = args;
  if (opts.docker) {
    const volumes = [`${opts.workingDir}:/workspace`, ...(opts.docker.volumes ?? [])];
    spawnCmd = 'docker';
    spawnArgs = [
      'run', '--rm',
      '-v', volumes.join(' -v '),
      '-w', opts.docker.workdir ?? '/workspace',
      ...Object.entries(opts.docker.env ?? {}).flatMap(([k, v]) => ['-e', `${k}=${v}`]),
      opts.docker.image,
      cmd!, ...args,
    ];
  }

  return new Promise<ExecuteResult>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let cancelled = false;
    let child: ChildProcess | null = null;

    const timer = setTimeout(() => {
      if (child) {
        child.kill('SIGTERM');
        setTimeout(() => child?.kill('SIGKILL'), 5000);
      }
      reject(new Error(`Build timeout after ${opts.timeout}s`));
    }, opts.timeout * 1000);

    // Cancellation
    opts.signal?.addEventListener('abort', () => {
      cancelled = true;
      child?.kill('SIGTERM');
      setTimeout(() => child?.kill('SIGKILL'), 5000);
    });

    try {
      child = spawn(spawnCmd, spawnArgs, {
        cwd: opts.workingDir,
        env: { ...safeEnv, PATH: process.env.PATH ?? '' },  // PATH needed for command lookup
        shell: false,                                        // CRITICAL
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');

      child.stdout?.on('data', (chunk: string) => {
        stdout += chunk;
        for (const line of chunk.split('\n')) {
          if (line) opts.onLog?.(line, 'stdout');
        }
      });

      child.stderr?.on('data', (chunk: string) => {
        stderr += chunk;
        for (const line of chunk.split('\n')) {
          if (line) opts.onLog?.(line, 'stderr');
        }
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          success: code === 0 && !cancelled,
          exitCode: code,
          stdout: stdout.slice(-10240),
          stderr: stderr.slice(-10240),
          duration: Date.now() - start,
          buildId,
          cancelled,
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}

/**
 * Parse command string into argv WITHOUT shell interpretation.
 * Supports quoted arguments and basic escaping.
 */
function parseCommand(command: string): string[] {
  const argv: string[] = [];
  let current = '';
  let inQuote: string | null = null;
  let escaped = false;

  for (const ch of command.trim()) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (inQuote) {
      if (ch === inQuote) inQuote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      continue;
    }
    if (ch === ' ' || ch === '\t') {
      if (current) {
        argv.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current) argv.push(current);
  return argv;
}
```

### Path Validation

**File:** `packages/cms-admin/src/lib/build/validate-paths.ts`

```typescript
import path from 'path';
import fs from 'fs';

/**
 * Validate that workingDir is under projectDir (no path traversal).
 * Returns the resolved absolute working dir, or throws.
 */
export function resolveWorkingDir(projectDir: string, workingDir?: string): string {
  const project = path.resolve(projectDir);
  const working = path.resolve(project, workingDir ?? '.');
  const rel = path.relative(project, working);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`workingDir "${workingDir}" escapes project directory`);
  }
  if (!fs.existsSync(working)) {
    throw new Error(`workingDir "${working}" does not exist`);
  }
  if (!fs.statSync(working).isDirectory()) {
    throw new Error(`workingDir "${working}" is not a directory`);
  }
  return working;
}

/**
 * Validate that outDir is under projectDir and resolve to absolute.
 */
export function resolveOutDir(projectDir: string, outDir: string): string {
  const project = path.resolve(projectDir);
  const out = path.resolve(project, outDir);
  const rel = path.relative(project, out);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`outDir "${outDir}" escapes project directory`);
  }
  return out;
}
```

### Command Allowlist

**File:** `packages/cms-admin/src/lib/build/allowlist.ts`

Per-org setting stored in org-settings:

```typescript
interface OrgBuildSettings {
  /** Allow custom build commands. Default: true (self-hosted), false (hosted). */
  allowCustomBuildCommands: boolean;

  /** If allowed, restrict to this allowlist. Empty = no restriction. */
  allowedCommands?: string[];

  /** Max timeout in seconds a site can configure. */
  maxTimeout?: number;

  /** Docker-only mode: commands must run in Docker (for hosted offerings). */
  requireDocker?: boolean;
}
```

Commands are matched by the first argv element:

```typescript
export function isCommandAllowed(command: string, settings: OrgBuildSettings): boolean {
  if (!settings.allowCustomBuildCommands) return false;
  if (!settings.allowedCommands || settings.allowedCommands.length === 0) return true;

  const firstArg = parseCommand(command)[0];
  if (!firstArg) return false;

  // Match by basename (e.g. "php" matches "/usr/bin/php")
  const basename = path.basename(firstArg);
  return settings.allowedCommands.includes(basename);
}
```

Recommended default allowlist for hosted offerings:
```
npm, npx, pnpm, yarn, node,
php, composer,
python, python3, pip, pipenv,
ruby, bundle, bundler,
go, hugo,
dotnet,
make, bash, sh
```

### API Route

**File:** `packages/cms-admin/src/app/api/cms/build/execute/route.ts`

```typescript
import { NextRequest } from 'next/server';
import { executeBuild } from '@/lib/build/executor';
import { resolveWorkingDir, resolveOutDir } from '@/lib/build/validate-paths';
import { isCommandAllowed } from '@/lib/build/allowlist';
import { requireAdmin } from '@/lib/auth';
import { loadSiteConfig } from '@/lib/site-pool';
import { loadOrgBuildSettings } from '@/lib/org-settings';

export async function POST(req: NextRequest) {
  const { user, orgId, siteId } = await requireAdmin(req);
  const { profile: profileName, env } = await req.json();

  const config = await loadSiteConfig(siteId);
  const projectDir = path.dirname(config._configPath);

  // Resolve profile
  const profile = resolveProfile(config.build, profileName);
  if (!profile.command) {
    return new Response('No build command configured', { status: 400 });
  }

  // Load org settings + validate
  const orgSettings = await loadOrgBuildSettings(orgId);
  if (!isCommandAllowed(profile.command, orgSettings)) {
    return new Response(`Command "${profile.command}" not allowed for this org`, { status: 403 });
  }

  const workingDir = resolveWorkingDir(projectDir, profile.workingDir);
  const outDirAbs = resolveOutDir(projectDir, profile.outDir);
  const timeout = Math.min(profile.timeout ?? 300, orgSettings.maxTimeout ?? 900);

  // NDJSON stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      };

      emit({
        type: 'start',
        profile: profile.name ?? 'default',
        command: profile.command,
        workingDir,
        timeout,
      });

      try {
        const result = await executeBuild({
          command: profile.command,
          workingDir,
          env: { ...profile.env, ...env },
          timeout,
          docker: profile.docker ?? (orgSettings.requireDocker ? getDefaultDockerFor(profile.command) : undefined),
          onLog: (line, streamName) => {
            emit({
              type: 'log',
              stream: streamName,
              line,
              timestamp: new Date().toISOString(),
            });
          },
        });

        // Audit log
        await logBuildExecution(user.id, orgId, siteId, result);

        emit({
          type: 'complete',
          success: result.success,
          exitCode: result.exitCode ?? -1,
          duration: result.duration,
          outDir: profile.outDir,
          outDirAbs,
        });
      } catch (err) {
        emit({
          type: 'error',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
```

### Build Log Panel UI

**File:** `packages/cms-admin/src/components/build/build-log-panel.tsx`

Key features:

```tsx
export function BuildLogPanel({ siteId, profile, onClose }: Props) {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [status, setStatus] = useState<'running' | 'success' | 'failed' | 'cancelled'>('running');
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    abortRef.current = ac;

    (async () => {
      const res = await fetch('/api/cms/build/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
        signal: ac.signal,
      });

      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line);
          handleEvent(event);
        }
      }
    })().catch(err => {
      if (err.name !== 'AbortError') console.error(err);
    });

    return () => ac.abort();
  }, [siteId, profile]);

  const handleCancel = () => abortRef.current?.abort();

  return (
    <aside className="build-log-panel">
      <header>
        <span className="profile-name">{profile ?? 'default'}</span>
        <span className="status" data-status={status}>{statusLabel(status)}</span>
        <span className="duration">{formatDuration(duration)}</span>
        {status === 'running' && <button onClick={handleCancel}>Cancel</button>}
        <button onClick={onClose} aria-label="Close">×</button>
      </header>
      <div className="log-body">
        {logs.map((l, i) => (
          <div key={i} className={`log-line log-${l.stream}`}>
            <span className="ts">{l.timestamp.slice(11, 19)}</span>
            <span className="text" dangerouslySetInnerHTML={{ __html: ansiToHtml(l.line) }} />
          </div>
        ))}
      </div>
      <footer>
        <button onClick={() => copyLogs(logs)}>Copy</button>
        <button onClick={() => downloadLogs(logs)}>Download</button>
        {exitCode !== null && <span>Exit code: {exitCode}</span>}
      </footer>
    </aside>
  );
}
```

### Example Configs (per framework)

**Laravel:**
```typescript
export default defineConfig({
  collections: [/* ... */],
  storage: { adapter: 'filesystem', filesystem: { contentDir: 'content' } },
  build: {
    command: 'php artisan build',
    workingDir: '.',
    outDir: 'public',
    env: { APP_ENV: 'production' },
    timeout: 300,
  },
});
```

**Hugo:**
```typescript
build: {
  command: 'hugo --minify',
  outDir: 'public',
  env: { HUGO_ENV: 'production' },
}
```

**Jekyll:**
```typescript
build: {
  command: 'bundle exec jekyll build',
  outDir: '_site',
  env: { JEKYLL_ENV: 'production' },
}
```

**Rails (static asset build):**
```typescript
build: {
  command: 'bundle exec rails assets:precompile',
  outDir: 'public/assets',
  env: { RAILS_ENV: 'production' },
}
```

**Django (collectstatic):**
```typescript
build: {
  command: 'python manage.py collectstatic --no-input',
  outDir: 'staticfiles',
  env: { DJANGO_SETTINGS_MODULE: 'mysite.settings.production' },
}
```

**Astro:**
```typescript
build: {
  command: 'npm run build',
  outDir: 'dist',
}
```

**Eleventy:**
```typescript
build: {
  command: 'npx @11ty/eleventy',
  outDir: '_site',
}
```

**Multiple profiles (hybrid project):**
```typescript
build: {
  profiles: [
    {
      name: 'native',
      command: 'tsx build.ts',
      outDir: 'dist',
      description: 'Fast local build (TypeScript)',
    },
    {
      name: 'production',
      command: 'php artisan build',
      outDir: 'public',
      env: { APP_ENV: 'production' },
      description: 'Production Laravel build',
    },
    {
      name: 'docker',
      command: 'build',
      outDir: 'public',
      docker: { image: 'php:8.3-cli', workdir: '/workspace' },
      description: 'Isolated Docker build',
    },
  ],
  defaultProfile: 'production',
}
```

### Docker Mode

For hosted offerings where running arbitrary user commands is unsafe, Docker mode ensures commands run in isolated containers:

```typescript
build: {
  command: 'php artisan build',
  docker: {
    image: 'php:8.3-cli',
    workdir: '/workspace',
    env: { APP_ENV: 'production' },
  },
}
```

The executor wraps the command:
```
docker run --rm \
  -v /path/to/project:/workspace \
  -w /workspace \
  -e APP_ENV=production \
  php:8.3-cli \
  php artisan build
```

**Built-in image presets** (for common frameworks):

```typescript
// packages/cms-admin/src/lib/build/docker-presets.ts
export const DOCKER_PRESETS: Record<string, DockerConfig> = {
  php:     { image: 'php:8.3-cli', workdir: '/workspace' },
  laravel: { image: 'webhouse/laravel-build:8.3', workdir: '/workspace' },
  python:  { image: 'python:3.12-slim', workdir: '/workspace' },
  django:  { image: 'webhouse/django-build:3.12', workdir: '/workspace' },
  ruby:    { image: 'ruby:3.3', workdir: '/workspace' },
  rails:   { image: 'webhouse/rails-build:7.1', workdir: '/workspace' },
  go:      { image: 'golang:1.22', workdir: '/workspace' },
  hugo:    { image: 'klakegg/hugo:0.111', workdir: '/workspace' },
  node:    { image: 'node:22-alpine', workdir: '/workspace' },
  dotnet:  { image: 'mcr.microsoft.com/dotnet/sdk:8.0', workdir: '/workspace' },
};

// Use a preset via shorthand
build: {
  command: 'php artisan build',
  docker: 'laravel',  // expands to DOCKER_PRESETS.laravel
}
```

### Audit Logging

Every build execution is logged for security and debugging:

**File:** `packages/cms-admin/src/lib/build/audit.ts`

```typescript
interface BuildAuditEntry {
  buildId: string;
  timestamp: string;
  userId: string;
  userEmail: string;
  orgId: string;
  siteId: string;
  profile: string;
  command: string;
  workingDir: string;
  outDir: string;
  env: Record<string, string>;   // allowlisted keys only
  exitCode: number | null;
  duration: number;
  success: boolean;
  cancelled: boolean;
  stdoutTail: string;            // last 10KB
  stderrTail: string;            // last 10KB
}
```

Stored in `_data/build-audit.ndjson` (append-only). Viewable in CMS admin: Settings → Build History.

### Preview URL Handling

Preview URLs already work with arbitrary backends via `previewSiteUrl`. No changes needed for the base case.

**Enhancement:** Per-profile preview URL override:

```typescript
build: {
  profiles: [
    { name: 'dev',  command: 'tsx build.ts',       outDir: 'dist',   previewUrl: 'http://localhost:3000' },
    { name: 'prod', command: 'php artisan build',  outDir: 'public', previewUrl: 'http://localhost:8000' },
  ],
}
```

When the user switches profile, preview URL switches too.

---

## Implementation Phases

### Phase 1 — Basic Custom Command (3-4 days)

**Goal:** `build.command` in config works end-to-end with the native executor.

- [ ] Add `command`, `workingDir`, `env`, `timeout` to `BuildConfig` type
- [ ] `packages/cms-admin/src/lib/build/executor.ts` — basic executor (no Docker)
- [ ] `packages/cms-admin/src/lib/build/validate-paths.ts` — path validation
- [ ] `packages/cms-admin/src/lib/build/allowlist.ts` — command allowlist
- [ ] `packages/cms-admin/src/app/api/cms/build/execute/route.ts` — NDJSON API
- [ ] Wire existing Build button to new API (fall back to native if no command)
- [ ] Update deploy adapters to use `resolveBuildOutDir()`
- [ ] Unit tests for executor (timeout, exit code, env filtering)
- [ ] Unit tests for path validation (traversal, non-existent)
- [ ] Security tests for allowlist + command parsing

**Acceptance:** A user can add `build: { command: 'echo hello' }` to `cms.config.ts` and see "hello" in the admin build log.

### Phase 2 — Log Streaming UI (2-3 days)

**Goal:** Real-time build logs in a slide-out panel.

- [ ] `packages/cms-admin/src/components/build/build-log-panel.tsx`
- [ ] ANSI-to-HTML conversion helper (for colored terminal output)
- [ ] Auto-scroll, manual scroll, copy, download
- [ ] Cancel button (sends AbortController signal)
- [ ] Toast notifications for build start / success / failure
- [ ] E2E test: start build, verify logs stream, verify exit code

**Acceptance:** Clicking Build opens the panel, streams stdout/stderr in real time, shows success/failure state.

### Phase 3 — Build Profiles (3-4 days)

**Goal:** Multiple profiles per site, selector UI.

- [ ] Add `profiles`, `defaultProfile` to `BuildConfig`
- [ ] Split button UI for profile selection
- [ ] Profile resolver (`resolveProfile()`)
- [ ] Per-profile preview URL override
- [ ] Validation: profiles can't conflict with root command
- [ ] Unit tests for profile resolution
- [ ] Docs: `build-profiles` (EN+DA)

**Acceptance:** A site with 3 profiles shows a dropdown. Selecting a profile runs its command with its outDir. Deploy picks the right output.

### Phase 4 — Docker Mode (4-5 days)

**Goal:** Run builds inside Docker containers for isolation.

- [ ] Add `docker` config to `BuildConfig` and `BuildProfile`
- [ ] Docker executor wrapping (volume mounts, env, image)
- [ ] Built-in presets for common frameworks
- [ ] Docker image pull progress streaming
- [ ] Validation: Docker daemon available, image exists
- [ ] `requireDocker` org setting (for hosted offerings)
- [ ] Integration tests (skipped if Docker not available)
- [ ] Docs: `docker-builds` (EN+DA)

**Acceptance:** `build: { command: 'php artisan build', docker: 'laravel' }` runs inside a Laravel Docker container without PHP installed on the host.

### Phase 5 — ICD Integration (2 days)

**Goal:** Auto-build on save runs the custom command.

- [ ] `packages/cms-admin/src/lib/icd/auto-build.ts` — use executor
- [ ] Debounce/queue per-site (single concurrent build)
- [ ] Toast notifications for ICD builds (compact UI, not full panel)
- [ ] Setting: auto-build-on-save (per site, default: on for hosted, off for dev)
- [ ] Skip for draft saves, only trigger on publish
- [ ] Unit tests for debounce, queue, skip logic

**Acceptance:** Publishing a document in CMS admin automatically runs the configured build command and shows a toast with the result.

### Phase 6 — Audit + Security Polish (2 days)

**Goal:** Production-ready security and observability.

- [ ] `packages/cms-admin/src/lib/build/audit.ts` — audit log writer
- [ ] Build History UI in Settings
- [ ] Rate limiting (1 concurrent per site, 10/hour per user)
- [ ] Security scan: ensure no shell injection paths exist
- [ ] Penetration test: try to escape workingDir, inject env, run disallowed commands
- [ ] `scripts/security-scan.ts` rule: flag spawned commands without allowlist check
- [ ] Docs: `build-security` (EN+DA)

**Acceptance:** Security gate passes. Audit log shows every build with who/what/when. Rate limiting prevents abuse.

### Phase 7 — Framework Guides (2-3 days)

**Goal:** Framework-specific docs showing config + troubleshooting.

- [ ] `docs/build-laravel` (EN+DA) — Laravel build patterns
- [ ] `docs/build-hugo` (EN+DA) — Hugo build patterns
- [ ] `docs/build-rails` (EN+DA) — Rails + Jekyll
- [ ] `docs/custom-build-commands` (EN+DA) — General overview
- [ ] Update existing `consume-laravel` etc. to cross-link to `build-laravel`
- [ ] Example configs in each `examples/consumers/*/cms.config.ts`

**Acceptance:** A Laravel developer can read one docs page and have a working CMS admin + Laravel build pipeline in under 30 minutes.

---

## Files to Modify / Create

### New

- `packages/cms-admin/src/lib/build/executor.ts`
- `packages/cms-admin/src/lib/build/validate-paths.ts`
- `packages/cms-admin/src/lib/build/allowlist.ts`
- `packages/cms-admin/src/lib/build/audit.ts`
- `packages/cms-admin/src/lib/build/docker-presets.ts`
- `packages/cms-admin/src/lib/build/resolve-profile.ts`
- `packages/cms-admin/src/lib/build/__tests__/executor.test.ts`
- `packages/cms-admin/src/lib/build/__tests__/security.test.ts`
- `packages/cms-admin/src/app/api/cms/build/execute/route.ts`
- `packages/cms-admin/src/components/build/build-log-panel.tsx`
- `packages/cms-admin/src/components/build/profile-selector.tsx`
- `packages/cms-admin/src/components/build/build-history.tsx`
- `packages/cms-admin/src/app/admin/(workspace)/settings/build/page.tsx`
- `packages/cms-admin/tests/api/build-execute.test.ts`
- `packages/cms-admin/e2e/suites/26-framework-build.spec.ts`

### Modified

- `packages/cms/src/schema/types.ts` — add command, profiles, docker to BuildConfig
- `packages/cms/src/schema/site-validator.ts` — validate build.command, check allowlist format
- `packages/cms-admin/src/components/admin-header.tsx` — split button for profiles
- `packages/cms-admin/src/lib/deploy/vercel.ts` — use resolveBuildOutDir
- `packages/cms-admin/src/lib/deploy/netlify.ts` — use resolveBuildOutDir
- `packages/cms-admin/src/lib/deploy/flyio.ts` — use resolveBuildOutDir
- `packages/cms-admin/src/lib/deploy/github-pages.ts` — use resolveBuildOutDir
- `packages/cms-admin/src/lib/icd/auto-build.ts` — call executor
- `packages/cms-admin/src/lib/org-settings.ts` — add allowCustomBuildCommands, maxTimeout, requireDocker
- `packages/cms-admin/src/components/settings/org-settings-panel.tsx` — UI for build settings
- `packages/cms/CLAUDE.md` — document build.command
- `docs/ai-guide/13-site-building.md` — document build.command + profiles
- `docs/FEATURES.md` — add F126 entry

### External (new repos / docker images)

- `webhousecode/build-images` — Docker image definitions for framework presets (laravel-build, django-build, rails-build, etc.)
- DockerHub: `webhouse/laravel-build:8.3`, `webhouse/django-build:3.12`, etc.

---

## Testing Strategy

### Unit tests

- **Executor:**
  - Happy path (exit 0)
  - Non-zero exit code
  - Timeout triggers SIGTERM then SIGKILL
  - Cancellation via AbortSignal
  - Stdout/stderr streaming
  - Env var allowlist filters blocked vars
  - Command parsing: quoted args, escaped chars, empty
  - Docker mode: correct docker args assembled

- **Path validation:**
  - workingDir under projectDir → ok
  - workingDir traversal attempt (`../`) → throws
  - workingDir doesn't exist → throws
  - workingDir is a file, not dir → throws
  - outDir traversal → throws
  - Absolute path for workingDir → throws unless equal to project

- **Allowlist:**
  - No allowlist configured → any command allowed
  - Allowlist matches basename → allowed
  - Command not in allowlist → rejected
  - `allowCustomBuildCommands: false` → everything rejected
  - Docker required, command without docker → rejected

- **Command parsing:**
  - `php artisan build` → `['php', 'artisan', 'build']`
  - `bundle "exec test" foo` → `['bundle', 'exec test', 'foo']`
  - `echo 'hello world'` → `['echo', 'hello world']`
  - Empty → `[]`
  - Shell injection attempts (`$(rm -rf /)`) → parsed as literal, no shell

### Security tests (dedicated suite)

- **Shell injection:**
  - `command: 'echo; rm -rf /'` → executed as `echo ; rm -rf /` argv, no shell, safe
  - `command: 'echo $(cat /etc/passwd)'` → literal string, no substitution
  - Backticks, pipes, redirects → all literal
- **Path traversal:**
  - `workingDir: '../..'` → rejected
  - `workingDir: '/etc'` → rejected
  - Symlinks pointing outside project → resolved and rejected
- **Env injection:**
  - `env: { LD_PRELOAD: '/evil.so' }` → blocked
  - `env: { PATH: '/evil:/bin' }` → blocked
- **Resource exhaustion:**
  - Command that spawns infinite children → timeout + SIGKILL kills tree
  - Command that produces 10GB of stdout → memory bounded to 10KB tail
  - Command that sleeps longer than timeout → killed
- **Rate limiting:**
  - 2 concurrent builds on same site → second rejected
  - 11 builds in an hour → 11th rejected

### Integration tests

- **Native fallback:**
  - Config with no `build.command` → runs existing native pipeline unchanged
- **Simple command:**
  - `build: { command: 'echo hello > out.txt', outDir: '.' }` → file created, captured in logs
- **Multi-step command:**
  - `build: { command: 'npm install && npm run build' }` → both steps run (note: `&&` requires shell, so use a wrapper script)
- **Docker mode:**
  - `docker: { image: 'alpine:latest' }` + `command: 'echo hi'` → runs in container
  - Docker image not available → clear error message

### E2E tests

- `packages/cms-admin/e2e/suites/26-framework-build.spec.ts`:
  1. Open a test site with `build.command` configured
  2. Click Build button
  3. Verify log panel opens
  4. Verify stdout streams in real time
  5. Verify success state + exit code shown
  6. Verify deploy adapter picks up custom outDir
  7. Verify audit log has entry

- `packages/cms-admin/e2e/suites/27-framework-build-laravel.spec.ts` (integration with F125 example):
  1. Register `examples/consumers/laravel-blog` as a site
  2. Create a new post via admin UI (F125 JSON write)
  3. Click Build → runs `docker run php:8.3 ... php artisan build`
  4. Verify `public/` contains rendered HTML
  5. HTTP GET the Laravel blog → new post visible

---

## Performance & Limits

### Build execution

- **Concurrency:** 1 build per site at a time (queue additional requests)
- **Per-user rate limit:** 10 builds/hour
- **Timeout:** default 300s, max 900s (15 min)
- **Log buffer:** stream unlimited, store last 10KB of stdout + 10KB of stderr in audit
- **Cancel latency:** SIGTERM sent immediately, SIGKILL after 5s grace

### UI responsiveness

- Log panel must remain scrollable while receiving 1000+ lines/sec
- Virtualized list rendering (react-window or similar) for long logs
- Debounce auto-scroll to avoid jank

### Resource isolation (Docker mode)

- Memory limit: 2GB per container (configurable)
- CPU limit: 2 cores per container
- No network access by default (override: `docker.network: 'bridge'`)
- Tmpfs for /tmp to avoid disk writes escaping

---

## Security Considerations

### Threat model

**Attacker profile 1:** Malicious editor with admin rights on a single site. Can configure `build.command`.
- **Mitigation:** workingDir sandboxed to project dir. Commands run as CMS admin user (non-root in production). Audit log catches abuse.

**Attacker profile 2:** Malicious org admin. Can set `allowCustomBuildCommands: true` and configure allowlist.
- **Mitigation:** Org admin is trusted by definition. But hosted offering (webhouse.app SaaS) locks `requireDocker: true` so all commands run in containers.

**Attacker profile 3:** Compromised CMS admin with RCE in another feature. Wants to pivot via build executor.
- **Mitigation:** Executor is only one of many attack surfaces. Defense in depth: command parsing, env filtering, path validation, Docker isolation, audit log for forensics.

### Principles

1. **`shell: false` always** — no shell interpretation means no injection via `$()`, `` ` ``, `|`, `;`, `&&`, redirects.
2. **Argv parsing in code, not shell** — we parse the command string ourselves using a well-tested parser.
3. **Path validation before every filesystem operation** — workingDir, outDir, config path all validated against projectDir.
4. **Env var allowlist** — only named safe vars pass through. Blocked list covers known dangerous vars.
5. **Timeout enforcement** — SIGTERM + SIGKILL ensures no runaway processes.
6. **Audit log for forensics** — every execution recorded with user, command, output.
7. **Docker as escape hatch** — for untrusted environments, force Docker mode.
8. **Rate limiting** — prevents DoS via rapid build triggering.

### Code review checklist for F126 PRs

- [ ] No `shell: true` anywhere in executor
- [ ] No `exec()`, only `spawn()` (and `execFile()` where appropriate)
- [ ] Path validation before any fs operation
- [ ] Env vars filtered through allowlist
- [ ] Timeout always set
- [ ] Errors don't leak stack traces to client
- [ ] Audit log entry for every execution (even failures)
- [ ] Rate limit check before spawn
- [ ] Allowlist check before spawn

### Security gate integration

`scripts/security-scan.ts` adds a rule:

```typescript
// Rule: cms/build-executor-safety
// Flag any spawn/exec in packages/cms-admin that isn't in build/executor.ts
{
  pattern: /\b(spawn|exec|execSync|execFile|execFileSync)\s*\(/,
  excludePaths: [
    'packages/cms-admin/src/lib/build/executor.ts',
  ],
  severity: 'HIGH',
  message: 'Use build/executor.ts for subprocess execution — direct spawn() bypasses security controls',
}
```

---

## How F125 + F126 complete the story

F125 delivers content **read** access from any framework. F126 delivers content **build + deploy** from any framework. Together:

```
┌──────────────────────────────────────────────────────────────┐
│                   CMS admin (Next.js)                         │
│  ┌────────────┐  ┌─────────┐  ┌─────────┐  ┌────────────┐     │
│  │  Editor    │→ │   AI    │→ │Validate │→ │  Build     │     │
│  │  UI        │  │ Agents  │  │  Site   │  │  Button    │     │
│  └────┬───────┘  └─────────┘  └─────────┘  └─────┬──────┘     │
└───────┼────────────────────────────────────────────┼──────────┘
        │ writes JSON                                │ F126
        ▼                                            ▼ spawns
┌──────────────────┐                      ┌──────────────────────┐
│  content/        │ ← reads via F125 lib │  php artisan build   │
│    posts/*.json  │──────────────────────│  (or hugo, rails…)   │
└──────────────────┘                      └─────────┬────────────┘
                                                    │ outputs to
                                                    ▼
                                          ┌──────────────────────┐
                                          │  public/  _site/     │
                                          └─────────┬────────────┘
                                                    │ F12 deploy
                                                    ▼
                                          ┌──────────────────────┐
                                          │  Netlify / Fly / …   │
                                          └──────────────────────┘
```

**User experience after F125 + F126:**

1. A Laravel team installs CMS admin (via Docker, one command)
2. They add `cms.config.ts` to their Laravel project (or `cms.config.json` in Phase 5 of F125)
3. They `composer require webhouse/cms-reader` (F125)
4. They configure `build: { command: 'php artisan build', outDir: 'public' }` (F126)
5. Content editors log into CMS admin, edit posts, click Save
6. CMS admin writes JSON → runs `php artisan build` → Laravel renders → deploy adapter pushes to Fly.io
7. Done. No terminal. No CI/CD setup. No custom scripts.

**Same pattern works for:** Django, Rails, Go (Hugo), .NET, Astro, Eleventy, Jekyll, SvelteKit, Nuxt, Gatsby, 11ty, and anything else that has a CLI build command.

---

## Success Metrics

### Phase 1-2 acceptance
- `build.command` in config runs successfully in executor
- Log panel streams output in real time
- Security tests pass (shell injection, path traversal, env injection)
- Existing sites without `build.command` continue to work unchanged

### Phase 3-4 acceptance
- Multiple profiles work with selector UI
- Docker mode runs successfully with built-in presets
- Deploy adapters respect resolved outDir
- Audit log captures every execution

### Phase 5-6 acceptance
- ICD triggers custom builds on publish
- Rate limiting prevents abuse
- Org settings work for hosted vs self-hosted
- Security gate passes

### Phase 7 acceptance
- 7 bilingual docs pages live
- Each framework-specific guide has working config + troubleshooting
- Example consumer apps (F125 Phase 3) successfully build via F126

### Post-launch metrics
- **Adoption:** >10 sites using custom `build.command` in first month
- **Framework diversity:** >3 different frameworks in production (Laravel, Hugo, Django, etc.)
- **Security:** zero reported build executor vulnerabilities in first 6 months
- **UX:** build log panel used without complaints about performance

---

## Open Questions

1. **Default timeout: 300s or longer?** Hugo builds can be seconds, Laravel builds can be minutes, Rails asset precompilation can be 10+ minutes. Recommendation: 300s default, max 900s, configurable per-site up to org max.

2. **Should we support `command` arrays for multi-step builds?** Instead of `command: 'npm install && npm run build'`, support `command: [['npm', 'install'], ['npm', 'run', 'build']]`. Pro: no shell needed. Con: more complex. **Recommendation:** start with single command + document the "wrapper script" pattern for multi-step.

3. **How do we handle builds that need network access?** Docker mode should allow optional network. Native mode always has network. Document this clearly.

4. **Should profile switching require re-authentication?** For hosted offerings, maybe — switching from `native` (trusted) to `docker` (trusted) isn't sensitive, but a custom command profile change might be. **Recommendation:** audit log + confirmation dialog for command changes, no re-auth.

5. **Can we run builds in a separate process pool?** For scale, yes — a dedicated build worker process outside the Next.js server. **Recommendation:** Phase 8 (post-MVP). Single-process is fine for <100 builds/day.

6. **Should we ship a "framework detection" wizard?** Analyze the project directory and suggest a build command (detect `composer.json` → Laravel, `Gemfile` → Rails, `go.mod` → Go, etc.). **Recommendation:** yes, post-MVP as a nice-to-have.

7. **Integration with F120 (Onboarding)?** The onboarding flow should suggest `build.command` templates based on detected framework. **Recommendation:** yes, wire in after F120 ships.

8. **Cancellation behavior for ICD builds?** If a new save arrives while a build is running, cancel the old one? Queue? Debounce? **Recommendation:** debounce — wait 5s after last save, then run one build.

---

## Related Features

- **F125** — Framework-Agnostic Consumer Guides (content READ; F126 is the corresponding BUILD layer)
- **F12** — Deploy Targets (must use `resolveBuildOutDir()`)
- **F67** — Security Gate (must pass new executor security rules)
- **F79** — Site Config Validator (validate `build.command` format)
- **F120** — Onboarding (suggest build commands based on detected framework)
- **F87** — Org Settings (new per-org build settings)

---

## Priority Justification

**Why this is Tier 1:**

1. **It completes F125.** Without F126, the framework-agnostic story is half-done. You can read content from Laravel but can't build from CMS admin. Every Laravel user who tries us will hit this wall immediately.

2. **It's the "one-click" that makes @webhouse/cms uniquely valuable.** Contentful and Sanity can't do this because they have no idea how your site is built. @webhouse/cms knows because you tell it in config. That's a structural advantage.

3. **Security is the blocker, not complexity.** The executor logic is ~200 LOC. The security review is ~200 hours of review + testing. Budget accordingly, but the work itself is bounded.

4. **It unlocks hosted offering pricing.** A hosted @webhouse/cms SaaS becomes viable because we can isolate builds in Docker containers. Without F126, hosted means "you build, we host" which is weaker than competitors.

5. **It creates a new market category.** "CMS that builds your site with any framework" doesn't exist yet. We'd be first.

---

> **Testing (F99):** Critical security feature — comprehensive tests required before merge.
> - Unit tests → `packages/cms-admin/src/lib/build/__tests__/*.test.ts`
> - Security tests → dedicated `__tests__/security.test.ts` with path traversal, injection, env attacks
> - API tests → `packages/cms-admin/tests/api/build-execute.test.ts`
> - E2E → `packages/cms-admin/e2e/suites/26-framework-build.spec.ts` + `27-framework-build-laravel.spec.ts`
> - Integration with F125 example apps: CI builds all 5 consumer examples via F126 executor
> - Manual penetration test before Phase 6 ships
