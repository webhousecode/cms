# F119 — One-Click Docker Deploy

> Deploy a complete CMS-powered site to Fly.io (or any Docker host) with a few clicks from webhouse.app — auto-generated Dockerfile, secrets, and admin account.

**Status:** Planned
**Depends on:** F12 (One-Click Publish), F42 (Framework Boilerplates)

---

## Problem

Today, deploying a @webhouse/cms site requires manual Docker knowledge: writing Dockerfiles, configuring fly.toml, setting secrets, managing two processes. This is a barrier for non-DevOps users and slows down agencies deploying client sites.

There is no way to go from "I have a template" to "it's live on a URL" without touching the terminal.

## Solution

A deploy wizard in webhouse.app (and optionally docs.webhouse.app) that:
1. Lets users pick a template/boilerplate or connect an existing repo
2. Chooses a deployment model (combined or split)
3. Auto-generates Dockerfile + fly.toml
4. Deploys to the user's Fly.io account (or downloads files for self-hosting)
5. Creates an admin account automatically on first boot

Two deployment models:
- **Combined:** CMS admin + site in one container (simple, cheap)
- **Split:** CMS admin and site as separate containers with webhook content push (production-grade)

## Technical Design

### 1. Deploy Wizard UI

New admin page at `/admin/deploy/docker` (or standalone on docs.webhouse.app):

```typescript
// packages/cms-admin/src/app/admin/(workspace)/deploy/docker/page.tsx

interface DeployConfig {
  model: "combined" | "split";
  template: string;              // "nextjs" | "static" | "blog" | "agency" | etc.
  target: "flyio" | "railway" | "download";
  appName: string;               // e.g. "my-client-site"
  region: string;                // e.g. "arn" (Stockholm)
  flyApiToken?: string;          // Fly.io personal access token
  adminEmail: string;
  vmSize: "shared-1x" | "shared-2x" | "performance-1x";
}
```

Wizard steps:
1. **Choose template** — grid of boilerplates/examples with screenshots
2. **Choose model** — combined vs. split with architecture diagram
3. **Configure** — app name, region, VM size
4. **Connect provider** — Fly.io API token (stored encrypted, never logged)
5. **Deploy** — progress log with real-time status

### 2. Dockerfile Generator

```typescript
// packages/cms-admin/src/lib/deploy/docker-generator.ts

export function generateDockerfile(config: DeployConfig): string {
  if (config.model === "combined") {
    return generateCombinedDockerfile(config);
  }
  return {
    admin: generateAdminDockerfile(config),
    site: generateSiteDockerfile(config),
  };
}

export function generateFlyToml(config: DeployConfig): string {
  return `app = "${config.appName}"
primary_region = "${config.region}"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true

[[vm]]
  memory = "${config.vmSize === 'shared-1x' ? '256mb' : '512mb'}"
  cpu_kind = "shared"
  cpus = 1
`;
}

export function generateStartScript(config: DeployConfig): string {
  if (config.model === "combined") {
    return `#!/bin/sh
# Start CMS admin + site in parallel
cd /app/admin && PORT=3010 node server.js &
cd /app/site && PORT=3000 node server.js &
wait
`;
  }
  return `#!/bin/sh\nnode server.js`;
}
```

### 3. Fly.io API Integration

```typescript
// packages/cms-admin/src/lib/deploy/flyio-client.ts

export class FlyioClient {
  constructor(private token: string) {}

  async createApp(name: string, org: string): Promise<{ id: string; hostname: string }> {
    const res = await fetch("https://api.machines.dev/v1/apps", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ app_name: name, org_slug: org }),
    });
    return res.json();
  }

  async setSecrets(appName: string, secrets: Record<string, string>): Promise<void> {
    await fetch(`https://api.machines.dev/v1/apps/${appName}/secrets`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(secrets),
    });
  }

  async deploy(appName: string, imageRef: string, config: MachineConfig): Promise<void> {
    // Create machine with the built image
    await fetch(`https://api.machines.dev/v1/apps/${appName}/machines`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        config: {
          image: imageRef,
          env: config.env,
          services: [{ ports: [{ port: 443, handlers: ["tls", "http"] }], internal_port: config.internalPort }],
          guest: { cpu_kind: "shared", cpus: 1, memory_mb: 512 },
        },
        region: config.region,
      }),
    });
  }

  async allocateIps(appName: string): Promise<{ v4: string; v6: string }> {
    // Allocate shared IPv4 + dedicated IPv6
  }
}
```

### 4. Template Fetcher

Downloads template from GitHub and prepares it for Docker build:

```typescript
// packages/cms-admin/src/lib/deploy/template-fetcher.ts

export async function fetchTemplate(templateName: string): Promise<Buffer> {
  // Download tar.gz from GitHub
  const url = `https://codeload.github.com/webhousecode/cms/tar.gz/main`;
  const res = await fetch(url);
  const tar = await res.arrayBuffer();

  // Extract only the relevant subdirectory
  // e.g. examples/nextjs-boilerplate/ for "nextjs"
  return extractSubdirectory(Buffer.from(tar), resolveTemplatePath(templateName));
}

function resolveTemplatePath(name: string): string {
  const map: Record<string, string> = {
    static: "examples/static-boilerplate",
    nextjs: "examples/nextjs-boilerplate",
    "nextjs-github": "examples/nextjs-github-boilerplate",
    blog: "examples/blog",
    landing: "examples/landing",
    agency: "examples/static/agency",
    freelancer: "examples/static/freelancer",
    portfolio: "examples/static/portfolio",
    studio: "examples/static/studio",
    boutique: "examples/static/boutique",
  };
  return map[name] ?? `examples/${name}`;
}
```

### 5. Auto-Created Admin Account

On first boot, the CMS admin checks if any users exist. If not, it creates one:

```typescript
// packages/cms-admin/src/lib/auth/auto-setup.ts

export async function ensureAdminAccount(): Promise<void> {
  const users = await listUsers();
  if (users.length > 0) return; // Already set up

  const password = process.env.ADMIN_PASSWORD || generateSecurePassword();
  await createUser({
    email: process.env.ADMIN_EMAIL || "admin@webhouse.app",
    password,
    role: "admin",
  });

  if (!process.env.ADMIN_PASSWORD) {
    console.log(`\n  ✓ Admin account created`);
    console.log(`    Email: admin@webhouse.app`);
    console.log(`    Password: ${password}`);
    console.log(`    Change this after first login!\n`);
  }
}
```

### 6. Deploy Progress API (SSE)

```typescript
// packages/cms-admin/src/app/api/admin/deploy/docker/route.ts

export async function POST(request: NextRequest) {
  const config: DeployConfig = await request.json();

  // Return SSE stream with deploy progress
  const stream = new ReadableStream({
    async start(controller) {
      const send = (step: string, status: string) =>
        controller.enqueue(`data: ${JSON.stringify({ step, status })}\n\n`);

      send("template", "Downloading template...");
      const template = await fetchTemplate(config.template);

      send("dockerfile", "Generating Dockerfile...");
      const dockerfile = generateDockerfile(config);

      send("flyio", "Creating Fly.io app...");
      const fly = new FlyioClient(config.flyApiToken!);
      const app = await fly.createApp(config.appName, "personal");

      send("secrets", "Setting secrets...");
      await fly.setSecrets(config.appName, {
        ADMIN_PASSWORD: generateSecurePassword(),
        NODE_ENV: "production",
      });

      send("deploy", "Building and deploying...");
      // Trigger remote build via Fly.io Machines API
      await fly.deploy(config.appName, /* ... */);

      send("dns", "Configuring DNS...");
      await fly.allocateIps(config.appName);

      send("done", `Live at https://${config.appName}.fly.dev`);
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}
```

### 7. "Download Dockerfile" Alternative

For users who don't want to connect a Fly.io token:

```typescript
// Generate a ZIP with everything needed to self-deploy
export async function generateDeployPackage(config: DeployConfig): Promise<Buffer> {
  const zip = new JSZip();

  // Template files
  const template = await fetchTemplate(config.template);
  zip.file("site/", template);

  // Generated files
  zip.file("Dockerfile", generateDockerfile(config));
  zip.file("fly.toml", generateFlyToml(config));
  zip.file("start.sh", generateStartScript(config));
  zip.file(".env.example", generateEnvExample(config));
  zip.file("README.md", generateDeployReadme(config));

  return zip.generateAsync({ type: "nodebuffer" });
}
```

## Impact Analysis

### Files affected

**New files:**
- `packages/cms-admin/src/app/admin/(workspace)/deploy/docker/page.tsx` — wizard UI
- `packages/cms-admin/src/lib/deploy/docker-generator.ts` — Dockerfile generation
- `packages/cms-admin/src/lib/deploy/flyio-client.ts` — Fly.io Machines API client
- `packages/cms-admin/src/lib/deploy/template-fetcher.ts` — GitHub template download
- `packages/cms-admin/src/lib/auth/auto-setup.ts` — first-boot admin account
- `packages/cms-admin/src/app/api/admin/deploy/docker/route.ts` — deploy API endpoint

**Modified files:**
- `packages/cms-admin/src/components/sidebar.tsx` — add "Docker Deploy" nav item under Deploy section

### Downstream dependents

`packages/cms-admin/src/components/sidebar.tsx` is imported by:
- `packages/cms-admin/src/app/admin/layout.tsx` (1 ref) — unaffected, renders sidebar

### Blast radius
- New pages/routes only — no existing functionality changed
- Fly.io API token is sensitive — must NEVER be logged or stored in plaintext. Use encrypted site config field.
- Auto-created admin account: ensure it's ONLY created when zero users exist (not on every restart)
- Template fetcher downloads from GitHub — needs error handling for rate limits and network failures

### Breaking changes
None — entirely new functionality.

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Dockerfile generator produces valid Dockerfile for combined model
- [ ] Dockerfile generator produces valid Dockerfiles for split model
- [ ] fly.toml generator produces valid config with correct region
- [ ] Template fetcher downloads and extracts correct directory
- [ ] Auto-setup creates admin account only when no users exist
- [ ] "Download Dockerfile" produces valid ZIP
- [ ] Regression: existing deploy (F12) still works

## Implementation Steps

### Phase 1 — Dockerfile Generator (Day 1)
1. `docker-generator.ts` — combined + split Dockerfile templates
2. `fly.toml` generator with region/VM config
3. `start.sh` generator for combined mode
4. Unit tests for all generators

### Phase 2 — Template Fetcher (Day 1-2)
5. `template-fetcher.ts` — download from GitHub tar.gz
6. Extract subdirectory from tar
7. Template path resolver (name → examples/ path)
8. "Download Dockerfile" ZIP package generator

### Phase 3 — Fly.io Client (Day 2-3)
9. `flyio-client.ts` — Machines API wrapper
10. Create app, set secrets, deploy machine, allocate IPs
11. SSE progress stream endpoint
12. Error handling + retry for API calls

### Phase 4 — Wizard UI (Day 3-4)
13. Template picker with screenshots (reuse docs screenshots)
14. Model selector (combined/split) with architecture diagrams
15. Config form (app name, region, VM size)
16. Fly.io token input (encrypted, never stored in logs)
17. Deploy progress view with real-time SSE updates
18. Success page with URL, admin credentials, next steps

### Phase 5 — Auto-Setup (Day 4)
19. `auto-setup.ts` — first-boot admin account creation
20. `ADMIN_PASSWORD` env var support
21. Console output with credentials on first boot
22. Sidebar nav item for Docker Deploy

### Phase 6 — docs.webhouse.app Integration (Day 5)
23. "Deploy Now" button on docs landing page and templates page
24. Lightweight version of wizard that redirects to webhouse.app for the actual deploy
25. Or standalone deploy page on docs.webhouse.app that calls the API directly

## Dependencies

- **F12 One-Click Publish** — existing deploy infrastructure (Done)
- **F42 Framework Boilerplates** — templates to deploy (Done, Phase 2 adds --template flag)
- **Fly.io Machines API** — external dependency, well-documented
- **RBAC** (future) — admin account roles. Until then, first user = admin.

## Effort Estimate

**Medium** — 5 days

- Day 1: Dockerfile + fly.toml generators
- Day 2: Template fetcher + download package
- Day 3: Fly.io API client + SSE progress
- Day 4: Wizard UI
- Day 5: Auto-setup + docs integration + testing

---

> **Testing (F99):** This feature MUST include tests using the [F99 Test Infrastructure](F99-e2e-testing-suite.md).

> **i18n (F48):** Deploy wizard UI must support English and Danish. Use `getLocale()` for runtime locale resolution.
