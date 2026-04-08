# F126 — Framework-Agnostic Build Pipeline

**Status:** Planned
**Size:** Large
**Tier:** 1 (v1.0 — Launch)
**Created:** 2026-04-08

> Let CMS admin's "Build" button invoke ANY build system, not just our native TypeScript `npx cms build`. Configure custom build commands per site so Laravel, Hugo, Jekyll, Django, Rails, or any other framework can be the renderer.

## Problem

Today, CMS admin's build + save-trigger pipeline assumes TypeScript:

- "Build" button runs `npx cms build` (our native pipeline)
- ICD (Instant Content Deployment) on save assumes `dist/` output
- Deploy adapters expect files in `dist/`
- Preview URL assumes a Next.js or sirv-served build

This locks out every non-TS backend. Even though the **content** is framework-agnostic (F125), the **build pipeline** isn't. A Laravel developer can't click "Build" in CMS admin and have `php artisan build` run.

## Solution

Add a `build` configuration section to `cms.config.ts` that tells CMS admin what command to run, where it runs, and where the output lands. Optionally support multiple profiles (dev/prod, native/docker).

CMS admin executes the command via `child_process.spawn()` with proper security controls (allowlist, timeout, workingDir validation, streamed logs).

## Technical Design

### 1. Config Schema Extension

**File:** `packages/cms/src/schema/types.ts`

```typescript
export interface BuildConfig {
  /** Output directory (relative to workingDir or config file). Deploy adapters pick from here. */
  outDir?: string;

  /** Base URL for generated links. */
  baseUrl?: string;

  // ── NEW: Custom build command ──────────────────────────
  /** Shell command to execute. Defaults to native CMS pipeline. */
  command?: string;

  /** Working directory for the command (relative to config file, default: config dir). */
  workingDir?: string;

  /** Env vars to set for the command. */
  env?: Record<string, string>;

  /** Timeout in seconds. Default: 300 (5 min). Max: 900 (15 min). */
  timeout?: number;

  /** Multiple build profiles (optional). */
  profiles?: BuildProfile[];

  /** Default profile name (if using profiles). */
  defaultProfile?: string;

  // ... existing: rss, robots
}

export interface BuildProfile {
  name: string;
  command: string;
  outDir: string;
  workingDir?: string;
  env?: Record<string, string>;
  description?: string;
}
```

### 2. Example configs

**Laravel:**
```typescript
export default defineConfig({
  collections: [...],
  storage: { adapter: 'filesystem', filesystem: { contentDir: 'content' } },
  build: {
    command: 'php artisan build',
    workingDir: '.',
    outDir: 'public',
    env: { APP_ENV: 'production' },
  },
});
```

**Hugo:**
```typescript
build: {
  command: 'hugo --minify',
  outDir: 'public',
}
```

**Jekyll:**
```typescript
build: {
  command: 'bundle exec jekyll build',
  outDir: '_site',
}
```

**Multiple profiles:**
```typescript
build: {
  profiles: [
    { name: 'native', command: 'tsx build.ts', outDir: 'dist', description: 'TypeScript static generator' },
    { name: 'laravel', command: 'php artisan build', outDir: 'public', description: 'Laravel production build' },
    { name: 'docker', command: 'docker build -t my-site .', outDir: 'build/docker', description: 'Containerized build' },
  ],
  defaultProfile: 'laravel',
}
```

### 3. CMS Admin Execution Layer

**New file:** `packages/cms-admin/src/lib/build/executor.ts`

```typescript
import { spawn } from 'child_process';
import path from 'path';

export interface BuildResult {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  duration: number;
  outDir: string;
}

export async function executeBuild(options: {
  command: string;
  workingDir: string;          // absolute, validated
  env: Record<string, string>;
  timeout: number;             // seconds
  onLog?: (line: string, stream: 'stdout' | 'stderr') => void;
}): Promise<BuildResult> {
  const start = Date.now();

  // Security: validate workingDir is under the site's project directory
  // (caller must provide absolute path resolved against config)

  return new Promise((resolve, reject) => {
    const [cmd, ...args] = options.command.split(/\s+/);
    const child = spawn(cmd!, args, {
      cwd: options.workingDir,
      env: { ...process.env, ...options.env },
      shell: false, // execFile-style, no shell injection
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Build timeout after ${options.timeout}s`));
    }, options.timeout * 1000);

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      options.onLog?.(text, 'stdout');
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      options.onLog?.(text, 'stderr');
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        success: code === 0,
        exitCode: code,
        stdout,
        stderr,
        duration: Date.now() - start,
        outDir: '', // filled by caller
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
```

**Security requirements:**
- `shell: false` — no shell interpolation
- Working directory MUST be validated as a subpath of the site's project directory
- Timeout enforced with `SIGKILL`
- Env vars whitelisted (no `LD_PRELOAD` etc.)
- Per-org setting: `allowCustomBuildCommands: boolean` (default: true for self-hosted, false for hosted)

### 4. API Route

**New file:** `packages/cms-admin/src/app/api/cms/build/execute/route.ts`

NDJSON streaming endpoint (same pattern as SEO optimize-bulk):

```typescript
POST /api/cms/build/execute
{
  profile?: string;  // optional — uses defaultProfile or native
}

→ Streams:
{ "type": "start", "profile": "laravel", "command": "php artisan build" }
{ "type": "log", "stream": "stdout", "line": "..." }
{ "type": "log", "stream": "stderr", "line": "..." }
{ "type": "complete", "success": true, "duration": 12345, "outDir": "public" }
```

### 5. Admin UI Changes

**File:** `packages/cms-admin/src/components/admin-header.tsx` (or wherever build button lives)

- Build button becomes a split button: `[Build ▾]`
- Dropdown shows available profiles (if multiple)
- Click → streams logs to a side panel
- Shows exit code + duration on completion
- Failures show stderr excerpt

**Log panel:**
- New component: `BuildLogPanel` with ANSI color support
- Slides in from the right
- Auto-scrolls to bottom
- "Copy logs" button

### 6. Deploy Integration

Deploy adapters (Vercel, Netlify, Fly.io, GitHub Pages) already pick from `build.outDir`. They just need to respect the **resolved** outDir from the active profile:

```typescript
// packages/cms-admin/src/lib/deploy/vercel.ts
const outDir = getResolvedBuildOutDir(config); // respects active profile
```

### 7. ICD (Instant Content Deployment) Integration

**File:** `packages/cms-admin/src/lib/icd/auto-build.ts`

When content is saved with ICD enabled:
1. Invoke `executeBuild` with the default profile
2. If success → trigger deploy (existing flow)
3. If failure → log + notify

### 8. Preview URL Handling

Preview URLs already work with arbitrary backends via `previewSiteUrl`. No changes needed — Laravel running on `:8000`, Django on `:8000`, Rails on `:3000` all work today.

**Optional enhancement:** Per-profile `previewUrl` override so you can switch between frameworks for testing.

## Security Considerations

1. **Command allowlist per org** — org admin can restrict which commands are allowed
2. **No shell interpolation** — `shell: false` in spawn
3. **Path validation** — workingDir must be under projectDir (use `path.relative()` check)
4. **Timeout enforcement** — SIGKILL on timeout
5. **Env var whitelisting** — block `LD_PRELOAD`, `PATH` injection
6. **Audit log** — every build execution logged with user, command, exit code, duration
7. **Docker mode (optional)** — run build in container with sprog-specific image for isolation

## Implementation Phases

1. **Phase 1 — Basic custom command** (M)
   - Add `build.command` + `build.outDir` to config schema
   - Implement `executeBuild` executor
   - Wire into existing Build button
   - Update deploy adapters to use resolved outDir

2. **Phase 2 — Log streaming UI** (M)
   - NDJSON streaming API route
   - BuildLogPanel component
   - Error/success notifications

3. **Phase 3 — Build profiles** (M)
   - Multiple profiles config
   - Profile selector dropdown
   - Per-profile preview URL

4. **Phase 4 — Docker mode** (L)
   - Docker executor
   - Language-specific base images
   - Volume mounts for content + output

5. **Phase 5 — Framework guides** (M)
   - Docs pages for each supported framework
   - Example configs in `examples/consumers/`

## Files to Create / Modify

- New: `packages/cms-admin/src/lib/build/executor.ts`
- New: `packages/cms-admin/src/app/api/cms/build/execute/route.ts`
- New: `packages/cms-admin/src/components/build/build-log-panel.tsx`
- Edit: `packages/cms/src/schema/types.ts` — add command/profiles to BuildConfig
- Edit: `packages/cms/src/schema/site-validator.ts` — validate build.command
- Edit: `packages/cms-admin/src/components/admin-header.tsx` — profile selector
- Edit: `packages/cms-admin/src/lib/deploy/*.ts` — respect profile outDir
- Edit: `packages/cms-admin/src/lib/icd/auto-build.ts` — use executor
- Edit: `packages/cms/CLAUDE.md` — document build.command

## Priority

**Tier 1 — strategic.** Together with F125, this is what makes @webhouse/cms a universal content platform instead of a TypeScript-only CMS. Without it, the "framework-agnostic" positioning is only half-true: you can read the content from anywhere, but you can't build it from anywhere using our admin UI.

---

> **Testing (F99):** Critical security feature — must have comprehensive tests.
> - Unit tests → `packages/cms-admin/src/lib/build/__tests__/executor.test.ts` (command parsing, timeout, exit codes)
> - Security tests → path traversal, shell injection, env var injection
> - API tests → NDJSON streaming contract
> - E2E → build example with native + custom command profile

## Related

- **F125** — Framework-Agnostic Consumer Guides (content READ; this feature is BUILD)
- **F12** — Deploy targets (must respect profile outDir)
- **F67** — Security Gate (executor must pass security review)
