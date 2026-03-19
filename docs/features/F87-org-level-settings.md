# F87 — Org-Level Global Settings

> Shared settings inherited by all sites in an organization — MCP servers, email, AI keys, budget, webhooks — with per-site override.

## Problem

Every site in an org must configure MCP servers, email (Resend), AI API keys, AI budget, and default webhooks independently. With 10 sites, that's 10x the same Discord webhook URL, 10x the same Resend API key, 10x the same MCP server configs. Changes require visiting every site's settings individually.

## Solution

Org-level settings stored in a shared config file. Sites inherit org defaults automatically. Site-level overrides take precedence. UI shows "Inherited from org" badge on fields using the org default, with a toggle to override locally.

## Technical Design

### OrgSettings Interface

```typescript
// packages/cms-admin/src/lib/org-settings.ts

export interface OrgSettings {
  // Email
  resendApiKey?: string;
  emailFrom?: string;
  emailFromName?: string;

  // AI
  aiApiKeys?: { provider: string; key: string }[];
  aiBudgetUsd?: number;

  // MCP Servers (shared across all sites)
  mcpServers?: { name: string; command: string; args?: string[]; env?: Record<string, string> }[];

  // Default Webhooks
  defaultWebhooks?: { id: string; url: string }[];
}
```

### Storage

Org settings stored at `{registryDir}/_data/org-settings/{orgId}.json`.
- `registryDir` is the directory containing `registry.json` (from `getAdminDataDir()` in `site-registry.ts`)
- One file per org
- Created on first write, empty object by default

### Inheritance Chain

```
site-config.json → org-settings/{orgId}.json → env vars → defaults
```

`readSiteConfig()` modified to check org settings as fallback:
```typescript
export async function readSiteConfig(): Promise<SiteConfig> {
  const stored = ...; // site config
  const orgSettings = await readOrgSettings(); // org config
  const defs = await defaults(); // env vars + hardcoded

  return {
    ...defs,
    ...orgSettings,  // org overrides defaults
    ...stored,       // site overrides org
  };
}
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/org-settings` | Read org settings for active org |
| POST | `/api/admin/org-settings` | Update org settings |

### UI Changes

Extend `/admin/organizations/settings` page with tabs:
- **General** (existing: name, type, plan, delete)
- **Email** — Resend API key, from address, from name
- **AI** — API keys, monthly budget
- **MCP** — Shared MCP servers
- **Webhooks** — Default webhook URLs

Each field in Site Settings that has an org-level equivalent shows:
- Badge: "Inherited from [OrgName]" (muted, small) when using org value
- Toggle: "Override for this site" to set a site-specific value

### Per-field inheritance UI pattern

```tsx
<InheritedField
  label="Resend API Key"
  orgValue={orgSettings.resendApiKey}
  siteValue={siteConfig.resendApiKey}
  onOverride={(value) => updateSiteConfig({ resendApiKey: value })}
  onClearOverride={() => clearSiteConfigField("resendApiKey")}
/>
```

## Impact Analysis

### Files affected

**New files:**
- `packages/cms-admin/src/lib/org-settings.ts` — OrgSettings interface, read/write functions
- `packages/cms-admin/src/app/api/admin/org-settings/route.ts` — API endpoint
- `packages/cms-admin/src/components/settings/inherited-field.tsx` — UI component for inheritance badge + override toggle

**Modified files:**

- `packages/cms-admin/src/lib/site-config.ts` — add org settings fallback in `readSiteConfig()`
  - Dependents (16 files import from site-config): `settings/page.tsx`, `[collection]/page.tsx`, `[collection]/[slug]/page.tsx`, `scheduled/calendar.ics/route.ts`, `scheduled-snapshot.ts`, `tools-scheduler.ts`, `scheduler-notify.ts`, `site-config/route.ts`, `email.ts`, `invitations/route.ts`, `ai/chat/route.ts`, `schema/[collection]/route.ts`, `schema/collections/route.ts`, `curation/route.ts`, `schema/route.ts`
- `packages/cms-admin/src/app/admin/(workspace)/organizations/settings/page.tsx` — add tabs for shared settings
  - No downstream dependents (leaf page)
- `packages/cms-admin/src/components/settings/general-settings-panel.tsx` — add inheritance badges
  - Dependents: `settings/page.tsx`, `account/page.tsx`
- `packages/cms-admin/src/components/settings/email-settings-panel.tsx` — add inheritance badges
  - Dependents: `settings/page.tsx`, `account/page.tsx`
- `packages/cms-admin/src/components/settings/ai-settings-panel.tsx` — add inheritance badges
  - Dependents: `settings/page.tsx`
- `packages/cms-admin/src/components/settings/mcp-settings-panel.tsx` — add inheritance badges
  - Dependents: `settings/page.tsx`

### Blast radius
- `readSiteConfig()` is called by 16 files — adding org fallback must not break existing behavior. The spread-merge pattern (`...defs, ...orgSettings, ...stored`) is safe: if org settings is empty `{}`, result is identical to current behavior.
- Org settings file must be created lazily (not all orgs will have settings)
- MCP server merging: org servers + site servers = combined list (not replacement)
- AI key fallback must preserve existing env var fallback (`defaults()` already reads env vars)
- `readSiteConfigForSite()` also needs the org fallback for consistency (calendar token validation, scheduler)

### Breaking changes
None — purely additive. Existing site configs continue to work as before. Org settings layer is opt-in.

### Test plan
- [ ] TypeScript compiles (`npx tsc --noEmit --project packages/cms-admin/tsconfig.json`)
- [ ] Site with no org settings works exactly as before
- [ ] Org settings created and readable via API
- [ ] Site inherits org email settings when site has none
- [ ] Site override takes precedence over org setting
- [ ] MCP servers merge (org + site)
- [ ] Clearing site override falls back to org value
- [ ] `readSiteConfigForSite()` also inherits org settings

## Implementation Steps

1. Create `org-settings.ts` with OrgSettings interface + `readOrgSettings()` / `writeOrgSettings()` functions
2. Create `/api/admin/org-settings` API route (GET + POST)
3. Modify `readSiteConfig()` and `readSiteConfigForSite()` to include org settings in fallback chain
4. Add tabs to org settings page (Email, AI, MCP, Webhooks)
5. Create `InheritedField` component for badge + override toggle
6. Add inheritance badges to site settings panels (general, email, AI, MCP)

## Dependencies
- F76 Create Organization (Done)

## Effort Estimate
**Medium** — 3-4 days
