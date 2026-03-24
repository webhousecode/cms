# F99 — End-to-End Testing Suite

> Komplet testinfrastruktur for CMS'et: Playwright UI tests, API integration tests, unit tests for core logic — CI-ready og kørbar ved hvert commit.

## Problem

CMS'et har i dag 99 API routes, 20+ admin-sider, 8 npm-pakker og et komplekst agent pipeline — men næsten ingen automatiserede tests:

- **4 Playwright specs** i `cms-admin/e2e/` — kun superficielle UI checks (console errors, tab isolation, sidebar links)
- **7 Vitest unit tests** i `packages/cms/src/__tests__/` — schema, filesystem, SQLite, GitHub, content-service, autolink
- **0 API integration tests** — ingen af de 99 API routes testes automatisk
- **0 content roundtrip tests** — ingen verifikation af create→save→reload→build→verify
- **0 auth flow tests** — login, session, JWT, GitHub OAuth utestet
- **0 media pipeline tests** — upload, rename, delete, gallery utestet

En eneste regressionskommit kan knække content editing, auth, media upload eller publishing — og det opdages først manuelt. For et CMS der skal sælges, er det en ship blocker.

## Solution

Trelagstest-arkitektur der dækker hele CMS'et:

1. **UI Tests (Playwright)** — browser-baserede flows: auth, content CRUD, media, interactives, settings, deploy, agent pipeline
2. **API Integration Tests (Vitest)** — direkte HTTP-kald mod alle `/api/` routes med test-database
3. **Unit Tests (Vitest)** — udvidet dækning af core logic: schema validation, content transforms, registry, auth helpers

CI-ready med GitHub Actions — kører ved hvert push/PR. Mock LLM for agent tests ($0 cost). Testdata fixtures der kan resets mellem runs.

**Absorberer F65 (Agent Pipeline E2E Tests)** — agent pipeline tests bliver ét suite (suite 5) i denne bredere feature. F65 markeres som "Superseded by F99".

## Technical Design

### Test Directory Structure

```
packages/cms-admin/
  e2e/                              # Playwright UI tests
    fixtures/
      auth.ts                       # JWT helper — sign test tokens, login flow
      mock-llm.ts                   # Intercept Anthropic/OpenAI API → deterministic responses
      test-data.ts                  # Seed/reset test content, agents, media
      helpers.ts                    # Navigate, wait, assert helpers
    suites/
      01-auth.spec.ts               # Login, logout, session expiry, protected routes
      02-content-crud.spec.ts       # Create, edit, save, reload, delete documents
      03-richtext.spec.ts           # Rich text editor: bold, links, embeds, images
      04-media.spec.ts              # Upload, rename, delete, gallery, image picker
      05-agent-pipeline.spec.ts     # Agent → curation → approve/reject (from F65)
      06-interactives.spec.ts       # Create, edit, preview, embed in content
      07-settings.spec.ts           # Site settings, org settings, user profile
      08-deploy.spec.ts             # Build, preview, publish flow
      09-scheduling.spec.ts         # Schedule publish/unpublish, calendar
      10-navigation.spec.ts         # Sidebar, tabs, site switcher, org switcher
    visual/                         # Reserved for F20 Visual Testing
    playwright.config.ts            # Shared config (already exists, extended)

  tests/                            # Vitest API + integration tests
    api/
      auth.test.ts                  # POST /api/auth/login, JWT verification
      content.test.ts               # CRUD /api/cms/content/:collection/:slug
      media.test.ts                 # POST /api/upload, GET/DELETE /api/media/*
      agents.test.ts                # Agent CRUD, run, curation endpoints
      search.test.ts                # GET /api/search
      schema.test.ts                # GET /api/schema/:collection
      admin.test.ts                 # Profile, site-settings, org endpoints
      interactives.test.ts          # CRUD /api/interactives/*
      publish.test.ts               # Build trigger, deploy hooks
    helpers/
      test-server.ts                # Spin up Next.js test instance
      test-db.ts                    # Seed/reset test data
      api-client.ts                 # Typed fetch wrapper with auth

packages/cms/src/__tests__/         # Unit tests (extend existing)
  registry.test.ts                  # Site registry CRUD, validation
  auth.test.ts                      # JWT sign/verify, password hash, user lookup
  media-meta.test.ts                # Media metadata read/write
  content-transform.test.ts         # Content processing, slug generation
  enrichment.test.ts                # Post-build enrichment (F89) output verification
  scheduler.test.ts                 # Scheduler tick logic, agent scheduling
```

### Playwright Auth Fixture

Genbruger det eksisterende JWT-mønster fra `console-errors.spec.ts`, men som shared fixture:

```typescript
// packages/cms-admin/e2e/fixtures/auth.ts
import { test as base, expect } from "@playwright/test";
import { SignJWT } from "jose";

const JWT_SECRET = process.env.JWT_SECRET
  ?? "***REMOVED-JWT-SECRET***";

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
    ]);

    await use(page);
  },
});

export { expect };
```

### Mock LLM Fixture (fra F65)

```typescript
// packages/cms-admin/e2e/fixtures/mock-llm.ts
import type { Page } from "@playwright/test";

const MOCK_RESPONSE = {
  id: "msg_test",
  type: "message",
  role: "assistant",
  content: [{
    type: "text",
    text: JSON.stringify({
      title: "Test Generated Article",
      slug: "test-generated-article",
      body: "<p>Mock content for E2E testing.</p>",
      status: "draft",
    }),
  }],
  model: "claude-sonnet-4-6-20250514",
  stop_reason: "end_turn",
  usage: { input_tokens: 100, output_tokens: 200 },
};

export async function mockLlmResponses(page: Page) {
  await page.route("**/api.anthropic.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_RESPONSE) })
  );
  await page.route("**/api.openai.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      choices: [{ message: { content: MOCK_RESPONSE.content[0].text } }],
      usage: { prompt_tokens: 100, completion_tokens: 200 },
    }) })
  );
}
```

### Test Data Fixture

```typescript
// packages/cms-admin/e2e/fixtures/test-data.ts
import type { Page } from "@playwright/test";

/** Seed a test document via API */
export async function seedDocument(page: Page, collection: string, slug: string, data: Record<string, unknown>) {
  return page.request.post(`/api/cms/content/${collection}/${slug}`, { data });
}

/** Delete a test document via API */
export async function deleteDocument(page: Page, collection: string, slug: string) {
  return page.request.delete(`/api/cms/content/${collection}/${slug}`);
}

/** Upload a test file via API */
export async function uploadTestFile(page: Page, filename: string, content: Buffer) {
  const formData = new FormData();
  formData.append("file", new Blob([content]), filename);
  return page.request.post("/api/upload", { multipart: { file: { name: filename, mimeType: "image/png", buffer: content } } });
}
```

### Key UI Test Suites

#### Suite 1: Auth

```typescript
// e2e/suites/01-auth.spec.ts
test("login with valid credentials → redirects to admin", ...);
test("login with invalid password → shows error", ...);
test("expired session → redirects to login", ...);
test("protected route without session → 401", ...);
test("viewer role cannot see write UI elements", ...);
```

#### Suite 2: Content CRUD (mest kritisk)

```typescript
// e2e/suites/02-content-crud.spec.ts
test("create new document → fill fields → save → reload → verify data persists", ...);
test("edit existing document → change title → save → reload → title updated", ...);
test("delete document → confirm → document gone from list", ...);
test("content roundtrip: create → save → build → verify in dist/", ...);
test("slug auto-generation from title", ...);
test("validation error shown for required fields", ...);
```

#### Suite 5: Agent Pipeline (absorberer F65)

```typescript
// e2e/suites/05-agent-pipeline.spec.ts
test("agent run → curation queue → approve → document created", ...);
test("agent run → reject with feedback → item in rejected tab", ...);
test("budget enforcement → blocks over-limit runs", ...);
test("cockpit settings → save → persist on reload", ...);
test("scheduled agent → triggers on schedule tick", ...);
```

### API Integration Tests

```typescript
// packages/cms-admin/tests/api/content.test.ts
import { describe, it, expect } from "vitest";

describe("Content API", () => {
  it("POST /api/cms/content/:collection/:slug — creates document", async () => {
    const res = await fetch("http://localhost:3010/api/cms/content/posts/test-post", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `cms-session=${testToken}` },
      body: JSON.stringify({ title: "Test Post", body: "<p>Hello</p>" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.title).toBe("Test Post");
  });

  it("GET /api/cms/content/:collection/:slug — returns document", ...);
  it("PUT /api/cms/content/:collection/:slug — updates document", ...);
  it("DELETE /api/cms/content/:collection/:slug — soft deletes", ...);
  it("GET /api/cms/content/:collection — lists documents", ...);
  it("unauthorized request → 401", ...);
});
```

### CI Integration

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: pnpm install --frozen-lockfile
      - run: cd packages/cms && npx vitest run
      - run: npx tsc --noEmit --project packages/cms-admin/tsconfig.json

  api-tests:
    runs-on: ubuntu-latest
    needs: unit-tests
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: pnpm install --frozen-lockfile
      - run: cd packages/cms-admin && npx vitest run tests/api/

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
          JWT_SECRET: ${{ secrets.JWT_SECRET }}
```

### Test Commands

```bash
# Alt
pnpm test                                          # Kører alt

# Unit tests (eksisterende + nye)
cd packages/cms && npx vitest run                   # Core engine unit tests

# API integration tests
cd packages/cms-admin && npx vitest run tests/api/  # API route tests

# Playwright UI tests
cd packages/cms-admin && npx playwright test        # Alle UI tests
cd packages/cms-admin && npx playwright test suites/02-content-crud.spec.ts  # Enkelt suite

# Type-check (altid)
npx tsc --noEmit --project packages/cms-admin/tsconfig.json
```

## Impact Analysis

### Files affected

**Nye filer (test-only):**
- `packages/cms-admin/e2e/fixtures/auth.ts` — shared auth fixture
- `packages/cms-admin/e2e/fixtures/mock-llm.ts` — LLM mock
- `packages/cms-admin/e2e/fixtures/test-data.ts` — test data seeding
- `packages/cms-admin/e2e/fixtures/helpers.ts` — navigation helpers
- `packages/cms-admin/e2e/suites/01-auth.spec.ts` — auth UI tests
- `packages/cms-admin/e2e/suites/02-content-crud.spec.ts` — content roundtrip
- `packages/cms-admin/e2e/suites/03-richtext.spec.ts` — rich text editor
- `packages/cms-admin/e2e/suites/04-media.spec.ts` — media library
- `packages/cms-admin/e2e/suites/05-agent-pipeline.spec.ts` — agent pipeline (fra F65)
- `packages/cms-admin/e2e/suites/06-interactives.spec.ts` — interactives engine
- `packages/cms-admin/e2e/suites/07-settings.spec.ts` — settings panels
- `packages/cms-admin/e2e/suites/08-deploy.spec.ts` — build/preview/publish
- `packages/cms-admin/e2e/suites/09-scheduling.spec.ts` — content scheduling
- `packages/cms-admin/e2e/suites/10-navigation.spec.ts` — sidebar, tabs, switchers
- `packages/cms-admin/tests/api/*.test.ts` — 8 API test files
- `packages/cms-admin/tests/helpers/*.ts` — 3 test helper files
- `packages/cms/src/__tests__/registry.test.ts` — registry unit tests
- `packages/cms/src/__tests__/auth.test.ts` — auth unit tests
- `packages/cms/src/__tests__/media-meta.test.ts` — media meta tests
- `packages/cms/src/__tests__/content-transform.test.ts` — content transform tests
- `packages/cms/src/__tests__/enrichment.test.ts` — post-build enrichment tests
- `packages/cms/src/__tests__/scheduler.test.ts` — scheduler tests
- `.github/workflows/test.yml` — CI workflow

**Modificerede filer:**
- `packages/cms-admin/playwright.config.ts` — tilføj `suites/` testDir, projects config
- `packages/cms-admin/package.json` — tilføj `test`, `test:e2e`, `test:api` scripts
- `docs/features/F65-agent-pipeline-tests.md` — marker som superseded by F99

### Downstream dependents

`packages/cms-admin/playwright.config.ts` — importeres af Playwright CLI, ikke af application code. No downstream dependents.

`packages/cms-admin/package.json` — modificeres kun med nye scripts. No breaking changes for dependents.

`docs/features/F65-agent-pipeline-tests.md` — documentation only. No downstream dependents.

### Blast radius

- **Ingen produktionskode ændres** — kun testfiler, config og CI
- Playwright config-ændring kunne bryde de 4 eksisterende specs → migrer dem til `suites/` eller behold kompatibilitet via `testDir: "./e2e"`
- CI workflow tilføjer test-step → PR merges kræver at tests passerer (efter CI er aktiveret)
- `package.json` script-tilføjelser er additive — eksisterende scripts uberørt

### Breaking changes

Ingen. Rent additivt — kun nye filer og konfiguration.

### Test plan

- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Eksisterende 4 Playwright specs kører stadig
- [ ] Eksisterende 7 Vitest unit tests passerer
- [ ] Ny auth fixture logger ind og tilgår admin
- [ ] Content roundtrip: create → save → reload → data intakt
- [ ] Agent pipeline: mock LLM → curation → approve → document
- [ ] API tests: alle CRUD endpoints returnerer korrekte statuskoder
- [ ] CI workflow kører succesfuldt i GitHub Actions

## Implementation Steps

1. **Fixtures** — `auth.ts`, `mock-llm.ts`, `test-data.ts`, `helpers.ts`
2. **Suite 02 — Content CRUD** (mest kritisk — verifierer kerneproduktfunktionalitet)
3. **Suite 01 — Auth** (login, logout, session, protected routes)
4. **Suite 04 — Media** (upload, rename, delete, gallery)
5. **Suite 05 — Agent Pipeline** (absorberer F65 — mock LLM, curation, approve/reject)
6. **Suite 03 — Richtext** (bold, links, embeds, image float)
7. **Suite 06 — Interactives** (create, edit, preview, embed)
8. **Suite 07-10** — Settings, Deploy, Scheduling, Navigation
9. **API integration tests** — content, auth, media, agents, search, admin, interactives, publish
10. **Unit tests** — registry, auth, media-meta, content-transform, enrichment, scheduler
11. **Opdater `playwright.config.ts`** — tilføj projects, update testDir
12. **Tilføj scripts** til `package.json` (`test`, `test:e2e`, `test:api`)
13. **CI workflow** — `.github/workflows/test.yml`
14. **Migrer eksisterende 4 specs** → refactor til shared auth fixture
15. **Marker F65 som superseded** i FEATURES.md og plan doc
16. Kør fuld suite, fix opdagede bugs

## Early Implementations

Følgende tests er allerede skrevet og kan indgå direkte i suites:

| Test fil | Target suite | Dækker |
|---|---|---|
| `tests/org-site-switch.spec.ts` | Suite 10 — Navigation | Org-skift loader korrekt default site, intet content-leak mellem orgs, site-skift indenfor org, single-site org → dashboard |

Disse tests bruger `getByRole`/`filter` selectors og `window.location.href` wait-strategi (hard reload). De kan migreres til `e2e/suites/10-navigation.spec.ts` med shared auth fixture når F99 implementeres.

## Dependencies

- **F80 Admin Selector Map** — stable `data-testid` selectors gør tests robuste (nice-to-have, ikke blocker — tests kan starte med `getByText`/`getByRole`)
- Eksisterende Playwright config + `@playwright/test` dependency (allerede installeret)
- Eksisterende Vitest setup i `packages/cms` (allerede konfigureret)

## Effort Estimate

**Large** — 7-10 dage

- Dag 1-2: Fixtures + Content CRUD suite + Auth suite (fundament)
- Dag 3: Media suite + Agent Pipeline suite (absorberer F65)
- Dag 4: Richtext + Interactives suites
- Dag 5: Settings, Deploy, Scheduling, Navigation suites
- Dag 6-7: API integration tests (8 route-grupper)
- Dag 8: Unit tests (6 nye test-filer)
- Dag 9: CI workflow + migrer eksisterende specs
- Dag 10: Stabilisering, flaky test fixes, dokumentation
