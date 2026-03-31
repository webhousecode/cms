# F123 — Providers / Integrations Tab

> Centralized settings tab for managing external service credentials — Cloudflare, GitHub, Resend, pCloud, AI providers. One place to configure API keys reused across Backup, Deploy, Email, and AI.

## Problem

External service credentials are scattered across multiple Settings tabs:
- **AI tab** — Anthropic, OpenAI, Gemini API keys
- **Deploy tab** — Vercel/Netlify/Fly.io/Cloudflare tokens
- **Backup tab** — pCloud credentials, S3/R2 access keys
- **Email tab** — Resend API key
- **MCP tab** — API keys for MCP servers

This causes duplication (e.g. Cloudflare token used for both R2 backup AND Pages deploy) and confusion (user doesn't know which tab has which key). When a token expires, they have to hunt across tabs.

## Solution

A new **Providers** tab in Settings that:
1. Lists all configured external services with status indicators (connected/expired/missing)
2. Each provider card shows which CMS features use it (Backup, Deploy, Email, AI)
3. Credentials are stored once and referenced by feature-specific settings
4. "Test connection" button per provider
5. Existing feature tabs (Backup, Deploy, etc.) reference providers instead of storing credentials directly

## Technical Design

### 1. Provider Registry

```typescript
// packages/cms-admin/src/lib/providers.ts

interface ProviderConfig {
  id: string;           // "cloudflare", "github", "anthropic", etc.
  name: string;         // "Cloudflare"
  status: "connected" | "error" | "unconfigured";
  usedBy: string[];     // ["backup", "deploy"]
  credentials: Record<string, string>;  // stored in site-config
}
```

### 2. Provider Cards in UI

Each provider shows:
- Logo/icon + name
- Status badge (green/red/gray)
- Features that use this provider
- Credential fields (masked)
- Test connection button
- "Get key" link to provider's dashboard

### 3. Migration Path

Phase 1: Add Providers tab alongside existing tabs. Credentials still stored in current fields.
Phase 2: Feature tabs reference provider credentials (e.g. Backup shows "Using Cloudflare R2" with link to Providers tab).
Phase 3: Remove duplicate credential fields from feature tabs.

## Impact Analysis

### Files affected
- `packages/cms-admin/src/components/settings/providers-panel.tsx` — **new**
- `packages/cms-admin/src/app/admin/(workspace)/settings/page.tsx` — **modified** (add Providers tab)
- `packages/cms-admin/src/components/settings/backup-settings-panel.tsx` — **modified** (Phase 2: reference provider)
- `packages/cms-admin/src/components/settings/deploy-settings-panel.tsx` — **modified** (Phase 2: reference provider)
- `packages/cms-admin/src/components/settings/ai-settings-panel.tsx` — **modified** (Phase 2: reference provider)

### Downstream dependents
Settings panels are leaf components — no downstream dependents.

### Blast radius
Low. Phase 1 is purely additive (new tab). Phase 2-3 progressively migrate without breaking existing functionality.

### Breaking changes
None. Existing credential fields remain functional throughout migration.

### Test plan
- [ ] TypeScript compiles
- [ ] Providers tab shows all configured services
- [ ] Test connection works for each provider
- [ ] Existing Backup/Deploy/AI settings still work unchanged (Phase 1)
- [ ] Credentials entered in Providers tab are used by feature tabs (Phase 2)

## Implementation Steps

1. Create providers-panel.tsx with provider cards
2. Add Providers tab to settings page
3. Show status of all configured providers (scan site-config for existing keys)
4. Add test connection for each provider type
5. Phase 2: Add "linked to Provider" indicators in feature tabs
6. Phase 3: Remove duplicate credential fields

## Dependencies

- F87 Org-Level Settings (done) — inheritance chain for credentials
- F95 Cloud Backup (done) — Cloudflare R2 + pCloud credentials

## Effort Estimate

**Medium** — 2-3 days

- Day 1: Provider registry, panel UI with status indicators
- Day 2: Test connection per provider, "Get key" links
- Day 3: Phase 2 — link feature tabs to providers

---

> **Testing (F99):** Unit tests for provider status detection and credential resolution.
