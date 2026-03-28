# F113 — Service Role Keys

> API keys for programmatic access to the CMS. Supabase-inspired: org-level and site-level service_role keys with full admin privileges. Generate, revoke, rotate from admin UI.

## Problem

The CMS has no way for external tools (CLI, CI/CD, Claude Code, MCP clients, cron jobs) to authenticate against the API without a browser session cookie. Current workarounds:

1. **X-CMS-Service-Token** — matches CMS_JWT_SECRET, bypasses auth entirely, no user context → downstream role checks fail
2. **CMS_DEV_TOKEN** — env var dev shortcut (F48), synthetic admin JWT, works but dev-only and hardcoded

Neither is suitable for production. We need proper API keys that:
- Can be generated and revoked from the admin UI
- Work at org level (access all sites in org) and site level (access one site)
- Carry admin privileges (service_role) for automation
- Support Bearer token auth: `Authorization: Bearer <key>`
- Are persisted securely and shown only once on creation

## Solution

### Key Types

| Type | Scope | Access | Use case |
|------|-------|--------|----------|
| **Org service key** | All sites in org | Admin on all sites | CI/CD, org-wide automation, MCP server |
| **Site service key** | Single site | Admin on that site | Per-site webhooks, external tools, Claude Code |

### Key Format

Keys are opaque hex tokens (64 chars, `openssl rand -hex 32`). NOT JWTs — we look them up server-side, which allows instant revocation.

### Storage

```
_data/service-keys.json          ← org-level keys
_data/service-keys/{siteId}.json ← site-level keys
```

Each key entry:
```typescript
interface ServiceKey {
  id: string;           // UUID
  name: string;         // User-given label ("CI deploy key", "MCP access")
  keyHash: string;      // bcrypt hash of the key (never store plaintext)
  prefix: string;       // First 8 chars for identification ("sk_6b2bd97c")
  scope: "org" | "site";
  siteId?: string;      // Only for site-scoped keys
  createdAt: string;
  createdBy: string;    // User ID who created it
  lastUsedAt?: string;
  expiresAt?: string;   // Optional expiry
  revoked?: boolean;
}
```

### Auth Flow (proxy.ts)

1. Check `Authorization: Bearer <token>` header
2. Load service keys for active org (and site if applicable)
3. bcrypt.compare(token, keyHash) for each key
4. If match: inject admin JWT into request (same pattern as CMS_DEV_TOKEN)
5. Update `lastUsedAt` timestamp (debounced, non-blocking)

### API Endpoints

```
POST   /api/admin/service-keys          — Generate new key (returns plaintext ONCE)
GET    /api/admin/service-keys          — List keys (prefix, name, lastUsed, expires — never full key)
DELETE /api/admin/service-keys/:id      — Revoke key
PATCH  /api/admin/service-keys/:id      — Update name/expiry
```

### Admin UI

**Location:** Settings → Security tab (or dedicated "API Keys" tab)

- List all keys with prefix (`sk_6b2bd97c...`), name, scope, last used, expires
- "Generate new key" button → shows key ONCE in a modal with copy button
- Revoke button with inline confirm pattern (Remove? [Yes] [No])
- Org keys visible in Org Settings, site keys in Site Settings

### Phases

**Phase 1 — Core (ship blocker for automation)**
- ServiceKey type + storage (JSON files)
- Generate/list/revoke API endpoints
- proxy.ts Bearer token lookup
- Site Settings UI: generate + list + revoke

**Phase 2 — Org keys + polish**
- Org-level keys in Org Settings
- Key expiry support
- lastUsedAt tracking
- Access Tokens tab on Account page (user's own keys)

**Phase 3 — Scoped permissions (future)**
- Read-only keys (anon equivalent)
- Per-collection scoping
- Rate limiting per key

## Existing Infrastructure

| What | Where | Status |
|------|-------|--------|
| Access Tokens UI tab | Account page → Access Tokens | Shell exists, not functional |
| CMS_DEV_TOKEN pattern | proxy.ts | Working (F48), becomes reference impl |
| X-CMS-Service-Token | proxy.ts | Working but no user context |
| bcrypt | auth.ts | Already imported |
| Inline confirm pattern | CLAUDE.md | Standard UI pattern |

## Dependencies

- proxy.ts auth flow (done)
- require-role.ts dev-token pattern (done, F48)
- bcrypt (already in deps)

## Test Plan

```
describe("service key generation")
  ✓ generates 64-char hex key
  ✓ stores bcrypt hash, never plaintext
  ✓ returns plaintext only on creation response

describe("service key auth")
  ✓ valid Bearer token → admin access
  ✓ revoked key → 401
  ✓ expired key → 401
  ✓ invalid token → falls through to cookie auth
  ✓ site-scoped key only works on that site

describe("service key management")
  ✓ list returns prefix, never full key
  ✓ revoke sets revoked: true
  ✓ only admins can generate/revoke keys
```

---

> **Testing (F99):** This feature MUST include tests using the [F99 Test Infrastructure](F99-e2e-testing-suite.md).
> - **Unit tests** → `packages/cms-admin/src/lib/__tests__/{feature}.test.ts` or `packages/cms/src/__tests__/{feature}.test.ts`
> - **API tests** → `packages/cms-admin/tests/api/{feature}.test.ts`
> - **E2E tests** → `packages/cms-admin/e2e/suites/{nn}-{feature}.spec.ts`
> - Use shared fixtures: `auth.ts` (JWT login), `mock-llm.ts` (intercept AI), `test-data.ts` (seed/cleanup)
> - Tests are written BEFORE implementation. All tests must pass before merge.
