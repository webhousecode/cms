# F149 — Web App SDK (`@webhouse/*`)

> Replace F148's "single shared application server" with a **library distribution**: a maintained set of npm packages that wrap every cross-cutting concern customer webapps need (auth, db, mail, stripe, logs, etc.). Each customer-webapp imports the SDK, runs its own runtime, owns its own database. Zero shared single-point-of-failure. The broberg.ai stack ships as code, not as a service.

**Status:** planned (replaces rejected F148)
**Owner:** cms-core
**Priority:** Tier 1 (foundational — unblocks every future customer webapp)
**Estimat:** ~55–75 fokuserede dage across 24 packages + scaffolding site (P1–P11) — revised after 2026-05-09 deep-scan added 11 new packages
**Created:** 2026-05-09

> **Why F149 not F148:** Christian rejected F148 (multi-tenant Bun-Hono app server) on 2026-05-09 because the blast radius is unacceptable — `app.broberg.ai` down = every customer-webapp degrades. The library-not-service pivot in F149 has the opposite property: customer webapps fail independently, no shared runtime to monitor or scale, each customer can pick their own DB/host. The trade-off is "library version drift" instead of "central runtime fragility" — version drift is easier to manage operationally and easier to debug per-customer.

## Problem

A scan of `~/Apps/` on 2026-05-09 revealed massive duplication of the same patterns across 5+ live customer-webapps:

| Capability | whop | contract-manager | cronjobs | sanneandersen/site | cdn-platform | dns-gui |
|---|---|---|---|---|---|---|
| **auth** (JWT/magic-link/passkey) | `lib/auth/` | `lib/auth/` | `src/lib/auth/` | `src/lib/auth/` | `src/lib/auth/` | (none yet) |
| **db** (Drizzle + SQLite/Postgres) | `lib/db/` | `lib/db/` | `src/lib/db/` | `src/lib/auth/db.ts` + per-domain | `src/lib/db/` | `lib/db/` |
| **email** (Resend) | (none) | `lib/email/` | (Resend imported) | `src/lib/auth/email.ts` + 7 templates | `src/lib/email/providers/` | (none) |
| **stripe** | (none) | (none) | (none) | `src/lib/stripe/` | (none) | (none) |
| **logs** | `lib/logs/` (polished, SSH collector) | (none) | (none) | (eir/audit.ts) | (none) | (none) |
| **storage** | `lib/screenshot/` (S3) | (none) | (none) | `src/lib/storage/` | (R2 + S3 providers) | (none) |
| **MCP** | (none) | (none) | (none) | (none) | (none) | (separate `dns-mcp` repo) |

Each webapp implements these from scratch, with subtle differences:
- `sanneandersen` uses `SA_AUTH_SECRET` + `sa-session` cookie + `jose` for JWT signing
- `whop` has its own JWT helpers + custom alert system + production-grade SSH log collector
- `contract-manager` has a parallel Resend-based mail system with its own templates
- `cdn-platform` has multi-provider email abstraction (SMTP + others) — the most polished
- Each has its own Drizzle schema, its own migration runner, its own seed scripts

Concrete consequence (the 2026-05-06 ICD audit on sanneandersen):
- Sanne's `auth_users` SQLite table never reaches CMS users-collection
- The `syncUserToCms()` function has a path bug (`process.cwd()` returns `/app`, not `/data`)
- Christian shows as `role: client` in CMS but `role: admin` in sanne's auth db
- Sanne herself is invisible in CMS

The pattern: every webapp re-invents the cross-cutting layer because there's no maintained SDK. Each re-invention has its own bugs, its own gaps, its own drift. The cost compounds linearly per webapp.

F148 (single shared app server) would solve this by centralizing the runtime — but Christian's blast-radius concern is correct: a single broberg-app failure cascades to every customer. F149 solves the same duplication problem by centralizing the **code** instead of the **runtime**: maintained npm packages that each webapp imports + runs locally.

## Solution

A maintained set of `@webhouse/*` npm packages, published on a regular cadence (matching existing F-cadence in `packages/cms/`). Each package wraps one cross-cutting concern with a clean, opinionated API. Customer webapps:

1. Pick their own runtime (Next.js, Bun-Hono, etc.)
2. Pick their own database (SQLite for solo sites, Postgres for multi-region, hosted Neon/Supabase for managed)
3. `npm install @webhouse/auth @webhouse/db @webhouse/mail ...`
4. Wire the SDK into their app routes (clear examples + scaffolding site to copy)
5. Own their own runtime, scaling, secrets, monitoring

Failure isolation: if `@webhouse/mail` has a bug, ONE customer-webapp's mail breaks until they bump the version. No cascade. No shared 3am pager.

### How this complements F147 (Webapp Blueprint Contract)

F147 defines **the shape** customer-webapps should consume: 5 capabilities (auth, content, chat, payments, storage) addressed via env-vars. F147 deliberately leaves the *implementation* open.

F149 is one implementation: code libraries instead of a shared service. The F147 scaffolder generates webapp skeletons that:
- Import `@webhouse/auth` (instead of pointing at `BROBERG_AUTH_URL`)
- Import `@webhouse/cms-content` (instead of HTTP-fetching from `BROBERG_CMS_URL`)
- Import `@webhouse/trail-connect` (instead of pointing at `BROBERG_TRAIL_URL`)
- Etc.

If a future customer-site wants to share a multi-tenant gateway later (the F148 pattern, perhaps for high-volume customers), the F147 contract still permits flipping env-vars without source changes. **F149 is the default; F148 stays available as an opt-in for special cases.**

## Scope

### IN-scope

13 npm packages (full list in "Package matrix" below), maintained at parity with `@webhouse/cms` versioning cadence. A scaffolding site that demonstrates ALL packages working together end-to-end with realistic test data. Migration runbooks for the 5 existing customer-webapps, executed only on Christian's go.

### OUT-of-scope

- A shared runtime / gateway (rejected as F148)
- A managed database service (each site hosts its own)
- Replacing existing customer-webapps' working code (forward-only — old patterns coexist with SDK adoption per-site)
- Multi-tenant data isolation in shared infrastructure (each site is its own tenant)
- A CDN or edge-hosting layer (Tigris + Cloudflare R2 stay direct)

### Non-goals

- Becoming a general-purpose framework like Next.js or Remix
- Replacing trail or cms (those are services with their own packages; `@webhouse/trail-connect` and `@webhouse/cms-content` are thin clients)
- Tying customers to a specific runtime or database choice
- Locking the SDK to broberg.ai-only services (every package must work standalone — e.g., `@webhouse/auth` works without trail or cms)

## Package matrix

Below is the full set of packages F149 ships, with concrete responsibilities and the existing code that informs each one.

| Package | Responsibility | Existing reference code |
|---|---|---|
| `@webhouse/auth` | Magic-link, passkey (WebAuthn), JWT sessions, role middleware. HS256 cookies + Authorization headers. Sub-modules per pattern (`/magic-link`, `/passkey`, `/middleware`). | sanne's `src/lib/auth/jwt.ts` (port + generalize), F59 passkey code in cms-admin |
| `@webhouse/users` | RBAC roles + permissions, user CRUD, user-store adapter pattern. Plugs into `@webhouse/db`. | cms-admin's `permissions-shared.ts` (the canonical RBAC) |
| `@webhouse/db` | Drizzle wrapper + migration runner + adapter pattern: SQLite (better-sqlite3), Postgres (postgres-js), Neon/Supabase (managed). One import surface, swap driver via config. | whop's `lib/db/`, contract-manager's `lib/db/`, sanne's domain-DBs |
| `@webhouse/entity-store` | Generic JSON-blob entity table on top of `@webhouse/db`. `entity(site_id, collection, id, data, audit)` for transactional state CMS isn't built for. Schema-flexible like CMS, but with proper concurrency, transactions, and indexed JSON queries. | New (designed for F149; informed by F148's entity table sketch) |
| `@webhouse/mail` | Resend-backed transactional mail. Templates as React components (or string-templates). Test-mode + dry-run. Magic-link helper that integrates with `@webhouse/auth`. | sanne's `lib/mail-templates/` (8 templates), cdn-platform's multi-provider abstraction |
| `@webhouse/notifications` | Cross-channel notifications: Discord webhook, Slack webhook, browser Web Push, mobile push. Shared `notify({channel, severity, message})` signature. | whop's alert system, cms-admin's notification helpers, F35 lifecycle webhooks |
| `@webhouse/logs` | Structured logging (pino-style), log-collector adapters (SSH, file, HTTP), per-site log namespacing. Includes the polished SSH log collector from whop. | whop's `lib/logs/collector.ts` + `framework.ts` (production-grade) |
| `@webhouse/webhooks` | HMAC-signed webhook dispatcher with retry-chain (1s/4s/16s) + Discord alert on exhaustion. Receiver helper (signature-verify, body-parse, replay-guard). | F145 ICD retry-chain, F35 lifecycle hooks, today's `revalidation.ts` |
| `@webhouse/chat` | Chat UI primitives + streaming-response client. Pluggable backend (`@webhouse/trail-connect` is the default). Eir-pattern as reference component. | sanne's Eir client, cms-admin's chat tools |
| `@webhouse/trail-connect` | Thin TypeScript client for trail's HTTP API. Wraps `@trailmem/sdk` (already exists). Memory + KB search + MCP tool re-export. | trail's existing `packages/sdk/` |
| `@webhouse/cms-content` | Read-only client for `@webhouse/cms-admin`'s content API. Token-scoped, ICD revalidation receiver helper, content-type generators from cms.config.ts. | F139 headless API, today's content-fetch patterns |
| `@webhouse/stripe` | Stripe Connect router with `application_fee_amount` enforcement (revenue-share to Christian's master account). Checkout helpers, webhook receiver, refund flow. | sanne's `src/lib/stripe/`, F136 cms-shop's checkout/webhooks |
| `@webhouse/files` | Multi-provider file storage: Cloudflare R2, Tigris, S3-compatible, local-dev fallback. Upload signing, presigned URLs, CDN URL generation. | cdn-platform's R2 + S3 providers, sanne's `lib/storage/` |
| `@webhouse/mcp` | MCP server + client helpers. Tool registration patterns, JWT-authed tool execution, integration with `@webhouse/users` for permission gating. | cms-mcp-server, cms-mcp-client, dns-mcp |
| `@webhouse/ai` | Wrapper on existing `@webhouse/cms-ai` (currently in `packages/cms-ai/`): provider abstraction (Anthropic, OpenAI, Gemini), model selection, fallback chains, budget tracking, tool-use orchestration. | Existing `packages/cms-ai/` (agents, budget, orchestrator, providers) |

13 packages total. `@webhouse/ai` and `@webhouse/cms-content` and `@webhouse/cms-mcp-*` already partially exist in the cms monorepo — F149 either re-namespaces them (`cms-ai` → `ai`) or re-exports them from new packages.

## Architecture

### Repo + monorepo layout

All 13 packages live in the existing `cms` monorepo (which is already pnpm + Turbo). Reasons:

- Versioning cadence stays in sync with cms (already v0.4.0 → bump together)
- Shared ESLint, tsconfig, vitest, build (tsup) toolchain
- Atomic refactors across packages possible
- Single CI / publish pipeline (already wired for npm trusted-publishing via OIDC)
- Avoids a separate `webhouse-sdk` repo with duplicate ops

```
packages/
  ai/                      → @webhouse/ai            (rename: cms-ai → ai, alias preserved)
  auth/                    → @webhouse/auth          (NEW)
  chat/                    → @webhouse/chat          (NEW)
  cms-admin/               → @webhouse/cms-admin     (existing)
  cms-content/             → @webhouse/cms-content   (NEW — extract content-fetch from cms-admin)
  cms/                     → @webhouse/cms           (existing — engine)
  db/                      → @webhouse/db            (NEW)
  entity-store/            → @webhouse/entity-store  (NEW)
  files/                   → @webhouse/files         (NEW)
  logs/                    → @webhouse/logs          (NEW — port whop)
  mail/                    → @webhouse/mail          (NEW — port sanne)
  mcp/                     → @webhouse/mcp           (NEW — generalize cms-mcp-*)
  notifications/           → @webhouse/notifications (NEW)
  stripe/                  → @webhouse/stripe        (NEW — port sanne+cms-shop)
  trail-connect/           → @webhouse/trail-connect (NEW — wrap @trailmem/sdk)
  users/                   → @webhouse/users         (NEW — extract RBAC from cms-admin)
  webhooks/                → @webhouse/webhooks      (NEW — port F145 ICD)
  ...existing cms-* packages
```

### Database abstraction

Each site picks ONE driver via config:

```ts
// In customer-webapp's app boot
import { createDb } from "@webhouse/db";

// Solo site, single Fly machine: SQLite
export const db = createDb({
  driver: "sqlite",
  path: process.env.DB_PATH ?? "/data/app.db",
});

// Multi-region, managed: Postgres
export const db = createDb({
  driver: "postgres",
  url: process.env.DATABASE_URL!,
});

// Test/dev: in-memory SQLite
export const db = createDb({ driver: "sqlite", path: ":memory:" });
```

The driver returns a Drizzle instance. ALL other packages (`@webhouse/auth`, `@webhouse/users`, `@webhouse/entity-store`) accept the `db` instance via dependency injection. NO package hardcodes a driver. NO package owns its own schema — they ship Drizzle migrations the host app composes.

### Migration composition

Each package ships its own Drizzle migration files in a published `migrations/` dir. Customer webapp aggregates them in its own migration runner:

```ts
// customer-webapp/scripts/migrate.ts
import { runMigrations } from "@webhouse/db";

await runMigrations(db, {
  modules: [
    "@webhouse/auth/migrations",
    "@webhouse/users/migrations",
    "@webhouse/entity-store/migrations",
    // ...customer-specific migrations
    "./drizzle/migrations",
  ],
});
```

Migrations are run in declared order. Each module's migrations are namespaced so they don't conflict (table names like `auth_users`, `entity_entities`, `webhouse_audit_log`).

### Auth flow (canonical example)

```ts
// customer-webapp/src/app/api/auth/magic-link/route.ts
import { sendMagicLink } from "@webhouse/auth";
import { db } from "@/lib/db";
import { mail } from "@/lib/mail";

export async function POST(req: Request) {
  const { email } = await req.json();
  await sendMagicLink({ db, mail, email, callbackUrl: "/auth/verify" });
  return Response.json({ ok: true });
}
```

```ts
// customer-webapp/src/lib/mail.ts
import { createMail } from "@webhouse/mail";
export const mail = createMail({
  apiKey: process.env.RESEND_API_KEY!,
  from: "noreply@yourdomain.dk",
});
```

Same shape across every customer-webapp. The cc-session shipping a new webapp doesn't write the auth code — they call `sendMagicLink(...)` and trust the package.

### Versioning + release cadence

- All packages publish together at the same SemVer version (matching existing `@webhouse/cms` cadence)
- Major bumps require migration notes in each affected package's CHANGELOG
- A "compatibility matrix" doc (`docs/sdk-compat.md`) tracks which versions of `@webhouse/auth` work with which `@webhouse/db` (currently always: same major)
- Renovate config in customer-webapps auto-PRs minor + patch bumps; major bumps require manual review

## Scaffolding site

A fully working reference webapp at `packages/scaffolding-site/` (or `examples/sdk-reference/`) that:

- Uses ALL 13 packages
- Has realistic test data (10 users with various roles, 50 entities across 3 collections, 20 sample emails sent in dev mode, 5 Stripe test orders, 3 chat conversations, file uploads)
- Demonstrates each capability with a clear page (e.g., `/demo/auth`, `/demo/entity-store`, `/demo/mail`, `/demo/stripe`)
- Includes a `CLAUDE.md` that instructs cc-sessions: "If building a new customer-webapp, copy from this scaffolding site. Do NOT reinvent."
- Is the test-bed: when an SDK package changes, the scaffolding site's tests fail first
- Is deployable as a live demo at `sdk-demo.webhouse.app` so AI sessions can probe it

The scaffolding site is the **canonical reference** F149 ships. Plan-doc + 13 npm packages alone aren't enough — cc-sessions need a working app to copy/paste from.

## Deep-scan findings (2026-05-09)

After the initial 5-app scan above, a **deeper review** of the 8 most complex projects in `~/Apps/` surfaced architectural patterns and reusable components that justify expanding the package matrix and refining the architecture. This section documents what was found and how it changes F149.

### CMS (`~/Apps/webhouse/cms`)

The cms-admin codebase is the densest source of reusable patterns. Beyond what the initial scan captured (auth, db, mail), `packages/cms-admin/src/lib/` contains 70+ modules implementing:

- **Beam** (`beam/`) — site-content transfer between cms-admin instances. Unique pattern for "snapshot one server's site content + replay on another." Useful for staging→prod promotion, disaster recovery, customer onboarding.
- **Build orchestrator** (`build-orchestrator/`, `build-server/`) — F143 + F144 ephemeral build VMs (Fly Machines API + Docker image construction). Includes source-fetch (just shipped), Dockerfile templates, callback tokens.
- **Scheduler infrastructure** (`scheduler.ts`, `scheduler-bus.ts`, `scheduler-log.ts`, `scheduler-notify.ts`, `tools-scheduler.ts`, `cron.ts`, `scheduled-snapshot.ts`) — full-featured cron + scheduled-tasks subsystem with own log + notify channels. Used for backups, link-checks, cleanup jobs.
- **Workflow runner** (`workflow-runner.ts`) — multi-step automation workflows.
- **Agent runner + budget** (`agent-runner.ts`, `agent-budget.ts`, `agent-feedback.ts`, `agent-templates.ts`, `agent-workflows.ts`, `agents.ts`) — autonomous agents with cost limits, feedback loops, template-driven prompts, multi-step workflows.
- **Curation queue** (`curation.ts`) — content moderation review queue.
- **Forms engine** (`forms/`) — F30 form-builder with submissions inbox + auto-reply.
- **WP-migration** (`wp-migration/`) — WordPress import tooling.
- **Document extraction** (`document-extractor.ts`) — PDF/docx → CMS content conversion.
- **Push notifications** (`push-send.ts`, `push-store.ts`) — Web Push subscription store + send pipeline (VAPID).
- **Brand voice** (`brand-voice.ts`) — tone-locking for AI-generated content.
- **Site clone** (`site-clone.ts`) — duplicate site infrastructure (config + content + settings).
- **Onboarding** (`onboarding/`) — guided first-run setup.
- **Cockpit** (`cockpit.ts`) — admin dashboard data aggregation across collections.
- **Storage adapters** in cms-engine (`packages/cms/src/storage/`) — already abstracts filesystem/github/sqlite/supabase. The contract pattern that should inform `@webhouse/db`.

**Implication for F149:** the existing cms-admin lib is ~80% of the SDK already, just not packaged as standalone. Most "new" packages are extractions, not greenfield writes.

### Buddy (`~/Apps/webhouse/buddy`)

Sophisticated multi-process system that orchestrates cc sessions across repos. `apps/server/src/` has 50+ modules implementing patterns nothing else in the stack has:

- **Peer messaging / channel** (`packages/channel/`, `packages/transport/`) — cc-to-cc intercom + service-to-service messaging via SSE. The `secret.ts` pattern for shared-secret authentication is the cleanest in the stack. **This is a NEW SDK package** (`@webhouse/peer-channel`) — nothing else in the matrix covers cross-process messaging.
- **PTY / tmux / iTerm management** (`pty/sidecar-bootstrap.ts`, `pty/start-session.ts`, `pty/tmux.ts`) — orchestrates terminal sessions, headless cc spawning, tmux backgrounding. Enables F47-style autonomous orchestration.
- **Brain inbox watcher + flag delegation** (`brain-inbox-watcher.ts`, `flag-delegation-watcher.ts`, `confirmed-flag-to-trail.ts`) — auto-orchestrator polling + dispatch pattern. The pattern future SDK consumers may want for periodic background work.
- **Discord bot** (`discord-bot.ts`) — Discord ↔ cc bridge. Different pattern from generic "send to webhook" — bidirectional with thread tracking.
- **Auto-knowledge capture** (`commit-to-trail.ts`, `intercom-to-trail.ts`, `session-distill.ts`, `trail-ingest.ts`) — git-commits + intercoms + session-summaries automatically curated into trail. Production-grade ADR pipeline.
- **Notify gate** (`notify-gate.ts`) — rate-limit + quiet-hours for notifications. Solves the "spam Christian's phone at 3am" problem.
- **Repo context auto-discovery** (`repo-context.ts`, `repo.ts`) — figure out which repo a session is in + which sites it manages.
- **Headless session spawning** (`headless-session.ts`, `cc-invocation.ts`, `orchestration-spawn.ts`) — spawn cc sessions programmatically (matches F47 autonomous-self-improvement).
- **Voice package** (`packages/voice/`) — voice integration (TTS/STT) for hands-free cc interaction.
- **Stream** (`stream.ts`) — SSE streaming for live updates.

**Implication for F149:** Buddy's patterns are too valuable to leave un-packaged. **Add `@webhouse/peer-channel` (cc/service messaging), `@webhouse/orchestration` (job/agent/workflow runners), and `@webhouse/voice` (TTS/STT helpers).** The notify-gate and Discord bridge belong inside `@webhouse/notifications`.

### Trail (`~/Apps/broberg/trail`)

The most architecturally advanced AI app in the stack. `packages/` has 6 sub-packages (core, db, pipelines, sdk, shared, storage) and `apps/server/src/services/` has 30+ specialized services:

- **Pipelines** (`packages/pipelines/`) — file-type ingestion (audio, docx, image, pdf, pptx, xlsx). Each pipeline has its own normalization → text+metadata extraction. **Important pattern** — neither CMS's `document-extractor` nor anything else covers all 6 file types.
- **Storage abstraction** (`packages/storage/`) — clean file-storage adapter (`local.ts` today; can grow Cloudflare R2 / Tigris / S3 adapters).
- **DB adapter pattern** (`packages/db/libsql-adapter.ts`) — the cleanest example of the adapter-pattern F149's `@webhouse/db` should follow. Has `interface.ts` + concrete adapter + migration runner + FTS (full-text search) integration.
- **Vision + vision-derivative + transcription + translation** (`apps/server/src/services/`) — AI primitives: image analysis, audio→text, content translation. Reusable beyond trail.
- **Glossary, entity-aggregate, tag-aggregate, tag-suggester, reference-extractor** — automated metadata extraction patterns. Could be a `@webhouse/content-intelligence` package, but more likely these stay as trail-specific composition of the lower-level AI primitives.
- **Cost aggregator + credits** (`cost-aggregator.ts`, `credits.ts`) — AI cost tracking + per-user credit allowances. Reusable as part of `@webhouse/ai`.
- **Contradiction lint + lint-scheduler** (F158) — semantic lint that fires on changes only via signature-skip. Pattern for "expensive AI scans only when content actually changes."
- **Backup** (`services/backup/`) — full-system backup orchestration.
- **Activity logger + access tracker + access rollup** — telemetry pattern with daily rollups.
- **Action recommender** — AI-powered suggestion system.
- **FX (formulas)** (`fx.ts`) — computed fields / derived metadata.

**Implication for F149:** **Add `@webhouse/pipelines` (file-type-specific ingestion → text+metadata)**. Refine `@webhouse/db` to mirror trail's `packages/db/` adapter pattern (it's strictly better than what was sketched in the original plan). Refine `@webhouse/ai` to include vision + transcription + translation + cost-tracking + credits. Trail's storage abstraction confirms `@webhouse/files` should have a similar interface-first design.

### FysioDK Sport (`~/Apps/webhouse/fysiodk-aalborg-sport`)

Next.js 16 + Supabase + PWA + Capacitor. The "real customer mobile-app" reference. `apps/web/src/lib/` has 21 modules:

- **Supabase pattern** (`supabase/client.ts`, `server.ts`, `middleware.ts`) — ssr + service-role split, RLS-aware. Different DB pattern from sanne's local SQLite.
- **App Store Connect + Google Play deploy helpers** (`app-store-connect.ts`, `google-play.ts`, `store-monitor.ts`) — mobile-app deployment automation. Niche but reusable for any future mobile app.
- **Capacitor bridge** (`capacitor-bridge.ts`) — native ↔ web bridge for Capacitor apps.
- **Firebase Admin** (`firebase-admin.ts`) — push via FCM (Android + iOS).
- **Web Push with VAPID** (`web-push.ts`, `push.ts`) — browser Web Push subscription + send. Server-side helper.
- **Image compression** (`image-compression.ts`) — sharp wrapper for upload-time compression.
- **Cron auth** (`cron-auth.ts`) — authenticate scheduled-task callers (different from user-auth).
- **Unsubscribe tokens** (`unsubscribe-token.ts`) — signed tokens for one-click unsubscribe in emails.
- **Gravatar** (`gravatar.ts`) — avatar lookup by email hash.
- **Tiptap utils** (`tiptap-utils.ts`) — richtext editor utilities.
- **Audit + audit-server** (`audit.ts`, `audit-server.ts`) — RLS-aware audit-log helpers using service-role client.
- **API health check** (`api-health-check.ts`) — health/probe endpoint helper.

**Implication for F149:** **Add `@webhouse/mobile`** (Capacitor + APNs/FCM + App Store/Play deploy automation). `@webhouse/db` adapter must include Supabase (it's the second most-common DB choice in the stack after SQLite). `@webhouse/notifications` must include FCM + Web Push (already partially planned). `@webhouse/mail` must support unsubscribe-token flow. `@webhouse/auth` must include cron-auth pattern (signed-secret + IP allowlist for scheduled-task auth).

### Sanne Andersen (`~/Apps/webhouse/sanneandersen/site`) — deeper review

Beyond the initial scan, sanne's `lib/` reveals:

- **Eir AI** (`lib/eir/`) — booking-aware chat assistant. `klippekort.ts` (clip-card), `booking.ts`, `audit.ts`. Domain-specific business logic on top of generic chat — good example of how customer apps compose SDK packages.
- **Klippekort engine** (`klippekort.ts`) — multi-use prepaid bookings. Niche but pattern reusable for course-credits.
- **Course system** (`lib/courses/`) — enrollment, progression, certificates.
- **Qigong subscriptions** (`lib/qigong/db.ts`) — Stripe subscriptions with status sync. The pending-row-then-webhook pattern is the canonical way to handle Stripe events.
- **8 mail templates** (`lib/mail-templates/`) — magic-link, booking-confirmation, klippekort-purchase, klippekort-expiring, booking-cancellation, refund-confirmation, sanne-new-booking, welcome, user-invite. **All should ship in `@webhouse/mail` as React-component templates** for any customer to use.
- **Local SQLite + Drizzle + multi-domain DBs** — sanne has separate DBs per domain (qigong, eir, auth) within one site. Argues for `@webhouse/db` supporting multiple database instances per app, not just one.

**Implication for F149:** `@webhouse/mail` ships sanne's 8 templates as the canonical starter set. `@webhouse/stripe` includes the pending-row-then-webhook subscription pattern. `@webhouse/db` API should accept either single-db or multi-db config (each customer chooses).

### Pitch Vault (`~/Apps/cbroberg/pitch`)

Pitch-presentation tool. Stack: better-sqlite3 + Drizzle + Anthropic SDK + WebAuthn + Monaco editor + Playwright (for screenshots).

- **Auth — 4 methods** (`lib/auth/api-key.ts`, `password.ts`, `session.ts`, `webauthn.ts`) — API key + password (bcrypt) + magic-link sessions + passkey. The richest auth surface in the stack.
- **Storage** (`lib/storage.ts`) — `STORAGE_PATH` env-based directory layout. Clean dependency on env-var for portability.
- **Screenshot** (`lib/screenshot.ts`) — Playwright + chromium + sharp pipeline for thumbnail generation. Pattern reusable for any "preview an HTML asset" need.
- **Template files** (`lib/template-files.ts`) — file-based templates separate from CMS content.
- **WYSIWYG inject** (`lib/wysiwyg-inject.ts`) — same pattern as cms-admin's; should be deduped.

**Implication for F149:** `@webhouse/auth` must support all 4 auth methods (currently planned: magic-link + passkey only — add password + api-key). **Add `@webhouse/screenshot`** (Playwright + sharp wrapper for HTML→PNG). `@webhouse/files` should have the env-var storage-path pattern as the default.

### Coverletter Generator (`~/Apps/cbroberg/coverletter-generator`)

AI-driven cover-letter + CV generator. Stack: Anthropic SDK + NextAuth (with `@auth/drizzle-adapter`) + Drizzle + Google Drive API + Playwright.

- **PDF generation** (`lib/pdf/cover-letter-generator.tsx`, `cv-generator.tsx`, `cv-markdown-parser.ts`, `markdown-parser.tsx`) — markdown → React → PDF rendering pipeline. Pattern reusable for any document export.
- **Web scraping** (`lib/scraper/`) — `base-scraper.ts`, `generic-scraper.ts`, `jobindex-scraper.ts`, `linkedin-scraper.ts`, `scraper-orchestrator.ts`. Anti-bot patterns + per-site adapters. Niche but valuable for any "ingest from external website" need.
- **Google Drive integration** (`lib/google-drive/auth.ts`, `uploader.ts`) — OAuth + uploader. Reusable for any Google Drive integration.
- **AI image search** (`lib/image-search/`) — likely Anthropic vision or Google Images.
- **References + Interviews** — domain modules (likely entity-store style).
- **Auth.js / NextAuth via Drizzle adapter** — different from sanne's hand-rolled JWT auth. Argues that `@webhouse/auth` should ALSO have a "compose with Auth.js" mode for sites that prefer that ecosystem.

**Implication for F149:** **Add `@webhouse/pdf`** (markdown → React → PDF pipeline). **Add `@webhouse/scraping`** (web scraping with anti-bot helpers). **Add `@webhouse/google-drive`** (or fold into a broader `@webhouse/integrations` package). `@webhouse/auth` should document Auth.js interop pattern alongside its native flows.

### Contract Manager (`~/Apps/webhouse/contract-manager`)

Contract management with Danish business-registry integration. Stack: Next.js + Drizzle + SQLite + Resend.

- **CVR lookup** (`lib/cvr-lookup.ts`) — Danish business registry API integration. Niche but Denmark-centric customers will need it.
- **Contract module** (`lib/contract/`) — signing flow + status tracking + tokens.
- **Tokens** (`lib/tokens.ts`) — contract-specific signed tokens (different from auth sessions).
- **API auth** (`lib/api-auth.ts`) — API authentication helper for contract endpoints.
- **Email module** (`lib/email/`) — Resend integration with contract-specific templates.

**Implication for F149:** **Add `@webhouse/cvr`** (Danish business registry — narrow but reusable for any DK customer). The contract-signing flow itself is too domain-specific to package, but the **token-pattern** (signed time-limited URLs for actions) belongs in `@webhouse/auth` as a sibling to magic-link.

### Summary — additions and refinements

**New packages added to the matrix:**

| Package | Source | Why |
|---|---|---|
| `@webhouse/peer-channel` | Buddy `packages/channel`, `packages/transport` | cc-to-cc + service-to-service messaging via SSE — nothing else covers it |
| `@webhouse/orchestration` | Buddy `queue`, `pty`, `headless-session.ts` + CMS `agent-runner.ts`, `workflow-runner.ts` | Job runners, agent execution, workflow orchestration |
| `@webhouse/scheduler` | CMS `scheduler*.ts`, `cron.ts`, `tools-scheduler.ts` | Cron + scheduled-tasks with own log/notify subsystem |
| `@webhouse/pipelines` | Trail `packages/pipelines/` (audio/docx/image/pdf/pptx/xlsx) | File-type-specific ingestion → text+metadata |
| `@webhouse/forms` | CMS `forms/` (F30) | Form-builder + submissions inbox + auto-reply |
| `@webhouse/screenshot` | Pitch `lib/screenshot.ts` + whop `lib/screenshot/` | Playwright + sharp wrapper for HTML→PNG |
| `@webhouse/scraping` | Coverletter `lib/scraper/` | Web scraping with anti-bot patterns + per-site adapters |
| `@webhouse/pdf` | Coverletter `lib/pdf/` | Markdown → React → PDF pipeline |
| `@webhouse/mobile` | FysioDK `lib/{capacitor-bridge, app-store-connect, google-play, firebase-admin}` | Capacitor + APNs/FCM + App Store/Play deploy automation |
| `@webhouse/voice` | Buddy `packages/voice` | TTS/STT helpers |
| `@webhouse/cvr` | Contract Manager `lib/cvr-lookup.ts` | Danish business registry — narrow but reusable for DK customers |

**Refinements to existing packages (from initial 13):**

- **`@webhouse/auth`** — must support 4 methods: magic-link, password (bcrypt), passkey/WebAuthn, API-key. Add cron-auth (signed-secret + IP allowlist) for scheduled-task callers. Add signed time-limited action-tokens (the contract-tokens pattern). Document Auth.js interop for sites preferring that ecosystem.
- **`@webhouse/db`** — mirror Trail's `packages/db/` adapter pattern (interface.ts + concrete adapter + migration runner + FTS). Drivers: SQLite (better-sqlite3), Postgres (postgres-js), libSQL/Turso, Supabase (RLS-aware service+anon split), in-memory. API accepts EITHER single-db OR multiple-db config (Sanne's pattern).
- **`@webhouse/mail`** — ship sanne's 8 templates as canonical starter set. Add unsubscribe-token flow.
- **`@webhouse/notifications`** — channels: Discord, Slack, Web Push (VAPID), FCM (mobile push), APNs, browser notification. Add notify-gate (rate-limit + quiet-hours).
- **`@webhouse/files`** — env-var storage-path pattern (Pitch). Adapter pattern: Cloudflare R2, Tigris, S3-compatible, local-dev.
- **`@webhouse/ai`** — extend with vision (image analysis), transcription (audio→text), translation. Add cost-tracking + per-user credits (Trail). Add brand-voice tone-locking (CMS).
- **`@webhouse/webhooks`** — already covers retry-chain. Add Discord ↔ cc bidirectional bridge pattern (Buddy).
- **`@webhouse/cms-content`** — extracts content-fetch from cms-admin. Includes Beam pattern for cms-admin → cms-admin transfer. ICD receiver helper.

**Total package count:** 13 → **24 packages**. Cost in plan-doc estimat: revised below in "Effort" section.

**Architectural insight:** ~80% of the SDK code already exists across these 8 repos. F149 is primarily an **extraction + standardization** project, not a greenfield write. Each package's first commit will largely be "copy from canonical-source repo, generalize, add tests." This shrinks per-package risk but adds coordination overhead across repos.

## Phases

### Phase 1 — Inventory + scaffolding-site skeleton (2d)

- Confirm the 13 packages match what's actually duplicated (this plan-doc's scan is the starting point; refine per-package)
- Spin up `packages/scaffolding-site/` with empty Next.js + each package as a placeholder import
- Establish package skeleton: tsup + vitest + tsconfig template + CHANGELOG.md template
- CI: add publish.yml entries for each new package

### Phase 2 — `@webhouse/db` + `@webhouse/auth` + `@webhouse/users` (5d)

These three are foundational; everything else depends on them.

- `@webhouse/db`: drivers (sqlite, postgres, in-memory), migration runner, factory
- `@webhouse/auth`: magic-link flow, JWT sign/verify (port from sanne's `jwt.ts`), session middleware for Next.js + Hono
- `@webhouse/users`: RBAC roles + permissions schema, CRUD helpers, user-store adapter
- Scaffolding site demonstrates: signup → magic-link email → verify → /me page showing role
- Tests: 30+ unit tests across the 3 packages

### Phase 3 — `@webhouse/mail` + `@webhouse/notifications` (3d)

- `@webhouse/mail`: Resend wrapper, React-component template support, dry-run mode, kill-switch env var (matches sanne's `MAIL_DISABLED=1` pattern)
- `@webhouse/notifications`: Discord/Slack/Web Push/Mobile push channels, severity levels, rate-limit per channel
- Scaffolding site: contact form sends email, admin dashboard shows last 10 notifications fired
- Tests: 20+ unit tests

### Phase 4 — `@webhouse/entity-store` + `@webhouse/webhooks` (4d)

- `@webhouse/entity-store`: generic table schema, CRUD with site_id + collection scoping, audit log, JSONB queries (Postgres) / JSON1 queries (SQLite)
- `@webhouse/webhooks`: HMAC dispatcher (port F145 ICD retry-chain), receiver helper (signature-verify, replay-guard via timestamp + nonce)
- Scaffolding site: bookings demo using entity-store, inbound webhook receiver page that logs deliveries
- Tests: 30+ unit tests

### Phase 5 — `@webhouse/stripe` + `@webhouse/files` (4d)

- `@webhouse/stripe`: checkout session creator with `application_fee_amount` (master account routing), webhook receiver, refund helper, integration with `@webhouse/entity-store` for order persistence
- `@webhouse/files`: multi-provider (Cloudflare R2, Tigris, S3, local-dev), upload signing, presigned URLs, CDN URL helpers
- Scaffolding site: shop demo with 3 products, checkout → success page, file upload demo
- Tests: 20+ unit tests + Stripe test-mode integration tests

### Phase 6 — `@webhouse/cms-content` + `@webhouse/trail-connect` + `@webhouse/chat` (4d)

- `@webhouse/cms-content`: extract content-fetch from cms-admin into reusable client, ICD receiver helper, type-generators from cms.config.ts
- `@webhouse/trail-connect`: thin wrapper on `@trailmem/sdk`, memory + KB search + MCP tool re-export
- `@webhouse/chat`: streaming chat UI components, Eir-pattern reference, pluggable backend
- Scaffolding site: docs section reads from cms, chat assistant powered by trail
- Tests: 20+ unit tests

### Phase 7 — `@webhouse/logs` + `@webhouse/mcp` + `@webhouse/ai` (4d)

- `@webhouse/logs`: structured logger (pino), SSH collector port (from whop), file/HTTP collectors
- `@webhouse/mcp`: MCP server + client helpers, JWT-authed tool execution, permission gating via `@webhouse/users`
- `@webhouse/ai`: re-namespace `@webhouse/cms-ai` → `@webhouse/ai`, alias preserved for backwards-compat
- Scaffolding site: log viewer page, MCP tool playground, AI chat with provider fallback demo
- Tests: 20+ unit tests

### Phase 8 — Scaffolding site polish + reference deployment (3d)

- All 13 packages wired into scaffolding site with realistic test data
- Live deploy to `sdk-demo.webhouse.app` (Fly multi-region, arn primary)
- Comprehensive CLAUDE.md in scaffolding-site with copy/paste guidance
- AI Builder Guide module 23 (`docs/ai-guide/23-web-app-sdk.md`) cross-references the scaffolding site
- F147 scaffolder updated to use SDK packages by default

### Phase 9 — Migration runbooks + customer adoption (per-site cost, deferred)

- Runbook per existing customer-webapp (sanneandersen, whop, contract-manager, cronjobs, dns-gui, cdn-platform, fysiodk-aalborg-sport)
- Each runbook lists: packages to adopt, schema migration steps, drop-old-code checklist, smoke-test plan
- Christian decides which webapps migrate when; SDK adoption is opt-in per site
- Estimated 1-2d per webapp for clean migration

## Acceptance criteria

1. **A new cc-session given "build a customer webapp called X" copies the scaffolding site, swaps brand+content, and ships a working authenticated app in <1 day.** No custom auth code, no custom mail templates, no custom Stripe wiring — just `npm install @webhouse/* && fork scaffolding-site`.
2. **All 13 packages publish to npm** at version parity with `@webhouse/cms`. Each has CHANGELOG, README, and unit-test coverage >70%.
3. **Scaffolding site deployed at `sdk-demo.webhouse.app`** demonstrating every capability with realistic test data.
4. **Sanneandersen migrated to SDK** (Phase 9 first runbook). Her local SQLite + auth code replaced with `@webhouse/auth` + `@webhouse/users` + `@webhouse/db`. The user-drift problem from 2026-05-06 ICD audit is structurally impossible (single source-of-truth: the SDK's `auth_users` table she shares with cms-admin via `@webhouse/cms-content` mirror).
5. **AI Builder Guide module 23 published** and linked from `packages/cms/CLAUDE.md`. Cc-sessions encounter the SDK day 1 of any customer-webapp work.
6. **F147 scaffolder generates SDK-using webapps** by default. Direct-connect (the F147 P2 contract) becomes the fallback for special cases.
7. **Zero shared runtime introduced.** No `app.broberg.ai` server. No central database. Every customer-webapp owns its own runtime + DB choice.

## Risici + afbødning

| Risiko | Sandsynlighed | Afbødning |
|---|---|---|
| Version drift across customer-webapps (one site on v1.2, another on v1.5) | Høj | Renovate auto-PR for minor/patch; clear major-bump migration notes; SDK compat matrix doc; semantic-release |
| SDK package becomes too opinionated, customers fork | Mellem | Each package's API documented as "stable" vs "internal"; opinionated defaults but escape-hatches via DI; major bumps for breaking changes |
| Bugfix in SDK requires N customer-webapp redeploys to propagate | Acceptabelt | This IS the cost of library-not-service. Documented in F149's "Why F149 not F148" section. Per-customer pain is < central-runtime-down pain. |
| `@webhouse/db` adapter pattern leaks driver-specific quirks | Mellem | Adapter tests run against ALL drivers (sqlite, postgres, in-memory); CI fails if test passes on one but not others |
| Scaffolding site rots out of sync with packages | Mellem | Scaffolding site IS the integration test — when a package changes, scaffolding site CI fails; mandatory update gate before publish |
| Customer-webapp picks an exotic DB (e.g., MongoDB) we don't support | Lav | Adapter pattern allows custom drivers; document that SQLite + Postgres are first-class, others are user-maintained |
| Migration of existing webapps blocks F149 progress | Acceptabelt | Phase 9 is per-site, deferred. F149 ships SDK + scaffolding regardless of migration timing. Customer adoption is opt-in. |
| Auth schema differences between sites (sanne uses `role`, whop uses `tier`) | Mellem | `@webhouse/users` ships canonical RBAC schema; existing webapps adopt by mapping their custom field → `role` during migration |
| Stripe Connect master-account requires per-customer onboarding | Existing | Documented in F147 — Stripe Connect business arrangement separate from code. SDK just enforces the routing pattern. |

## Why now

1. **5+ live customer-webapps** all duplicate the same auth + db + mail patterns with subtle drift. Cost compounds linearly per new webapp.
2. **F148 was rejected** — F149 is the alternative that solves the same duplication problem without introducing a single-point-of-failure.
3. **Sanne's user-drift bug** (2026-05-06 audit) is the concrete symptom. SDK adoption permanently prevents the class of bugs.
4. **Trail's docs site** (shipped 2026-05-08) and 3+ planned customer-webapps (fdaalborg.dk, house-of-wellness.dk, app.trailmem.com) all benefit immediately from Phase 8's scaffolding site.
5. **F147's contract surface stabilizes** the interfaces the SDK implements. F149 is "the default implementation behind F147's contract."

## Why we didn't ship it earlier

The duplication was tolerable while broberg.ai had 1-2 customer-webapps and Christian could re-implement patterns himself. With 5+ live webapps and 3+ in pipeline, plus the concrete sanneandersen audit, the marginal cost of NOT having an SDK is now visible per-customer and growing.

## Related

- **F147** — Webapp Blueprint Contract (defines the interface; F149 is the canonical implementation behind it)
- **F148** — Web Application Server (REJECTED 2026-05-09 due to blast radius; F149 is the library-not-service alternative)
- **F59** — Passwordless Auth (cms-admin-only today; `@webhouse/auth` ports + generalizes the WebAuthn code)
- **F134** — Access Tokens (the existing service-to-service pattern; informs `@webhouse/auth`'s service-mode tokens)
- **F136** — Webshop Module (will use `@webhouse/stripe` once both shipped; today's `cms-shop` has direct Stripe — gets refactored)
- **F139** — Headless Site API (the existing content-API surface; `@webhouse/cms-content` is the typed client)
- **F141** — Site switch context leak (precedent for per-site scoping; SDK packages all accept site_id explicitly)
- **F145** — ICD (`@webhouse/webhooks` ports the retry-chain + alert pattern)
- **`@trailmem/sdk`** (existing) — wrapped by `@webhouse/trail-connect`
- **`@webhouse/cms-ai`** (existing) — re-namespaced as `@webhouse/ai`
- **2026-05-06 ICD audit** — surfaced sanneandersen's user-drift, motivating both F148 (rejected) and F149
- **2026-05-09 strategic discussion** — Christian rejected F148 + greenlit F149's library-not-service pivot

## Effort

**XL** — ~35–45 fokuserede dage MVP (P1–P8) + per-site migration deferred (P9)

| Phase | Estimat |
|---|---|
| P1 Inventory + scaffolding skeleton | 2d |
| P2 db + auth + users (foundational) | 5d |
| P3 mail + notifications | 3d |
| P4 entity-store + webhooks | 4d |
| P5 stripe + files | 4d |
| P6 cms-content + trail-connect + chat | 4d |
| P7 logs + mcp + ai | 4d |
| P8 Scaffolding site polish + reference deployment | 3d |
| P9 Customer-webapp migrations | per-site (1-2d each, deferred) |

**Total MVP (P1-P8): ~29 fokuserede dage** for the original 13 packages. Padded estimate (35-45d) accounts for cross-package integration overhead.

**Revised after 2026-05-09 deep-scan (11 additional packages):**

| Additional packages | Estimated effort |
|---|---|
| `@webhouse/peer-channel` (port from Buddy) | 1.5d |
| `@webhouse/orchestration` (job/agent/workflow runner) | 3d |
| `@webhouse/scheduler` (port CMS scheduler subsystem) | 2d |
| `@webhouse/pipelines` (port Trail's 6 file-type pipelines) | 4d |
| `@webhouse/forms` (port F30 forms engine) | 2d |
| `@webhouse/screenshot` (Playwright + sharp wrapper) | 1d |
| `@webhouse/scraping` (port Coverletter scrapers) | 1.5d |
| `@webhouse/pdf` (port Coverletter pdf generator) | 1.5d |
| `@webhouse/mobile` (FysioDK Capacitor + APNs/FCM helpers) | 3d |
| `@webhouse/voice` (Buddy voice package) | 1.5d |
| `@webhouse/cvr` (Contract Manager) | 0.5d |
| **Sub-total** | **~21d** |

**Updated total MVP: ~50 fokuserede dage** for 24 packages + scaffolding. Padded to 55-75 days for integration overhead, rework, and the inevitable scope-discovery during extraction.

Cost per published package: ~$0 (npm + GitHub Actions OIDC trusted publishing already wired). Cost to maintain: SDK bumps couple to existing cms release cadence (no new ops). With 24 packages, version bumps cost more in changelog-writing time but the publish pipeline scales automatically.

**Most importantly:** ~80% of the code already exists in canonical-source repos. F149 is primarily an extraction + standardization project, not greenfield. Each new package's first commit is "copy from canonical-source, generalize, test" — bounded risk per package, parallelizable across phases.
