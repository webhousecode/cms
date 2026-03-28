# F99 — Test Infrastructure & Continuous Coverage

> A test framework that grows with each feature — shared fixtures, standard structure, CI pipeline, and a rule that every new feature ships with tests.

## Problem

The CMS has **224+ tests scattered** across the codebase:
- 83 unit tests in `packages/cms/src/__tests__/` (storage adapters, schema, autolink, field meta)
- 90+ unit tests in `packages/cms-admin/src/lib/__tests__/` (org settings, image processor, schema drift, system prompt)
- 25 Playwright specs in `packages/cms-admin/e2e/` (console errors, agent detail, richtext roundtrip, tab isolation)
- 26 Playwright specs in `tests/` (login, org/site switch, viewer RBAC)
- 12 snapshot tests for builtin blocks

**The problems:**
1. **No shared fixtures** — each test file reinvents auth, test data seeding, API calls
2. **No standard structure** — tests live in 5+ different directories with no naming convention
3. **No CI** — nothing runs on push/PR, regressions discovered manually
4. **No coverage for new features** — F107 Chat (40 tools), F44 Media Processing, F47 Scheduling, F112 GEO, F48 i18n all have zero automated tests
5. **New features add tests ad hoc** — no plug-in point, no convention, no enforcement

The old F99 plan tried to fix this by writing ALL tests retroactively (10 days of work). That's backwards — the framework should come first, and tests should grow with each feature.

## Solution

Split into two phases:

### Phase A — Test Infrastructure (DO NOW, 2-3 days)
Build the framework, shared fixtures, CI pipeline, and migrate existing 224 tests into the standard structure. After this, every cc session that builds a feature has a clear place and pattern for tests.

### Phase B — Retrospective Coverage (Tier 2, 5-7 days)
Fill in missing tests for shipped features. This is important but not blocking — the framework from Phase A ensures NEW features ship with tests regardless.

---

## Phase A — Test Infrastructure

**Size:** M (2-3 days)
**Priority:** CRITICAL — must ship before F48, F112, or any other large feature

### A.1 Standard Directory Structure

```
packages/cms-admin/
  e2e/                                  # Playwright UI tests
    fixtures/
      auth.ts                           # JWT helper — sign test tokens, set cookies
      mock-llm.ts                       # Intercept Anthropic/OpenAI → deterministic responses
      test-data.ts                      # Seed/reset content, agents, media via API
      helpers.ts                        # Navigate, wait, assert helpers
    suites/
      01-auth.spec.ts                   # Login, logout, session, protected routes
      02-content-crud.spec.ts           # Create, edit, save, reload, delete
      03-richtext.spec.ts               # Rich text roundtrip, formatting
      04-media.spec.ts                  # Upload, rename, delete, gallery
      05-agent-pipeline.spec.ts         # Agent → curation → approve/reject (absorbs F65)
      06-interactives.spec.ts           # Create, edit, preview, save
      07-settings.spec.ts               # Site settings, org settings
      08-deploy.spec.ts                 # Build, preview, publish
      09-scheduling.spec.ts             # Schedule publish/unpublish, calendar
      10-navigation.spec.ts             # Sidebar, tabs, site/org switcher
      11-chat.spec.ts                   # Chat interface, tools, history
      12-i18n.spec.ts                   # Translation UI, locale switching (F48)
      13-seo.spec.ts                    # SEO panel, dashboard, bulk optimize
      14-geo.spec.ts                    # GEO scoring, visibility monitor (F112)

  tests/                                # Vitest API integration tests
    api/
      auth.test.ts                      # POST /api/auth/login, JWT, session
      content.test.ts                   # CRUD /api/cms/content/:collection/:slug
      media.test.ts                     # POST /api/upload, GET/DELETE /api/media
      agents.test.ts                    # Agent CRUD, run, curation
      search.test.ts                    # GET /api/search
      chat.test.ts                      # POST /api/cms/chat, conversations CRUD
      seo.test.ts                       # SEO optimize, bulk, export
      admin.test.ts                     # Profile, site-config, org endpoints
      translations.test.ts             # Translation CRUD, bulk translate (F48)
    helpers/
      api-client.ts                     # Typed fetch wrapper with auth token
      test-server.ts                    # Start/stop test Next.js instance
      test-db.ts                        # Seed/reset test data

packages/cms/src/__tests__/             # Unit tests (extend existing)
  # Existing: schema, filesystem, sqlite, github, content-service, field-meta, autolink, builtin-blocks
  # New per feature:
  i18n.test.ts                          # F48: locale helpers, stale detection, translation groups
  geo-score.test.ts                     # F112: GEO scoring rules
  robots.test.ts                        # F112: robots.txt generation strategies
  # ... each feature adds its own

packages/cms-admin/src/lib/__tests__/   # Admin unit tests (extend existing)
  # Existing: org-settings, move-site, image-processor, schema-drift, system-prompt
  # New per feature:
  i18n.test.ts                          # F48: locale prompt, SEO limits, translation
  model-resolver.test.ts                # Model resolver (content/code/premium)
  chat-tools.test.ts                    # Chat tool registration, bulk tools
  # ... each feature adds its own
```

### A.2 Shared Fixtures

#### Auth Fixture (Playwright)
```typescript
// packages/cms-admin/e2e/fixtures/auth.ts
import { test as base } from "@playwright/test";
import { SignJWT } from "jose";

const JWT_SECRET = process.env.CMS_JWT_SECRET
  ?? process.env.JWT_SECRET
  ?? "b6ff0b5caa2ee4308470dfb3668b3835ef164174f87c176a41b8ea5e5b450dcd";

type AuthFixtures = {
  authedPage: import("@playwright/test").Page;
};

export const test = base.extend<AuthFixtures>({
  authedPage: async ({ page, context }, use) => {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const token = await new SignJWT({
      sub: "test-user",
      email: "cb@webhouse.dk",
      name: "Test Admin",
      role: "admin",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(secret);

    await context.addCookies([
      { name: "cms-session", value: token, domain: "localhost", path: "/" },
      { name: "cms-active-org", value: "default", domain: "localhost", path: "/" },
      { name: "cms-active-site", value: "default", domain: "localhost", path: "/" },
    ]);

    await use(page);
  },
});

export { expect } from "@playwright/test";
```

#### Mock LLM Fixture (Playwright)
```typescript
// packages/cms-admin/e2e/fixtures/mock-llm.ts
import type { Page } from "@playwright/test";

const MOCK_TEXT = {
  id: "msg_test", type: "message", role: "assistant",
  content: [{ type: "text", text: "Mock AI response for testing." }],
  model: "claude-sonnet-4-6", stop_reason: "end_turn",
  usage: { input_tokens: 50, output_tokens: 20 },
};

export async function mockLlmResponses(page: Page) {
  await page.route("**/api.anthropic.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_TEXT) })
  );
}

export function mockLlmWithResponse(page: Page, text: string) {
  return page.route("**/api.anthropic.com/**", (route) =>
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ...MOCK_TEXT, content: [{ type: "text", text }] }),
    })
  );
}
```

#### Test Data Fixture (Playwright)
```typescript
// packages/cms-admin/e2e/fixtures/test-data.ts
import type { Page } from "@playwright/test";

export async function seedDocument(page: Page, collection: string, slug: string, data: Record<string, unknown>) {
  return page.request.post(`/api/cms/content/${collection}/${slug}`, {
    data: { ...data, status: "draft" },
  });
}

export async function deleteDocument(page: Page, collection: string, slug: string) {
  return page.request.delete(`/api/cms/content/${collection}/${slug}`);
}

export async function seedAndCleanup(page: Page, collection: string, slug: string, data: Record<string, unknown>) {
  await seedDocument(page, collection, slug, data);
  return async () => { await deleteDocument(page, collection, slug).catch(() => {}); };
}
```

#### API Client (Vitest)
```typescript
// packages/cms-admin/tests/helpers/api-client.ts
import { SignJWT } from "jose";

const BASE = "http://localhost:3010";
const SECRET = process.env.CMS_JWT_SECRET ?? "b6ff0b5caa2ee4308470dfb3668b3835ef164174f87c176a41b8ea5e5b450dcd";

let cachedToken: string | null = null;

export async function getTestToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  const secret = new TextEncoder().encode(SECRET);
  cachedToken = await new SignJWT({ sub: "test-user", email: "cb@webhouse.dk", name: "Test Admin", role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(secret);
  return cachedToken;
}

export async function api(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getTestToken();
  return fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Cookie: `cms-session=${token}; cms-active-org=default; cms-active-site=default`,
      ...options.headers,
    },
  });
}
```

### A.3 Feature Test Convention

**Rule: every feature PR must include tests.** The convention:

1. **Unit tests** go in `packages/cms-admin/src/lib/__tests__/{feature}.test.ts` or `packages/cms/src/__tests__/{feature}.test.ts`
2. **API tests** go in `packages/cms-admin/tests/api/{feature}.test.ts`
3. **E2E tests** go in a numbered suite file in `packages/cms-admin/e2e/suites/`
4. Tests are written BEFORE implementation (per CLAUDE.md feature process)
5. Each test file has a header comment linking to the feature number:
   ```typescript
   /**
    * F48 i18n — locale helpers and translation logic
    * @see docs/features/F48-i18n.md
    */
   ```

### A.4 Migrate Existing Tests

Move existing 224+ tests into the standard structure:

| Current location | Target location | Action |
|-----------------|----------------|--------|
| `packages/cms/src/__tests__/*.test.ts` (83 tests) | Stay in place | No move needed — already correct |
| `packages/cms/src/schema/__tests__/builtin-blocks.test.ts` | Stay in place | No move needed |
| `packages/cms-admin/src/lib/__tests__/*.test.ts` (90+ tests) | Stay in place | No move needed |
| `packages/cms-admin/e2e/console-errors.spec.ts` | `e2e/suites/01-auth.spec.ts` (merge) | Migrate, use shared auth fixture |
| `packages/cms-admin/e2e/debug-screenshot.spec.ts` | Delete or keep as utility | Not a real test |
| `packages/cms-admin/e2e/agent-detail.spec.ts` | `e2e/suites/05-agent-pipeline.spec.ts` | Migrate |
| `packages/cms-admin/e2e/richtext-roundtrip.spec.ts` | `e2e/suites/03-richtext.spec.ts` | Migrate, use shared auth fixture |
| `packages/cms-admin/e2e/tab-isolation.spec.ts` | `e2e/suites/10-navigation.spec.ts` | Migrate |
| `tests/landing-page.spec.ts` | `e2e/suites/01-auth.spec.ts` (merge) | Migrate |
| `tests/login-flow.spec.ts` | `e2e/suites/01-auth.spec.ts` (merge) | Migrate |
| `tests/debug-login.spec.ts` | Delete or keep as utility | Not a real test |
| `tests/login-local.spec.ts` | Delete or keep as utility | Not a real test |
| `tests/org-site-switch.spec.ts` | `e2e/suites/10-navigation.spec.ts` | Migrate |
| `tests/viewer-rbac.spec.ts` | `e2e/suites/01-auth.spec.ts` (merge) | Migrate |

### A.5 CI Pipeline

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: pnpm install --frozen-lockfile
      - run: npx tsc --noEmit --project packages/cms-admin/tsconfig.json

  unit-tests:
    runs-on: ubuntu-latest
    needs: typecheck
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: pnpm install --frozen-lockfile
      - run: cd packages/cms && npx vitest run
      - run: cd packages/cms-admin && npx vitest run

  e2e-tests:
    runs-on: ubuntu-latest
    needs: unit-tests
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: pnpm install --frozen-lockfile
      - run: cd packages/cms-admin && npx playwright install chromium
      - run: cd packages/cms-admin && npx playwright test
        env:
          CMS_JWT_SECRET: ${{ secrets.CMS_JWT_SECRET }}
```

### A.6 Package Scripts

Add to `packages/cms-admin/package.json`:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:api": "vitest run tests/api/",
    "test:all": "vitest run && playwright test"
  }
}
```

Add root `package.json`:
```json
{
  "scripts": {
    "test": "pnpm -r run test",
    "test:e2e": "cd packages/cms-admin && pnpm test:e2e"
  }
}
```

### A.7 Playwright Config Update

```typescript
// packages/cms-admin/playwright.config.ts — updated
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "suites/**/*.spec.ts",
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: "http://localhost:3010",
    headless: true,
  },
  webServer: {
    command: "pnpm dev",
    port: 3010,
    reuseExistingServer: true,
  },
});
```

### Files affected (Phase A)
- New: `e2e/fixtures/auth.ts`, `mock-llm.ts`, `test-data.ts`, `helpers.ts`
- New: `tests/helpers/api-client.ts`, `test-server.ts`, `test-db.ts`
- New: `.github/workflows/test.yml`
- Edit: `packages/cms-admin/playwright.config.ts` — update testDir/testMatch
- Edit: `packages/cms-admin/package.json` — add test scripts
- Edit: root `package.json` — add test scripts
- Move: 11 existing spec files → `e2e/suites/` (refactored to use shared fixtures)

---

## Phase B — Retrospective Coverage

**Size:** L (5-7 days)
**Priority:** Tier 2 — important but not blocking. New features ship with tests via Phase A framework.

Write tests for existing shipped features that currently have zero coverage:

### B.1 E2E Suites to write

| Suite | Feature coverage | Estimated tests |
|-------|-----------------|----------------|
| 02-content-crud | Create, edit, save, reload, delete, slug generation | 8-10 |
| 04-media | Upload, rename, delete, gallery, image picker, AI analysis | 8-10 |
| 05-agent-pipeline | Agent run, curation queue, approve/reject, budget (absorbs F65) | 6-8 |
| 06-interactives | Create, edit, preview, save, embed | 5-6 |
| 07-settings | Site settings, org settings, AI defaults, deploy config | 6-8 |
| 08-deploy | Build, preview, publish, deploy history | 4-5 |
| 09-scheduling | Schedule publish/unpublish, calendar view | 4-5 |

### B.2 API Integration Tests to write

| Test file | Routes covered | Estimated tests |
|-----------|---------------|----------------|
| content.test.ts | CRUD for /api/cms/content/ | 8-10 |
| media.test.ts | /api/upload, /api/media/ | 5-6 |
| agents.test.ts | Agent CRUD, run, curation | 6-8 |
| chat.test.ts | /api/cms/chat, conversations | 5-6 |
| seo.test.ts | SEO optimize, bulk, export | 4-5 |
| admin.test.ts | Profile, site-config, org endpoints | 5-6 |
| auth.test.ts | Login, session, JWT verification | 4-5 |
| search.test.ts | /api/search, /api/cms/content search | 3-4 |

### B.3 Unit Tests to add

| Test file | Coverage | Estimated tests |
|-----------|----------|----------------|
| model-resolver.test.ts | getModel() for all purposes, config override, defaults | 6-8 |
| chat-tools.test.ts | Tool registration, bulk tools, schedule tool | 8-10 |
| media-meta.test.ts | Media metadata read/write, EXIF data | 5-6 |
| scheduler.test.ts | Scheduler tick, publishDue, agent scheduling | 6-8 |
| enrichment.test.ts | Post-build enrichment output | 4-5 |

---

## Feature Test Templates

When implementing a new feature, copy this template into the feature's test file:

### Unit Test Template
```typescript
/**
 * F{number} {Feature Name} — {description}
 * @see docs/features/F{number}-{slug}.md
 */
import { describe, it, expect, beforeEach } from "vitest";

describe("F{number}: {Feature Name}", () => {
  describe("{function/module name}", () => {
    it("happy path — {expected behavior}", () => {
      // Arrange → Act → Assert
    });

    it("edge case — {edge description}", () => {});

    it("regression — single-locale site unchanged", () => {
      // Guard: ensure new feature doesn't break existing behavior
    });
  });
});
```

### Playwright E2E Template
```typescript
/**
 * F{number} {Feature Name} — E2E tests
 * @see docs/features/F{number}-{slug}.md
 */
import { test, expect } from "../fixtures/auth";

test.describe("F{number}: {Feature Name}", () => {
  test("user can {action} via UI", async ({ authedPage: page }) => {
    await page.goto("/admin/{page}");
    // Interact → Assert
  });
});
```

---

## How New Features Plug In

Example: F48 i18n ships with these test files:

1. `packages/cms-admin/src/lib/__tests__/i18n.test.ts` — unit tests for locale helpers, SEO limits, stale detection (already designed in F48 plan: ~40 tests across 6 phases)
2. `packages/cms-admin/tests/api/translations.test.ts` — API tests for translation CRUD, bulk translate
3. `packages/cms-admin/e2e/suites/12-i18n.spec.ts` — E2E tests for translation panel, side-by-side editor, locale filter

Each phase of F48 has pre-defined tests in the feature plan. The cc session implementing Phase 1 writes the Phase 1 tests FIRST, then implements, then verifies.

---

## Impact Analysis

### Files affected
Phase A: 11 new files (fixtures + helpers + CI), 2 config edits, 11 spec file moves.
Phase B: ~30 new test files across 3 layers.

### Blast radius
Zero production code changes. Only test infrastructure and CI.

### Breaking changes
None. Existing tests are migrated, not deleted. Old paths can be kept temporarily with symlinks if needed.

### Supersedes
- **F65 (Agent Pipeline E2E Tests)** — absorbed into Suite 05

## Implementation Order

```
Phase A (Infrastructure) — DO NOW, before F48/F112
  A.1 Create directory structure + shared fixtures     [S]  2-3h
  A.2 Migrate existing 11 Playwright specs             [S]  2-3h
  A.3 CI pipeline (.github/workflows/test.yml)         [S]  1-2h
  A.4 Package scripts + playwright config update       [S]  30min
  A.5 Verify: all 224+ existing tests still pass       [S]  1h

Phase B (Retrospective Coverage) — Tier 2, after F48/F112
  B.1 E2E suites 02-09                                [L]  3-4 days
  B.2 API integration tests (8 route groups)           [M]  2-3 days
  B.3 Additional unit tests                            [S]  1 day
```

**Phase A total: 2-3 days**
**Phase B total: 5-7 days**

## Dependencies

- Existing Playwright + Vitest already installed
- F80 (Admin Selector Map) — nice-to-have for stable selectors, not blocking
- `jose` package for JWT in fixtures (already installed)

> **RULE: After Phase A ships, every feature PR that adds functionality MUST include tests following the convention in this document. No exceptions.**
