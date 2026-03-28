# F87 — Org-Level Global Settings

> Shared settings inherited by all sites in an organization — deploy credentials, AI providers & keys, email, MCP servers, automation defaults, webhooks — with per-site override and auto-migration.

## Problem

Every site in an org must configure the same credentials and defaults independently:

- **Deploy tokens** — paste the same Fly.io org token into 5 sites
- **AI API keys** — enter Anthropic/OpenAI/Gemini keys on every site
- **Web Search keys** — Brave/Tavily API keys duplicated N times
- **Email** — same Resend API key and from-address across all sites
- **MCP servers** — re-add the same external servers per site
- **Webhooks** — same Discord/Slack notification URLs everywhere
- **Automation defaults** — every site needs backup/link-check schedules set individually

With 10 sites, that's 10x the same API key. Change a key? Visit every site's settings. Forget one? Silent failure.

## Solution

Org-level settings stored in a shared config file (`_data/org-settings/{orgId}.json`). Sites inherit org defaults automatically via a merge chain. Site-level overrides take precedence. UI shows "Inherited from [OrgName]" badge on fields using the org default, with a toggle to override locally.

The Org Settings page mirrors the full Site Settings structure — Deploy, AI, Email, Automation, MCP — so admins configure shared credentials once. Auto-migration detects common values across existing sites and proposes hoisting them to org level.

## Technical Design

### OrgSettings Interface

```typescript
// packages/cms-admin/src/lib/org-settings.ts

export interface OrgSettings {
  // ── Deploy credentials ─────────────────────────────
  deployApiToken?: string;      // Fly.io org token
  deployFlyOrg?: string;        // Fly.io org slug
  deployHookUrl?: string;       // Vercel/Netlify/Custom webhook
  deployGitHubToken?: string;   // GitHub PAT for Pages deploys

  // ── AI providers & keys ────────────────────────────
  aiDefaultProvider?: "anthropic" | "openai" | "gemini";
  aiAnthropicApiKey?: string;
  aiOpenaiApiKey?: string;
  aiGeminiApiKey?: string;
  aiWebSearchProvider?: "brave" | "tavily";
  aiBraveApiKey?: string;
  aiTavilyApiKey?: string;

  // ── AI model defaults ──────────────────────────────
  aiInteractivesModel?: string;
  aiInteractivesMaxTokens?: number;
  aiContentModel?: string;
  aiContentMaxTokens?: number;

  // ── Email ──────────────────────────────────────────
  resendApiKey?: string;
  emailFrom?: string;
  emailFromName?: string;

  // ── Automation defaults ────────────────────────────
  backupSchedule?: "off" | "daily" | "weekly";
  backupTime?: string;
  backupRetentionDays?: number;
  linkCheckSchedule?: "off" | "daily" | "weekly";
  linkCheckTime?: string;

  // ── Default webhooks ───────────────────────────────
  publishWebhooks?: { id: string; url: string }[];
  backupWebhooks?: { id: string; url: string }[];
  linkCheckWebhooks?: { id: string; url: string }[];
  agentDefaultWebhooks?: { id: string; url: string }[];

  // ── MCP servers (shared across all sites) ──────────
  mcpServers?: {
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
    enabled?: boolean;
  }[];
}
```

### Two config files, one inheritance chain

The CMS stores settings in two separate files per site:

| File | Contains | Module |
|------|----------|--------|
| `_data/site-config.json` | Deploy, email, AI model defaults, automation, webhooks | `site-config.ts` |
| `_data/ai-config.json` | AI provider keys, web search keys | `ai-config.ts` |

Org settings unifies both. The inheritance chain for each:

```
site-config.json  → org-settings.json → env vars → defaults
ai-config.json    → org-settings.json → env vars → defaults
```

### Fields classified

**Inheritable (org → site):**
- Deploy: `deployApiToken`, `deployFlyOrg`, `deployHookUrl`, `deployGitHubToken`
- AI keys: `aiDefaultProvider`, `aiAnthropicApiKey`, `aiOpenaiApiKey`, `aiGeminiApiKey`
- Web search: `aiWebSearchProvider`, `aiBraveApiKey`, `aiTavilyApiKey`
- AI defaults: `aiInteractivesModel`, `aiInteractivesMaxTokens`, `aiContentModel`, `aiContentMaxTokens`
- Email: `resendApiKey`, `emailFrom`, `emailFromName`
- Automation: `backupSchedule`, `backupTime`, `backupRetentionDays`, `linkCheckSchedule`, `linkCheckTime`
- Webhooks: `publishWebhooks`, `backupWebhooks`, `linkCheckWebhooks`, `agentDefaultWebhooks`

**NEVER inherited (site-specific):**
- `calendarSecret` — per-site HMAC, inheriting breaks existing calendar feed tokens
- `deployAppName` — unique per site (GitHub repo name or Fly app name)
- `deployProductionUrl` — unique per site
- `deployCustomDomain` — unique per site
- `deployProvider` — each site picks its own provider
- `deployOnSave` — site-level preference
- `previewSiteUrl` — site-specific preview URL
- Brand voice, AI prompts, team/users, revalidation, schema

### Empty string handling (critical)

Site config uses `""` as default for string fields. Without special handling, `""` from site config would override a valid org value via spread merge.

**Rule:** Empty strings in site config for inheritable fields do NOT override org values. The merge function filters them out before merging.

### MCP server merging

MCP servers from org and site are **combined** (not replaced). Site servers append to org servers. Duplicate names are resolved by site-wins.

### Webhook array behavior

Webhook arrays use **site-replaces-org** semantics. If a site explicitly sets `publishWebhooks: []`, it clears the org webhooks. If a site has no `publishWebhooks` key at all, it inherits from org.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/org-settings` | Read org settings for active org |
| POST | `/api/admin/org-settings` | Update org settings (partial merge) |

### Storage

Org settings stored at `{registryDir}/_data/org-settings/{orgId}.json`.
- One file per org
- Created on first write, empty object by default
- Keys stored in plain text (same security model as site-config)

### UI: Org Settings tabs

The Org Settings page (`/admin/organizations/settings`) gets full tabs:

- **General** (existing: name, type, plan, sites, delete)
- **Deploy** — Fly.io token + org, GitHub PAT, Vercel/Netlify hook URLs
- **AI** — Default provider, 3 LLM API keys, web search provider + 2 keys, model defaults
- **Email** — Resend API key, from address, from name
- **Automation** — Backup schedule/time/retention defaults, link check defaults
- **Webhooks** — Default webhook URLs for publish, backup, link check, agents
- **MCP** — Shared MCP servers (external)

### UI: Site Settings inheritance badges

Each field in Site Settings that has an org-level equivalent shows:
- Badge: `Inherited from [OrgName]` (muted, small) when using org value
- Toggle: "Override for this site" to set a site-specific value
- Clearing the override falls back to org value

```tsx
<InheritedField
  label="Resend API Key"
  orgValue={orgSettings.resendApiKey}
  siteValue={siteConfig.resendApiKey}
  onOverride={(value) => updateSiteConfig({ resendApiKey: value })}
  onClearOverride={() => clearSiteConfigField("resendApiKey")}
/>
```

### Auto-migration

On first visit to Org Settings → Credentials, the system scans all sites in the org and detects common values. If all sites share the same Fly.io token, it proposes hoisting it to org level.

Migration rules:
1. Only INHERITABLE_FIELDS are candidates
2. Only migrate if ALL sites (with non-empty values) have the same value
3. After migration, clear the field from each site's config
4. Never migrate NEVER_INHERIT fields
5. User must confirm before migration executes

## Impact Analysis

### Files affected

**New files:**
- `packages/cms-admin/src/lib/org-settings.ts` — OrgSettings interface, merge, read/write (DONE)
- `packages/cms-admin/src/app/api/admin/org-settings/route.ts` — API endpoint (DONE)
- `packages/cms-admin/src/components/settings/inherited-field.tsx` — Inheritance badge + override toggle
- `packages/cms-admin/src/lib/__tests__/org-settings.test.ts` — 38+ tests (DONE, expanding)

**Modified files:**

- `packages/cms-admin/src/lib/site-config.ts` — org settings merge in readSiteConfig() (DONE)
- `packages/cms-admin/src/lib/ai-config.ts` — org settings fallback for AI keys
- `packages/cms-admin/src/lib/site-registry.ts` — export getAdminDataDir() (DONE)
- `packages/cms-admin/src/app/admin/(workspace)/organizations/settings/page.tsx` — full tabbed UI (partial)
- `packages/cms-admin/src/components/settings/deploy-settings-panel.tsx` — inheritance badges
- `packages/cms-admin/src/components/settings/ai-settings-panel.tsx` — inheritance badges
- `packages/cms-admin/src/components/settings/email-settings-panel.tsx` — inheritance badges
- `packages/cms-admin/src/components/settings/tools-settings-panel.tsx` — inheritance badges
- `packages/cms-admin/src/components/settings/mcp-settings-panel.tsx` — inheritance badges + org servers

### Downstream dependents

`site-config.ts` imported by 16+ files — merge is backwards-compatible (empty org = identical output).

`ai-config.ts` imported by AI chat routes, agent routes, settings panels — org fallback must preserve env var fallback chain.

### Blast radius
- `readSiteConfig()` called by 16 files — safe: empty org settings = no change
- `readAiConfig()` called by AI routes — must check org before env vars
- MCP server list must combine (not replace) — deduplication by name
- Webhook arrays: site-replaces-org is safest (avoids double-notification)
- Calendar secret NEVER inherited — protects existing HMAC tokens
- Empty string filter prevents org tokens from being wiped by default site config

### Breaking changes
None — purely additive. All changes are opt-in via org settings.

### Test plan
- [ ] TypeScript compiles
- [ ] 38 existing tests pass (merge logic, NEVER_INHERIT, empty strings, arrays)
- [ ] AI keys inherited: org Anthropic key used when site has none
- [ ] Web search key inherited from org
- [ ] Automation defaults inherited (backup schedule, webhooks)
- [ ] MCP servers combined (org + site, no duplicates)
- [ ] AI config file fallback chain works
- [ ] Auto-migration detects common values
- [ ] Auto-migration skips NEVER_INHERIT fields
- [ ] Backwards compatible: no org settings = identical behavior

## Implementation Status

### Phase 1 — Core (DONE)
1. ✅ `org-settings.ts` — interface, mergeConfigs(), read/write, INHERITABLE/NEVER_INHERIT lists
2. ✅ `/api/admin/org-settings` — GET/POST
3. ✅ `readSiteConfig()` + `readSiteConfigForSite()` — org merge chain
4. ✅ `getAdminDataDir()` exported
5. ✅ 38 tests passing

### Phase 2 — Full scope (IN PROGRESS)
6. Expand INHERITABLE_FIELDS: AI keys, web search, automation, webhooks, MCP, GitHub token
7. Expand OrgSettings interface to match
8. AI config integration: `readAiConfig()` checks org settings
9. Org Settings UI: Deploy, AI, Email, Automation, Webhooks, MCP tabs
10. `InheritedField` component for Site Settings badges
11. Auto-migration UI in Org Settings

### Phase 3 — Polish
12. Inheritance badges on all Site Settings panels
13. "Clear override" action on each field
14. Migration wizard with preview + confirm


> **NOTE — F107 Chat Integration:** When this feature introduces new API routes, tools, or admin actions, ensure they are also exposed as tool-use functions in F107 (Chat with Your Site). The chat interface must be able to perform any action the traditional admin UI can. See `docs/features/F107-chat-with-your-site.md`.

## Dependencies
- F76 Create Organization (Done)

## Effort Estimate
**Medium-Large** — 5-6 days total (2 done, 3-4 remaining)

---

> **Testing (F99):** This feature MUST include tests using the [F99 Test Infrastructure](F99-e2e-testing-suite.md).
> - **Unit tests** → `packages/cms-admin/src/lib/__tests__/{feature}.test.ts` or `packages/cms/src/__tests__/{feature}.test.ts`
> - **API tests** → `packages/cms-admin/tests/api/{feature}.test.ts`
> - **E2E tests** → `packages/cms-admin/e2e/suites/{nn}-{feature}.spec.ts`
> - Use shared fixtures: `auth.ts` (JWT login), `mock-llm.ts` (intercept AI), `test-data.ts` (seed/cleanup)
> - Tests are written BEFORE implementation. All tests must pass before merge.
