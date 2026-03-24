# F101 — Update Manager

> Automatisk versionstjek, update-notifikationer i CMS admin, og CLI/Docker update-flows så alle webhouse.app-installationer kan holdes opdateret.

## Problem

Der er i dag ingen mekanisme til at fortælle brugere af webhouse.app at der er en ny version. Tre deployment-scenarier eksisterer:

1. **npm-baseret (developers)** — kører `pnpm add @webhouse/cms@latest` manuelt, men ved ikke hvornår der er en ny version
2. **Self-hosted Docker** — kører `docker pull`, men ved heller ikke hvornår
3. **Hub/SaaS (F70)** — vi deployer selv via CI/CD, ikke relevant her

WordPress løste dette for 20 år siden med "Update Available"-banneret. Vi har brug for det samme, tilpasset Node.js/Docker-verdenen:

- Brugere opdager ikke nye versioner, sikkerhedspatches eller bugfixes
- Ingen changelog-visning — brugere må selv finde GitHub releases
- Ingen automatiseret update-workflow — selv developers skal manuelt huske at køre `pnpm update`
- Ingen rollback hvis en update bryder noget

## Solution

Fire-lags update-system:

1. **Version Check Service** — scheduler-task der dagligt tjekker npm registry for nyeste version af alle `@webhouse/*` pakker
2. **Update Notification i admin** — banner + changelog + breaking changes warning når en ny version er tilgængelig
3. **CLI: `cms update`** — automatiserer dependency update + rebuild + health check + optional rollback
4. **Docker Auto-Update** — opt-in via env var, pull new image + graceful restart

**Anbefalet scope for v1:** Version check + notification + CLI update. Docker auto-update som v2.

## Technical Design

### 1. Version Check Service

Ny scheduler-task i `instrumentation.ts` — kører én gang dagligt (24h interval). Tjekker npm registry for alle `@webhouse/*` pakker.

```typescript
// packages/cms-admin/src/lib/version-check.ts

interface VersionInfo {
  package: string;
  current: string;
  latest: string;
  hasUpdate: boolean;
  breaking: boolean;        // major version bump
  changelog?: string;       // markdown fra GitHub release
  publishedAt?: string;     // ISO date
}

interface UpdateStatus {
  checkedAt: string;
  packages: VersionInfo[];
  hasUpdates: boolean;
  hasBreaking: boolean;
}

const PACKAGES = [
  "@webhouse/cms",
  "@webhouse/cms-admin",
  "@webhouse/cms-cli",
  "@webhouse/cms-ai",
  "@webhouse/cms-mcp-server",
  "@webhouse/cms-mcp-client",
  "create-@webhouse/cms",
];

/**
 * Check npm registry for latest versions.
 * Uses the public npm registry API — no auth needed.
 */
export async function checkForUpdates(): Promise<UpdateStatus> {
  const packages: VersionInfo[] = [];

  for (const pkg of PACKAGES) {
    try {
      // npm registry public API
      const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`);
      if (!res.ok) continue;
      const data = await res.json();

      const current = getCurrentVersion(pkg);
      const latest = data.version;
      const breaking = semverMajor(latest) > semverMajor(current);

      packages.push({
        package: pkg,
        current,
        latest,
        hasUpdate: latest !== current,
        breaking,
        publishedAt: data.time?.[latest],
      });
    } catch {
      // Non-critical — skip package if registry unreachable
    }
  }

  const status: UpdateStatus = {
    checkedAt: new Date().toISOString(),
    packages,
    hasUpdates: packages.some((p) => p.hasUpdate),
    hasBreaking: packages.some((p) => p.breaking),
  };

  // Persist to _data/update-status.json
  await writeUpdateStatus(status);
  return status;
}

function getCurrentVersion(pkg: string): string {
  try {
    // Read from node_modules/<pkg>/package.json
    const pkgJson = require(`${pkg}/package.json`);
    return pkgJson.version;
  } catch {
    return "0.0.0";
  }
}

function semverMajor(version: string): number {
  return parseInt(version.split(".")[0], 10);
}
```

### 2. Scheduler Integration

Tilføjes som task 5 i `instrumentation.ts`:

```typescript
// ── 5. Version check (dagligt) ──────────────────────────────
async function versionCheckTick() {
  try {
    const { checkForUpdates } = await import("./lib/version-check");
    const status = await checkForUpdates();
    if (status.hasUpdates) {
      const updates = status.packages.filter(p => p.hasUpdate);
      console.log(`[update-check] ${updates.length} update(s) available:`,
        updates.map(u => `${u.package} ${u.current}→${u.latest}`).join(", "));
    }
  } catch (err) {
    console.error("[update-check] error:", err);
  }
}

// Første check 10 min efter startup, derefter hver 24. time
setTimeout(versionCheckTick, 10 * 60_000);
setInterval(versionCheckTick, 24 * 60 * 60_000);
```

### 3. API Endpoint

```
GET /api/admin/update-status
Response: UpdateStatus (fra _data/update-status.json)

POST /api/admin/update-status/check
Response: UpdateStatus (force refresh)
```

```typescript
// packages/cms-admin/src/app/api/admin/update-status/route.ts

export async function GET() {
  const status = await readUpdateStatus();
  return NextResponse.json(status ?? { checkedAt: null, packages: [], hasUpdates: false });
}
```

```typescript
// packages/cms-admin/src/app/api/admin/update-status/check/route.ts

export async function POST() {
  const { checkForUpdates } = await import("@/lib/version-check");
  const status = await checkForUpdates();
  return NextResponse.json(status);
}
```

### 4. Admin UI — Update Banner

Vises i top-baren på alle admin-sider når updates er tilgængelige:

```
┌──────────────────────────────────────────────────────────────┐
│ ⬆ Update available: @webhouse/cms 0.2.11 → 0.3.0            │
│   3 packages have updates. [View details] [Dismiss]          │
└──────────────────────────────────────────────────────────────┘
```

Breaking changes får en rød variant:

```
┌──────────────────────────────────────────────────────────────┐
│ ⚠ Breaking update: @webhouse/cms 0.2.11 → 1.0.0             │
│   Major version bump — check changelog before updating.      │
│   [View changelog] [Dismiss]                                 │
└──────────────────────────────────────────────────────────────┘
```

Implementeres som en global banner-komponent i admin layout:

```typescript
// packages/cms-admin/src/components/update-banner.tsx

"use client";

import { useEffect, useState } from "react";
import { ArrowUpCircle, AlertTriangle, X } from "lucide-react";

interface UpdateStatus {
  hasUpdates: boolean;
  hasBreaking: boolean;
  packages: Array<{
    package: string;
    current: string;
    latest: string;
    hasUpdate: boolean;
    breaking: boolean;
  }>;
}

export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check localStorage for dismissed version
    const dismissedVersion = localStorage.getItem("cms:update-dismissed");

    fetch("/api/admin/update-status")
      .then((r) => r.json())
      .then((data) => {
        if (data.hasUpdates) {
          const latestVersion = data.packages.find((p: any) => p.hasUpdate)?.latest;
          if (dismissedVersion === latestVersion) return; // Already dismissed this version
          setStatus(data);
        }
      })
      .catch(() => {}); // Non-critical
  }, []);

  if (!status?.hasUpdates || dismissed) return null;

  const updates = status.packages.filter((p) => p.hasUpdate);
  const primary = updates[0];

  return (
    <div
      style={{
        background: status.hasBreaking ? "var(--destructive)" : "var(--accent)",
        color: status.hasBreaking ? "#fff" : "var(--foreground)",
        padding: "8px 16px",
        fontSize: "0.8rem",
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}
    >
      {status.hasBreaking ? <AlertTriangle size={14} /> : <ArrowUpCircle size={14} />}
      <span>
        <strong>Update available:</strong> {primary.package} {primary.current} → {primary.latest}
        {updates.length > 1 && ` (+${updates.length - 1} more)`}
      </span>
      <button onClick={() => { /* open details dialog */ }} style={{ textDecoration: "underline" }}>
        View details
      </button>
      <button
        onClick={() => {
          localStorage.setItem("cms:update-dismissed", primary.latest);
          setDismissed(true);
        }}
        style={{ marginLeft: "auto" }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
```

### 5. Update Details Page

Ny side i Settings → System med fuld update-oversigt:

```
/admin/settings?tab=system

System
├── Current version: @webhouse/cms 0.2.11
├── Last checked: 2 hours ago [Check now]
├── Deployment: npm (detected)
│
├── Available Updates
│   ┌────────────────────────────────────┬─────────┬─────────┐
│   │ Package                            │ Current │ Latest  │
│   ├────────────────────────────────────┼─────────┼─────────┤
│   │ @webhouse/cms                      │ 0.2.11  │ 0.3.0   │
│   │ @webhouse/cms-admin                │ 0.2.0   │ 0.3.0   │
│   │ @webhouse/cms-cli                  │ 0.2.11  │ 0.3.0   │
│   └────────────────────────────────────┴─────────┴─────────┘
│
├── Changelog (v0.3.0)
│   • F99 End-to-End Testing Suite
│   • Bug fix: media rename on GitHub adapter
│   • Breaking: removed deprecated `content.list()` method
│
└── Update Instructions
    npm:    pnpm update @webhouse/cms @webhouse/cms-admin @webhouse/cms-cli
    Docker: docker pull webhouse/cms-admin:latest && docker restart cms
    CLI:    cms update
```

### 6. CLI: `cms update`

Ny kommando i `@webhouse/cms-cli`:

```typescript
// packages/cms-cli/src/commands/update.ts

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";

export async function updateCommand(options: { force?: boolean; dry?: boolean }) {
  console.log("🔍 Checking for updates...");

  // 1. Check npm registry
  const status = await checkForUpdates();
  if (!status.hasUpdates) {
    console.log("✅ All packages are up to date.");
    return;
  }

  // 2. Show available updates
  const updates = status.packages.filter((p) => p.hasUpdate);
  console.log(`\n📦 ${updates.length} update(s) available:\n`);
  for (const u of updates) {
    const label = u.breaking ? "⚠ BREAKING" : "  ";
    console.log(`  ${label} ${u.package}: ${u.current} → ${u.latest}`);
  }

  // 3. Breaking change warning
  if (status.hasBreaking && !options.force) {
    console.log("\n⚠ Breaking changes detected. Run with --force to proceed.");
    console.log("  Check changelog first: https://github.com/webhousecode/cms/releases");
    return;
  }

  if (options.dry) {
    console.log("\n🏁 Dry run — no changes made.");
    return;
  }

  // 4. Backup current package.json
  console.log("\n📋 Backing up package.json...");
  copyFileSync("package.json", "package.json.backup");

  // 5. Run update
  console.log("📥 Updating packages...");
  const pkgNames = updates.map((u) => `${u.package}@latest`).join(" ");
  try {
    execSync(`pnpm update ${pkgNames}`, { stdio: "inherit" });
  } catch (err) {
    console.error("❌ Update failed. Restoring package.json...");
    copyFileSync("package.json.backup", "package.json");
    execSync("pnpm install", { stdio: "inherit" });
    return;
  }

  // 6. Type-check
  console.log("🔧 Verifying TypeScript...");
  try {
    execSync("npx tsc --noEmit", { stdio: "inherit" });
  } catch {
    console.warn("⚠ TypeScript errors detected. Update succeeded but you may need to fix type issues.");
  }

  // 7. Health check
  console.log("✅ Update complete!");
  console.log("   Restart your dev server: cms dev");
  console.log("   Rollback: cp package.json.backup package.json && pnpm install");
}
```

CLI usage:

```bash
cms update              # Check + update (stops on breaking)
cms update --force      # Update even with breaking changes
cms update --dry        # Show what would update, don't change anything
```

### 7. Deployment Type Detection

Auto-detect how CMS is deployed for contextual update instructions:

```typescript
// packages/cms-admin/src/lib/deployment-detect.ts

export type DeploymentType = "npm" | "docker" | "hub" | "unknown";

export function detectDeployment(): DeploymentType {
  // Docker: /.dockerenv file exists or DOCKER=1 env var
  if (process.env.DOCKER === "1" || existsSync("/.dockerenv")) {
    return "docker";
  }

  // Hub: HUB_MODE env var (F70)
  if (process.env.HUB_MODE === "1") {
    return "hub";
  }

  // npm: node_modules exists in project root
  if (existsSync("node_modules/@webhouse/cms")) {
    return "npm";
  }

  return "unknown";
}
```

Bruges til at vise relevante update-instruktioner i admin UI.

### 8. Changelog Fetching

Henter changelog fra GitHub Releases API:

```typescript
// packages/cms-admin/src/lib/version-check.ts (tilføjelse)

export async function fetchChangelog(version: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/webhousecode/cms/releases/tags/v${version}`,
      { headers: { Accept: "application/vnd.github.v3+json" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.body ?? null; // Markdown changelog
  } catch {
    return null;
  }
}
```

### 9. Persisted State

Update status gemmes i CMS data dir:

```
_data/update-status.json
{
  "checkedAt": "2026-03-25T10:00:00Z",
  "packages": [
    {
      "package": "@webhouse/cms",
      "current": "0.2.11",
      "latest": "0.3.0",
      "hasUpdate": true,
      "breaking": false,
      "publishedAt": "2026-03-24T15:00:00Z"
    }
  ],
  "hasUpdates": true,
  "hasBreaking": false
}
```

Dismiss-state er i localStorage (per-bruger, per-browser) — banneret forsvinder for den bruger der klikker dismiss, men andre brugere ser det stadig.

## Impact Analysis

### Files affected

**Nye filer:**
- `packages/cms-admin/src/lib/version-check.ts` — version check service + changelog fetch
- `packages/cms-admin/src/lib/deployment-detect.ts` — deployment type detection
- `packages/cms-admin/src/app/api/admin/update-status/route.ts` — GET update status
- `packages/cms-admin/src/app/api/admin/update-status/check/route.ts` — POST force check
- `packages/cms-admin/src/components/update-banner.tsx` — global update notification banner
- `packages/cms-admin/src/components/settings/system-settings-panel.tsx` — system tab med update oversigt
- `packages/cms-cli/src/commands/update.ts` — `cms update` kommando

**Modificerede filer:**
- `packages/cms-admin/src/instrumentation.ts` — tilføj version check scheduler task
- `packages/cms-admin/src/app/admin/layout.tsx` — tilføj `<UpdateBanner />` i layout
- `packages/cms-cli/src/index.ts` — registrer `update` kommando

### Downstream dependents

`packages/cms-admin/src/instrumentation.ts` — importeres af Next.js runtime (convention file). Ingen downstream dependents i applikationskoden.

`packages/cms-admin/src/app/admin/layout.tsx` — root layout for admin. Alle admin-sider renders via dette layout, men tilføjelsen af `<UpdateBanner />` er rent additiv (ny komponent i JSX tree). Ingen eksisterende funktionalitet påvirkes.

`packages/cms-cli/src/index.ts` — CLI entry point. Importeres af `bin/cms` (package.json bin). Tilføjelse af ny kommando-registrering er additiv.

### Blast radius

- **Version check er non-blocking** — fejl i npm registry-kald logges og ignoreres (fire-and-forget)
- **Banner er dismissable** — kan ikke genere brugere permanent
- **CLI update bakker op** — `package.json.backup` sikrer rollback
- **Ingen data format ændringer** — `_data/update-status.json` er en ny fil
- **npm registry rate limits** — npm tillader 100 requests/minut for uautentificerede kald. 7 pakker × 1 check/dag = irrelevant
- **GitHub API rate limits** — 60 requests/time for uautentificeret. Changelog-fetch kun on-demand (bruger klikker "View details")
- **Docker-brugere** — banneret vises men update-instruktionerne tilpasses automatisk via deployment detection

### Breaking changes

Ingen. Rent additivt — nye filer, nye endpoints, ny banner-komponent i layout.

### Test plan

- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Version check henter korrekte versioner fra npm registry
- [ ] Update status gemmes i `_data/update-status.json`
- [ ] Banner vises når updates er tilgængelige
- [ ] Banner forsvinder efter dismiss (localStorage)
- [ ] Banner vises igen ved ny version (dismiss gælder kun den version)
- [ ] Breaking changes vises med rød variant
- [ ] `cms update` opdaterer pakker og bakker op med package.json.backup
- [ ] `cms update --dry` ændrer intet
- [ ] `cms update` ruller tilbage ved fejl
- [ ] Deployment type detekteres korrekt (npm vs Docker)
- [ ] Regression: scheduler kører stadig normalt med den nye version-check task
- [ ] Regression: admin layout renders korrekt med UpdateBanner

## Implementation Steps

1. **`version-check.ts`** — npm registry check + persist til `_data/update-status.json`
2. **`deployment-detect.ts`** — auto-detect npm/Docker/hub
3. **API routes** — GET update-status + POST force-check
4. **Scheduler task** i `instrumentation.ts` — dagligt version check
5. **`update-banner.tsx`** — global banner med dismiss
6. **Admin layout** — tilføj `<UpdateBanner />` i top
7. **System Settings panel** — fuld update-oversigt med changelog
8. **CLI `cms update`** — pnpm update + backup + type-check + rollback
9. **Changelog fetch** — GitHub Releases API integration
10. **Test** — verify end-to-end: check → notify → update → verify

## Scope Anbefaling

| Phase | Scope | Effort |
|-------|-------|--------|
| **v1 (ship dette)** | Version check + banner + Settings panel + CLI update | Medium (3-4 dage) |
| **v2 (senere)** | Docker auto-update (Watchtower-pattern), one-click update i admin | Small (1-2 dage) |
| **v3 (F70 Hub)** | Hub auto-deploy via CI/CD, rolling updates, canary | Del af F70 |

**Anbefaling:** Ship v1 først. Docker auto-update er nice-to-have men kræver container orchestration der er out-of-scope for et CMS. Hub-scenariet er del af F70.

## Dependencies

- Eksisterende scheduler i `instrumentation.ts` (Done)
- npm registry public API (no auth required)
- GitHub Releases API (unauthenticated, 60/hour — tilstrækkeligt for on-demand changelog)
- `@webhouse/cms-cli` (Done — tilføj `update` kommando)

## Effort Estimate

**Medium** — 3-4 dage

- Dag 1: Version check service + persistence + scheduler integration
- Dag 2: API routes + UpdateBanner + admin layout integration
- Dag 3: System Settings panel + changelog fetch + deployment detection
- Dag 4: CLI `cms update` kommando + test + polish
