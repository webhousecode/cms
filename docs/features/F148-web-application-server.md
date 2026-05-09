# F148 — Web Application Server (broberg-app)

> A small, multi-tenant Bun-Hono service at `app.broberg.ai` that hosts the cross-cutting concerns every customer-webapp needs but CMS isn't built for: real two-way Postgres for transactional state, auth + sessions with passkeys, Stripe Connect routing with platform-fee enforcement. Implements F147's webapp blueprint contract from the server side. Static content stays in CMS; chat memory stays in trail; this fills the gap in between.

**Status:** **REBORN as F149-consumer (2026-05-10)** — original from-scratch design rejected on blast-radius grounds; new design is a thin Hono service composing F149 packages' server-routes. See `docs/features/F149-web-app-sdk.md` § "F148 reborn — App Server as F149-consumer" for the actual design.
**Owner:** cms-core
**Priority:** Tier 1 (delivered as P10 of F149)
**Estimat:** 3 fokuserede dage (P10 of F149 — composing existing package routes + deploy)
**Created:** 2026-05-09 (this plan-doc reflects the original rejected design; kept as historical context)
**Superseded by:** F149 P10 (2026-05-10)

> ## ⚠ This plan-doc is historical
>
> The original F148 design (reflected below) was rejected 2026-05-09 because a multi-tenant `app.broberg.ai` service would have been a single point of failure for every customer-webapp.
>
> The 2026-05-10 architectural insight reframes F148 as a **deploy of F149 packages**, not a from-scratch build:
>
> - F149 ships every capability (auth, entity-store, mail, etc.) as standalone npm packages
> - Each package exports BOTH a direct in-process implementation AND a server-routes definition
> - F148 is a thin Hono service (~200 lines) that mounts those server-routes from each package
> - Customer-webapps choose: import packages directly (Mode A, no F148 dependency) OR HTTP-call F148 (Mode B, managed infra)
> - SPOF concern is gone: Mode A always works as fallback if F148 is down
>
> **For the actual current design, read F149 plan-doc § "F148 reborn — App Server as F149-consumer".**
>
> The detailed design below is preserved for context — it documents what cms-core proposed in the 2026-05-08 strategic discussion, why Christian rejected it, and what specifically informed the F149-consumer architecture that replaced it.

---


> **Note on plan-doc origin:** This plan-doc reflects cms-core's assessment from the 2026-05-08 discussion. Christian asked for cms-core's thoughts first ("lad os tage dine først") and the plan-doc was written before he gave his own. He should review and amend — sections marked **[awaits-Christian]** are explicit decisions still open.

## Problem

Customer-webapps in the broberg.ai ecosystem (sanneandersen.dk, fdsport.net, fdaalborg.dk, app.trailmem.com, future house-of-wellness.dk) all need a class of state that **CMS is not designed for**:

- Bookings (high-write, conflict-resolution, calendar logic with overlapping reservations)
- Order ledgers (transactional, audit-required, cannot lose a row)
- Course-progression / enrollment-state (per-user mutable graphs)
- Session state for chat assistants (writes-per-second, ephemeral)
- Real-time webhook log + retry state

CMS's filesystem-JSON model is great for editorial content (low-write, schema-flexible) and inadequate for transactional state (race-prone, no transactions, no referential integrity, no efficient secondary-index queries). The 2026-05-06 ICD-audit on sanneandersen surfaced the consequence: she rolled her own SQLite `auth_users` table and a sync-to-CMS function that silently fails (writes to `/app/content/` instead of `/data/content/`, never reaches cms-admin's volume). The CMS users-collection drifts from auth_users by months — Christian shows as `client` in CMS but `admin` in auth db; Sanne is invisible in CMS entirely.

This is the symptom of an architecture missing a tier. The fix is not "make CMS handle transactional state" — that fights what CMS is good at — but "add a thin transactional-state layer that lives next to CMS, owned by the same broberg.ai stack, exposed to customer-webapps via a single contract endpoint."

F147 defines the contract. F148 is the implementation behind the contract for the parts that CMS can't fill.

## Why a single Web App Server, not per-customer backends

[awaits-Christian — verified my position vs his preference]

cms-core's position: **one multi-tenant Bun-Hono service** at `app.broberg.ai`, not per-customer gateways. Per-customer is ops-mareridt (each customer = own deploy, monitoring, secrets, scaling decision). Multi-tenant with row-level security keyed on `site_id` is the pattern Supabase, Neon, PlanetScale, and every modern BaaS converged on for good reason.

Trade-offs of multi-tenant:

| Aspect | Multi-tenant single | Per-customer instances |
|---|---|---|
| Ops surface | 1 service to monitor | N services (linear cost) |
| Resource pooling | Shared Postgres connections, shared cache | Wasted idle capacity per instance |
| Blast radius | Bug affects all customers | Bug isolated to one |
| Customer-specific scaling | Vertical only (until sharded) | Per-customer scaling |
| Migration cost | Once | Per customer |
| Cost per added customer | ~$0 (sub-linear) | Linear (~$15/mo new Fly app) |
| GDPR isolation | Row-level + audit | Physical isolation |

The blast-radius concern is real but mitigated by: (1) row-level security audited via integration tests, (2) per-customer rate limits + circuit breakers, (3) read replica for reporting so production-read queries don't compete with writes. The GDPR concern is mitigated by per-site Postgres schemas (NOT separate databases) — easy to dump or delete a single customer's data via standard SQL.

## Solution

A new service `broberg-app` (`app.broberg.ai`) implementing the F147 contract for the capabilities CMS can't fill. Specifically:

1. **Auth + sessions** (replaces F59 admin-only with public service). Magic-link, passkeys (port of F59 WebAuthn code), session JWTs, role lookup from per-site `users` table.
2. **Generic entity-store** (single table `entities(site_id, collection, id, json, created_at, updated_at, audit)`) for transactional state. Schema-flexible like CMS but with row-level security, transactions, real concurrency control. Sites declare which entity-collections they use; broberg-app enforces site_id scoping.
3. **Stripe Connect router**. Customer-webapp posts a "checkout intent" to broberg-app; broberg-app calls Stripe with correct `application_fee_amount` (platform fee → master account) + `transfer_data.destination` (customer's connected account). Webapp never holds Stripe API keys; only broberg-app does.
4. **Webhooks-out** to CMS for user-mirror (`user.created`, `user.role-changed`). cms-admin's `users` collection becomes an editorial mirror of broberg-app's `auth_users`. Solves sanneandersen's user-drift permanently.
5. **MCP-compatible**: re-exports trail's MCP tools so customer-webapps can call them via broberg-app's auth context. Single endpoint for cc-sessions integrating against the stack.

What broberg-app deliberately does **NOT** do:

- File serving (Tigris handles blob storage, served direct)
- Realtime subscriptions (use SSE direct from webapp, no need to proxy)
- GraphQL (REST is enough; RPC over POST for streaming chat)
- Edge functions / serverless code-execution (lives in webapp)
- Email / SMS (use Resend / Twilio direct from webapp; broberg-app only routes auth magic-links)
- Become Supabase (scope discipline — only the broberg.ai-shared concerns)

## Architecture

### Stack

- **Bun + Hono** — fast cold-start (matches the lightweight strand in Christian's stack-philosophy)
- **Postgres on Neon** in `arn` (Stockholm) — managed, serverless, branching, point-in-time recovery [awaits-Christian — Neon vs Supabase decision]
- **Drizzle ORM** for type-safe schema + migrations
- **TypeScript** end-to-end
- **Fly Machines** for the Bun-Hono service (multi-region, primary `arn`, failover `fra`)
- **Tigris** for blob storage (already in stack-philosophy, S3-compatible)
- **`@simplewebauthn/server`** for passkey support (port from cms-admin's F59)
- **MCP SDK** for tool-export

### Data model (Postgres schema)

```sql
-- Per-site scoping is row-level on EVERY table.
-- Site_ids match the cms-admin registry (e.g. "trail", "sanneandersen").

CREATE TABLE auth_users (
  id            UUID PRIMARY KEY,
  site_id       TEXT NOT NULL,
  email         TEXT NOT NULL,
  name          TEXT,
  phone         TEXT,
  role          TEXT NOT NULL DEFAULT 'client',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  UNIQUE (site_id, email)
);

CREATE TABLE auth_sessions (
  token_hash    TEXT PRIMARY KEY,         -- SHA-256(jwt) for revocation lookup
  user_id       UUID NOT NULL REFERENCES auth_users(id),
  site_id       TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent    TEXT
);

CREATE TABLE auth_passkeys (
  credential_id TEXT PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth_users(id),
  site_id       TEXT NOT NULL,
  public_key    BYTEA NOT NULL,
  counter       BIGINT NOT NULL DEFAULT 0,
  device_label  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ
);

-- Generic entity-store. JSON-blob schema-flexible.
-- collection + json shape declared per-site at app boot.
CREATE TABLE entities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     TEXT NOT NULL,
  collection  TEXT NOT NULL,                -- e.g. "bookings", "orders"
  slug        TEXT,                          -- nullable, for URL-addressable rows
  data        JSONB NOT NULL,
  created_by  UUID REFERENCES auth_users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ,                   -- soft-delete
  UNIQUE (site_id, collection, slug)         -- if slug is set
);

CREATE INDEX entities_site_collection ON entities (site_id, collection) WHERE deleted_at IS NULL;
CREATE INDEX entities_data_gin ON entities USING GIN (data jsonb_path_ops);  -- for filtering on JSON keys

CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  site_id     TEXT NOT NULL,
  actor       UUID REFERENCES auth_users(id),
  action      TEXT NOT NULL,                -- e.g. "user.signup", "entity.create:bookings"
  resource    TEXT,                          -- entity.id or "auth_users.<id>"
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Row-level security policies enforce site_id scoping based on JWT claims. Service-to-service tokens (cms-admin → broberg-app for user-mirror) bypass RLS via a service-role JWT.

### API surface (REST)

```
# Auth
POST   /v1/auth/magic-link         { email, siteSlug }
POST   /v1/auth/verify             { token }                           → { sessionJWT, user }
GET    /v1/auth/me                 (Authorization: Bearer)             → { user, role }
POST   /v1/auth/sign-out           (Authorization: Bearer)
POST   /v1/auth/passkey/begin      { email, siteSlug }                 → WebAuthn challenge
POST   /v1/auth/passkey/finish     { credential }                      → { sessionJWT, user }

# Entities (transactional state)
GET    /v1/entities/{collection}                                       → list (paginated)
POST   /v1/entities/{collection}                                       → create
GET    /v1/entities/{collection}/{id}
PATCH  /v1/entities/{collection}/{id}                                  → partial update
DELETE /v1/entities/{collection}/{id}                                  → soft-delete

# Stripe Connect router
POST   /v1/stripe/checkout         { lineItems, customerEmail, successUrl }
                                                                        → { stripeUrl }
POST   /v1/stripe/webhook          (Stripe signature)                  → updates entities

# MCP re-export (proxies trail's MCP tools)
POST   /v1/mcp/{tool}              (Authorization: Bearer)             → tool result

# Service-to-service (auth via service-role JWT)
POST   /v1/_internal/mirror-user   (cms-admin → broberg-app, when CMS user is edited)
```

All endpoints scoped by JWT's `site_id` claim. Service-role tokens can pass `?site=<id>` override (mirror cms-admin's pattern).

### Webhooks-out (broberg-app → cms-admin)

When `auth_users` changes (signup, role update, delete), broberg-app POSTs to cms-admin's `/api/cms-sync/user?site=<id>` with HMAC signature (shared secret per-site). cms-admin's existing /api/cms infrastructure already handles content writes — this is one new endpoint that takes the user-payload and writes to the per-site users-collection.

This solves sanneandersen's drift problem at the architecture level: broberg-app is the source-of-truth for auth_users; CMS users-collection is an editorial mirror that always reflects truth within seconds of any change.

### Failure modes + degradation

| Failure | Impact | Mitigation |
|---|---|---|
| broberg-app down | All customer-webapps degrade (no auth, no transactional reads) | Multi-region Fly (arn primary, fra failover); customer webapps cache content from CMS for stale-but-functioning |
| Postgres down | Same as above | Neon HA + read replicas; webapps with cached sessions stay logged in |
| cms-admin down | Auth still works (broberg-app independent); content reads degrade | Webapps cache content; CMS users-mirror lags but auth ground-truth lives in broberg-app |
| webhook to cms-admin fails (user-mirror) | CMS users-collection drifts | Same retry-chain as F147's ICD direction (1s/4s/16s + Discord alert) |
| Customer's Stripe Connect account suspended | Their payments fail | Per-customer circuit breaker; admin alert |
| Single customer noisy-neighbor on Postgres | Other customers slow | Per-site rate-limits (req/sec, write/sec); explicit slow-query budget; alert at threshold |

### Cost estimate

| Component | Monthly cost (estimated) |
|---|---|
| Fly Bun-Hono service (shared-cpu-2x, multi-region) | ~$15 |
| Neon Postgres (1 GB compute + 0.5 vCPU) | ~$20 (free tier covers MVP) |
| Tigris (object storage + bandwidth) | ~$5 |
| **Total at MVP** | **~$40/month** |

Per-additional-customer marginal cost: ~$0 (sub-linear) until the service hits scaling thresholds (likely >50 customer-webapps).

## Phases

### Phase 1 — Skeleton + auth (3d)

- New repo `broberg-app` (or monorepo package `packages/broberg-app/`) [awaits-Christian — repo decision]
- Bun + Hono setup, Drizzle migrations for `auth_users` + `auth_sessions` + `auth_passkeys`
- Port F59 WebAuthn code from cms-admin
- Magic-link endpoint (Resend integration)
- Session JWT issuance with site_id claim + RLS verification
- Deploy to Fly (`broberg-app` in webhouse org, `arn` region)
- Smoke tests: magic-link → verify → /me round-trip for two different site_ids

### Phase 2 — Generic entity-store + RLS (2d)

- `entities` table + RLS policies for site_id scoping
- `/v1/entities/{collection}` CRUD endpoints with pagination + filtering on JSON paths
- Service-role token bypass for cms-admin sync calls
- Integration tests: site-A's session can't read site-B's entities (RLS verification)

### Phase 3 — Stripe Connect router (1d)

- `/v1/stripe/checkout` with `application_fee_amount` + `transfer_data.destination` from per-site Stripe Connect account ID stored in entity-store
- Stripe webhook receiver writes order rows to entities
- Per-customer Stripe Connect account ID stored on a `site_settings` entity; admin sets it via cms-admin

### Phase 4 — Webhooks-out (user-mirror) (1d)

- New endpoint on cms-admin: `/api/cms-sync/user?site=<id>` (HMAC-authed)
- broberg-app fires this on `user.created`, `user.role-changed`, `user.deleted`
- Reuses the F147 retry-chain pattern (1s/4s/16s + Discord alert on failure)
- One-shot reverse migration script: pull existing cms-admin users-collections → import to broberg-app's `auth_users` so live auth state aligns with what cms-admin shows

### Phase 5 — F147 scaffolder integration (0.5d)

- F147's `create-broberg-webapp` scaffolder generates `lib/auth.ts` and `lib/db.ts` pointing at `BROBERG_APP_URL`
- `.env.example` includes `BROBERG_APP_URL=https://app.broberg.ai`
- Falls back to direct CMS connection if `BROBERG_APP_URL` is unset (allows F147-only sites to skip broberg-app)

### Phase 6 — sanneandersen migration (2d)

- First real customer migrated to the contract
- Replace site/src/lib/auth/db.ts SQLite calls with broberg-app HTTP calls
- Migrate auth_users rows from sanneandersen's SQLite to broberg-app's Postgres (one-shot script)
- Verify: Sanne appears in cms-admin users-collection, Christian's role is admin in both broberg-app + cms-admin mirror, new signup flows through broberg-app → mirror → cms-admin within seconds
- This phase ALSO validates that the bake-flow / disaster-recovery isn't blocked by removing local SQLite (no `.seeded`-marker dance for users anymore — broberg-app owns the truth)

### Phase 7 — Observability + ops polish (1.5d)

- Per-site rate-limits (req/sec, write/sec) in Hono middleware
- Audit-log query endpoint for admins (filter by site_id, actor, action)
- Circuit breakers on Stripe + cms-admin webhook (open after N failures, exponential reset)
- Health endpoint `/v1/_health` with Postgres + Neon connection check
- Discord alert webhook on circuit-breaker open + RLS policy violation attempt

### Phase 8 — Migrate other customer-webapps (deferred — per-site cost)

- Each remaining customer-webapp (fdsport, fdaalborg, app.trailmem, future house-of-wellness) gets migrated as time permits
- Same pattern as Phase 6 — replace local auth + transactional state with broberg-app calls
- Estimated 1d per customer-webapp for clean migration; harder if customer has unique state-shapes

## Acceptance criteria

1. **Magic-link login works for two different sites concurrently**: cb@webhouse.dk on site=trail and same email on site=sanneandersen are separate auth_users rows with separate roles, no cross-leak (RLS verified)
2. **Webhook-out to cms-admin propagates user changes within 5 seconds**: signup on broberg-app → cms-admin's users-collection has the row → admin UI shows it on next refresh
3. **sanneandersen runs end-to-end on broberg-app**: her booking system, Eir auth, Stripe checkout all routed through broberg-app; her local SQLite auth_users table is decommissioned
4. **A new cc-session given a customer-webapp brief uses broberg-app via the F147 scaffolder without writing any auth/db code**: the scaffolder's lib/auth.ts + lib/db.ts cover everything, the cc adds business logic in app routes only
5. **Stripe revenue-share routes correctly**: a test purchase on a customer-site results in (a) customer's connected account credited the gross minus fee, (b) Christian's master account credited the fee, (c) audit_log row written
6. **Multi-region failover tested**: kill primary `arn` machine, verify `fra` takes over within 30s, sessions stay valid (JWT-stateless)

## Risici + afbødning

| Risiko | Sandsynlighed | Afbødning |
|---|---|---|
| RLS policy bug leaks one site's data to another | Mellem | Integration tests scripted to attempt cross-site reads on every endpoint; CI fails if any succeed; per-site canary data |
| Postgres becomes write-bottleneck at scale | Lav (early) | Neon scales; partition entities by site_id when needed; read replicas for /v1/entities/list |
| Stripe Connect API changes break payment flow | Lav | Pin Stripe API version; integration tests against Stripe test mode; circuit breaker with admin alert |
| Customer-webapp loses connection to broberg-app, can't auth users | Mellem | Webapps issue long-lived JWTs (24h) with refresh; cached sessions degrade gracefully when broberg-app is briefly down |
| F148 scope creeps into "build Supabase" territory | Mellem | Scope-discipline gate in P1: any feature beyond the 5 capabilities requires explicit Christian approval + new F-number |
| Migrating sanneandersen breaks her live site | Lav-Mellem | Phase 6 runs against staging-clone first; volume snapshot taken before cutover; 5-minute rollback window via DNS-flip |
| Neon downtime takes all customer-webapps offline | Lav | Neon HA SLA; webapps cache JWTs locally; static content from CMS continues serving |

## Why now (and why not earlier)

**Now:** F147 (webapp blueprint contract) is shipped as plan-doc. Without F148, F147 forces customer-webapps to either (a) implement the contract themselves with local auth+db (the sanneandersen anti-pattern, which proved itself unworkable), or (b) shim against cms-admin which isn't designed for transactional state. F148 is the natural completion of F147 — the server-side implementation of the contract surface that F147 defines.

**Why not earlier:** The need for "real two-way DB" was invisible while broberg.ai had only one customer-webapp (sanneandersen) and the auth-drift was easy to overlook. With trail-landing, fdsport, app.trailmem, fdaalborg, house-of-wellness all on the horizon and the 2026-05-06 ICD-audit surfacing concrete drift on sanneandersen, the gap is now load-bearing.

## Why F148 must come AFTER F147

F147's contract defines the interfaces. F148 is one implementation of those interfaces (the gateway pattern). If F148 were built first, customer-webapps would hardcode `app.broberg.ai/v1/...` URLs and the implementation-agnostic abstraction F147 enables would be lost. F148 must respect F147's env-var-addressed contract — webapps see `BROBERG_AUTH_URL`, not `app.broberg.ai`.

This means: ship F147 P1-P4 (contract + scaffolder + reference impl) before starting F148. Then F148 fills in the contract's implementation. Then customer-webapps that started on F147's direct-connect implementation can flip env-vars to point at broberg-app without any source changes.

## Open decisions [awaits-Christian]

1. **Repo structure**: new `broberg-app` repo vs monorepo package in `cms` (or `webhouse-stack`)?
2. **Postgres provider**: Neon vs Supabase vs self-hosted Fly Postgres? (cms-core leans Neon for serverless + branching; Supabase for built-in auth-mirror but adds vendor lock-in)
3. **Auth model overlap with F59**: copy F59 code into broberg-app or extract to shared `@webhouse/passkey` package? (Latter is cleaner; former is faster to MVP)
4. **Service authentication**: per-customer-site service tokens (one for each customer's webapp) or single broberg-app issued JWTs? (Trade-off: revocability vs operational simplicity)
5. **Migration timing for sanneandersen**: P6 (within F148 MVP) or separate F-number? (cms-core leans P6 because the migration validates the design; Christian may prefer to keep MVP lean)

## Related

- **F147** — Webapp Blueprint Contract (the interface F148 implements). F148 must come after F147.
- **F59** — Passwordless Auth (admin-only today; F148 ports the passkey code to public service)
- **F134** — Access Tokens (the existing service-to-service auth pattern; F148's service-role JWTs evolve from this)
- **F136** — Webshop Module (will route Stripe through F148 once both shipped; today's F136 has direct Stripe — gets refactored)
- **F141** — Site Switch Context Leak (precedent for per-site scoping pattern)
- **F145** — ICD (the live-content propagation; F148's user-mirror webhook reuses ICD's HMAC + retry pattern)
- **2026-05-06 ICD audit** — surfaced sanneandersen's user-drift, which is the concrete problem F148 solves at the architecture level
- **2026-05-08 strategic discussion** — Christian + cms-core agreed F148 is needed but priority + sequencing still open

## Effort

**L** — ~11 fokuserede dage MVP

| Phase | Estimat |
|---|---|
| P1 Skeleton + auth | 3d |
| P2 Generic entity-store + RLS | 2d |
| P3 Stripe Connect router | 1d |
| P4 Webhooks-out (user-mirror) | 1d |
| P5 F147 scaffolder integration | 0.5d |
| P6 sanneandersen migration | 2d |
| P7 Observability + ops polish | 1.5d |
| P8 Other customer-webapp migrations | per-site cost (deferred) |
