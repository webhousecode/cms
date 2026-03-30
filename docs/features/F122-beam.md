# F122 — Beam

> "Beam me up, Scotty" — one-click site teleportation from localhost to cloud, or between any two CMS admin instances.

## Problem

Sites developed locally on `localhost:3010` are trapped there. There's no way to move a complete site — content, media, config, settings, agents, brand voice — to a production CMS admin instance. The current backup system (F27) creates local archives, but:

- Backups don't include `cms.config.ts` schema (fixed recently, but still incomplete)
- There's no push mechanism — you can't send a site to a remote server
- Restoring on a different instance requires manual file shuffling
- Media files (uploads/) aren't portable across instances
- Site registry entries, MCP keys, deploy configs don't transfer
- No progress feedback during large transfers

This blocks the core workflow: **develop locally → deploy to production**.

## Solution

Two complementary modes:

1. **Beam Archive** (`.beam` file) — Export a complete, portable site package. Import it on any CMS admin instance. Works offline, across networks, for disaster recovery.

2. **Live Beam** — Direct CMS-to-CMS transfer over HTTPS. Source admin streams everything to target admin's `/api/beam/receive` endpoint. Real-time progress. Authenticated with a one-time beam token.

Both modes transfer the **complete site state**: content JSON, media files, `cms.config.ts`, `_data/` (site-config, agents, brand voice, user state), and registry entry.

## Technical Design

### 1. Beam Archive Format (`.beam`)

A `.beam` file is a ZIP archive with a specific structure:

```
site-name.beam
├── manifest.json           # Beam metadata (version, source, timestamp, checksums)
├── cms.config.ts           # Site schema definition
├── content/                # All collection JSON files
│   ├── posts/
│   │   ├── hello-world.json
│   │   └── hello-world-da.json
│   └── pages/
│       └── home.json
├── uploads/                # All media files
│   ├── image-001.webp
│   ├── image-001-400w.webp
│   └── document.pdf
├── _data/                  # Site operational data
│   ├── site-config.json    # Preview URL, deploy config, GEO settings
│   ├── agents/             # Agent configurations
│   ├── brand-voice.json    # Brand voice settings
│   ├── ai-config.json      # AI provider config (keys stripped)
│   └── mcp-keys.json       # MCP API keys (keys stripped, labels kept)
└── registry-entry.json     # SiteEntry for importing into target registry
```

### 2. Beam Manifest

```typescript
// lib/beam/types.ts

export interface BeamManifest {
  version: 1;
  beamId: string;                    // unique transfer ID
  sourceInstance: string;            // e.g. "localhost:3010"
  sourceTimestamp: string;           // ISO timestamp
  site: {
    id: string;
    name: string;
    adapter: "filesystem" | "github";
  };
  stats: {
    contentFiles: number;
    mediaFiles: number;
    totalSizeBytes: number;
    collections: Record<string, number>;
  };
  checksums: Record<string, string>; // SHA-256 per file for integrity
  /** Secrets are NEVER included — these fields list what needs manual config */
  secretsRequired: string[];         // e.g. ["GITHUB_TOKEN", "ANTHROPIC_API_KEY"]
}
```

### 3. Beam Export (source side)

```typescript
// lib/beam/export.ts

export async function createBeamArchive(siteId: string): Promise<{
  filePath: string;
  manifest: BeamManifest;
}> {
  // 1. Resolve site paths (config, content, uploads, _data)
  // 2. Create manifest with file inventory + checksums
  // 3. Stream all files into ZIP archive
  // 4. Strip secrets from _data files (API keys → placeholders)
  // 5. Include cms.config.ts (raw file for filesystem, parsed for GitHub)
  // 6. Include registry-entry.json (SiteEntry without tokens)
  // 7. Return path to .beam file + manifest
}
```

### 4. Beam Import (target side)

```typescript
// lib/beam/import.ts

export async function importBeamArchive(
  archivePath: string,
  targetOrgId: string,
  options?: {
    overwrite?: boolean;      // overwrite if site ID already exists
    newSiteId?: string;       // rename site on import
    skipMedia?: boolean;      // skip large media files
  }
): Promise<{
  siteId: string;
  stats: BeamManifest["stats"];
  secretsRequired: string[];
}> {
  // 1. Extract and validate manifest
  // 2. Verify checksums
  // 3. Create site directory structure
  // 4. Write content files
  // 5. Write media files to uploads/
  // 6. Write _data/ (site-config, agents, brand voice)
  // 7. Write cms.config.ts
  // 8. Add SiteEntry to target registry
  // 9. Return import summary + list of secrets that need manual config
}
```

### 5. Live Beam Protocol

```
Source CMS Admin                          Target CMS Admin
     │                                         │
     │  POST /api/beam/initiate                │
     │  { siteId, targetUrl, beamToken }       │
     │────────────────────────────────────────►│
     │                                         │
     │  200 { beamId, ready: true }            │
     │◄────────────────────────────────────────│
     │                                         │
     │  POST /api/beam/receive/manifest        │
     │  { manifest }                           │
     │────────────────────────────────────────►│
     │                                         │
     │  POST /api/beam/receive/file            │
     │  multipart: { path, content, checksum } │
     │  (repeated for each file)               │
     │────────────────────────────────────────►│
     │                                         │
     │  POST /api/beam/receive/finalize        │
     │  { beamId }                             │
     │────────────────────────────────────────►│
     │                                         │
     │  200 { success, stats, secretsRequired }│
     │◄────────────────────────────────────────│
```

### 6. Beam Token Authentication

```typescript
// Target admin generates a one-time beam token:
// Settings → Beam → "Generate Beam Token"
// Token: beam_abc123def456...
// Valid for: 1 hour, single use

// Source admin uses it:
// Site Settings → Beam → "Beam to remote"
// Target URL: https://remote.webhouse.app
// Beam Token: beam_abc123def456...
```

### 7. API Routes

```
// Source side
POST /api/admin/beam/export          — Create .beam archive, return download URL
POST /api/admin/beam/push            — Initiate live beam to target URL

// Target side
POST /api/beam/receive/initiate      — Accept incoming beam (validates token)
POST /api/beam/receive/manifest      — Receive manifest
POST /api/beam/receive/file          — Receive individual file
POST /api/beam/receive/finalize      — Complete beam, register site

// Shared
GET  /api/admin/beam/status/:beamId  — SSE stream for progress updates
```

### 8. Admin UI

**Source side — Site Settings → Beam:**

```
┌─────────────────────────────────────────┐
│ Beam Site                               │
│                                         │
│ ┌─ Export ─────────────────────────────┐│
│ │ Download .beam archive               ││
│ │ [Download .beam file]                ││
│ │ 47 documents · 23 media · 12.4 MB   ││
│ └──────────────────────────────────────┘│
│                                         │
│ ┌─ Live Beam ─────────────────────────┐│
│ │ Target URL:  [https://...         ] ││
│ │ Beam Token:  [beam_...            ] ││
│ │                                     ││
│ │ [⚡ Beam Site]                      ││
│ │                                     ││
│ │ ████████████████░░░░ 78%            ││
│ │ Sending: uploads/photo-003.webp     ││
│ └──────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

**Target side — Settings → Beam:**

```
┌─────────────────────────────────────────┐
│ Receive Beam                            │
│                                         │
│ ┌─ Import ────────────────────────────┐│
│ │ [Upload .beam file]                 ││
│ │ Import into org: [WebHouse      ▼] ││
│ └──────────────────────────────────────┘│
│                                         │
│ ┌─ Beam Token ────────────────────────┐│
│ │ Allow remote beam from another CMS  ││
│ │                                     ││
│ │ [Generate Beam Token]               ││
│ │                                     ││
│ │ Token: beam_7f3a2b...  (expires 1h) ││
│ │ [Copy]                              ││
│ └──────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

### 9. CLI Support

```bash
# Export
npx cms beam export --site my-blog --output ./my-blog.beam

# Import
npx cms beam import ./my-blog.beam --org personal

# Live beam
npx cms beam push --site my-blog \
  --target https://remote.webhouse.app \
  --token beam_abc123...
```

### 10. What Gets Beamed (complete inventory)

| Category | Files | Secrets stripped? |
|----------|-------|-------------------|
| **Content** | `content/**/*.json` | No (public data) |
| **Media** | `public/uploads/**/*` | No (public files) |
| **Schema** | `cms.config.ts` | No |
| **Site config** | `_data/site-config.json` | Yes — API keys replaced with `"BEAM_REDACTED"` |
| **Agents** | `_data/agents/*.json` | No (prompts are safe) |
| **Brand voice** | `_data/brand-voice.json` | No |
| **AI config** | `_data/ai-config.json` | Yes — provider keys stripped |
| **MCP keys** | `_data/mcp-keys.json` | Yes — keys stripped, labels kept |
| **User state** | `_data/user-state/*.json` | Excluded (per-user, not portable) |
| **Backups** | `_data/backups/` | Excluded (too large, recreatable) |
| **Registry entry** | Generated `registry-entry.json` | Token stripped |

### 11. Security

- Beam tokens are single-use, time-limited (1 hour default)
- Generated with `openssl rand -hex 32` (64 chars)
- All transfers over HTTPS (enforced — HTTP rejected)
- File checksums verified on receive
- Secrets NEVER included in archive or transfer
- Post-beam: target admin shows "Secrets Required" checklist
- Beam audit log on both sides

## Impact Analysis

### Files affected

**New files:**
- `packages/cms-admin/src/lib/beam/types.ts` — Beam interfaces
- `packages/cms-admin/src/lib/beam/export.ts` — Archive creation
- `packages/cms-admin/src/lib/beam/import.ts` — Archive import
- `packages/cms-admin/src/lib/beam/push.ts` — Live beam sender
- `packages/cms-admin/src/app/api/admin/beam/export/route.ts` — Export API
- `packages/cms-admin/src/app/api/admin/beam/push/route.ts` — Push API
- `packages/cms-admin/src/app/api/admin/beam/status/[beamId]/route.ts` — SSE progress
- `packages/cms-admin/src/app/api/beam/receive/initiate/route.ts` — Receive initiate
- `packages/cms-admin/src/app/api/beam/receive/file/route.ts` — Receive file
- `packages/cms-admin/src/app/api/beam/receive/finalize/route.ts` — Finalize
- `packages/cms-admin/src/components/settings/beam-settings-panel.tsx` — UI
- `packages/cms-cli/src/commands/beam.ts` — CLI commands

**Modified files:**
- `packages/cms-admin/src/lib/site-registry.ts` — Add `addSiteFromBeam()` helper
- `packages/cms-admin/src/components/settings/index.tsx` — Add Beam tab
- `packages/cms-admin/src/components/sidebar.tsx` — Add Beam menu item (optional)

### Downstream dependents

`packages/cms-admin/src/lib/site-registry.ts` is imported by 17 files (20+ refs):
- All 17 dependents are **unaffected** — we're adding a new function, not changing existing interfaces.

`packages/cms-admin/src/components/settings/index.tsx`:
- No downstream dependents (leaf page component).

### Blast radius

- **Low risk.** All Beam functionality is additive — new API routes, new lib files, new UI panel.
- Registry gets a new `addSiteFromBeam()` function that wraps existing `saveRegistry()`.
- Receive endpoints are public-facing but token-authenticated — security review needed.
- Large media transfers could be slow — needs chunked streaming with progress.

### Breaking changes

None.

### Test plan

- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Export: creates valid .beam archive with correct structure
- [ ] Import: .beam archive creates working site on fresh CMS admin
- [ ] Checksums: corrupted file is detected and rejected
- [ ] Secrets: API keys are stripped from export, listed as required on import
- [ ] Live Beam: source pushes all files to target, site is functional
- [ ] Beam Token: expired/used token is rejected
- [ ] HTTP: plain HTTP beam is rejected (HTTPS only)
- [ ] Progress: SSE stream shows file-by-file progress
- [ ] CLI: `cms beam export` and `cms beam import` work
- [ ] Regression: existing backup/restore still works

## Implementation Steps

1. **Types & manifest** — `lib/beam/types.ts` with all interfaces
2. **Export engine** — Walk site files, create ZIP with manifest + checksums
3. **Import engine** — Extract ZIP, validate, write files, add to registry
4. **Export API route** — `POST /api/admin/beam/export` → returns .beam download
5. **Import API route** — `POST /api/admin/beam/import` (multipart upload)
6. **Beam Settings panel** — Export button + Import upload + Token generator
7. **Live Beam sender** — `lib/beam/push.ts` with SSE progress
8. **Live Beam receiver** — 3 receive endpoints (initiate, file, finalize)
9. **SSE progress route** — Real-time transfer status
10. **CLI commands** — `cms beam export`, `cms beam import`, `cms beam push`
11. **Security review** — Token generation, HTTPS enforcement, secret stripping
12. **Integration test** — Full roundtrip: export → import on separate instance

## Dependencies

- **F27 Backup & Restore** (Done) — reuses archive/ZIP infrastructure from `backup-service.ts`
- **Site Registry** (Done) — `addSiteFromBeam()` adds imported site to registry

## Effort Estimate

**Medium-Large** — 5-7 days

- Day 1: Types, manifest format, export engine
- Day 2: Import engine, file validation, registry integration
- Day 3: API routes (export + import), UI panel
- Day 4: Live Beam protocol (sender + receiver)
- Day 5: SSE progress, token auth, HTTPS enforcement
- Day 6: CLI commands, secret stripping, audit log
- Day 7: Integration tests, edge cases, polish

---

> **Testing (F99):** This feature MUST include tests using the [F99 Test Infrastructure](F99-e2e-testing-suite.md).
> - **Unit tests** → `packages/cms-admin/src/lib/__tests__/beam.test.ts`
> - **API tests** → `packages/cms-admin/tests/api/beam.test.ts`
> - Use shared fixtures: `auth.ts` (JWT login), `test-data.ts` (seed/cleanup)
> - Tests are written BEFORE implementation. All tests must pass before merge.

> **i18n (F48):** Beam UI labels must be locale-aware.
> Use `getLocale()` for runtime locale resolution.
