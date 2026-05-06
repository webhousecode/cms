# F147 — Webapp Blueprint Contract

> Make the broberg.ai service stack (cms, trail, stripe-connect, MCP) the default backend for every new customer webapp — enforced from commit 1 via a contract-doc, a scaffolder, and an AI Builder Guide module. Stop cc-sessions from rolling their own auth, hardcoding content, or duplicating chat memory.

**Status:** planned
**Owner:** cms-core
**Priority:** Tier 1 (foundational — every future customer webapp depends on it)
**Estimat:** ~7 fokuserede dage (P1-P6, P5 deferred separately)
**Created:** 2026-05-06

## Problem

The broberg.ai stack already exposes most of what a customer webapp needs:

- **CMS** — content collections, schemas, REST API, ICD, MCP tools, F136 webshop, F134 access tokens
- **Trail** — chat memory, knowledge base, MCP integration, peer intercom
- **Stripe Connect (master account)** — Christian's master Stripe account that customer accounts connect to via Stripe Connect, routing the contractual revenue share via `application_fee_amount`. This is a business arrangement, not a separate code service.
- **MCP servers** — `cms-mcp-server`, `trail` MCP, `dns-manager`, others — programmatic access surfaces

But the **default behavior of a fresh cc-session given a customer-webapp brief is to roll its own everything**. Concretely seen on sanneandersen.dk:

- Local SQLite `auth_users` table — duplicates what F59 (passkeys + TOTP) does
- Local `content/` filesystem with seed-from-baked-content — duplicates CMS content storage
- Custom `syncUserToCms()` function with a `process.cwd()` path bug that writes to `/app/content/users/` (in-image, lost on deploy) instead of `/data/content/users/` — and even if path were correct, it never reaches cms-admin's volume, so the CMS never sees Sanne or new signups
- `Eir` chat assistant (correctly wired to trail — one of the few things reused)
- Stripe Connect ported correctly (good)

The cms-admin's `users` collection on sanneandersen drifts from auth_users by months: cb@webhouse.dk shows `role: client` in CMS but is `role: admin` in live's auth db. Sanne is invisible in CMS. New signups never appear in CMS. A whole category of bugs that the architecture should have made impossible.

### Three concrete root causes

1. **The AI Builder Guide** (`packages/cms/CLAUDE.md`) is 100% focused on **content** — "build a site that READS from CMS." It never says "for auth, hit this endpoint" or "for chat memory, route to trail." So cc-sessions read it, see content patterns, and build the rest from scratch.

2. **F59 (passwordless auth) is admin-only.** It powers cms-admin's own login but is not exposed as a public service for customer sites to consume. There is no `/api/auth/login` that a webapp can POST to.

3. **No scaffolder exists.** `npm create @webhouse/cms` produces an empty content-site, not a webapp skeleton wired to the broberg.ai stack. Day 1, there is no opinionated starting point that funnels cc-sessions into reusing instead of reinventing.

## Solution

A three-layer **contract** that every future customer webapp follows, enforced from commit 1:

1. **Contract spec** (`docs/architecture/broberg-webapp-contract.md`) — defines the 5 capabilities a webapp consumes, as implementation-agnostic interfaces (auth, content, chat, payments, storage). Webapp source code references env-var URLs (`BROBERG_AUTH_URL`, `BROBERG_CMS_URL`, etc.), not hardcoded service hostnames. **This decouples the contract from the implementation** so a future "Web Application Server" (gateway-style consolidation, see `Related → F148-pending-discussion`) can replace the implementations without touching webapp code.

2. **Service exposure** — close the gaps that prevented cc-sessions from reusing in the first place. Mostly: expose F59 via a public `/api/auth/*` namespace so sites can magic-link-login users against the cms-admin's per-site `users` collection (the collection becomes authoritative auth-user store; webhook fires on user.created / role.changed so consuming webapps can react).

3. **`create-broberg-webapp` scaffolder + AI Builder Guide module** — turn the contract into something a fresh cc-session encounters before writing any code. The scaffolder generates a Next.js (or Bun-Hono) skeleton with: pre-wired auth client, content fetcher, Eir chat embed, Stripe Connect with platform fee, a strict `cms.config.ts`, and a `CLAUDE.md` that **forbids** rolling local auth or hardcoding content. The Builder Guide gets a new module documenting the contract that's mandatory reading for any customer-webapp work.

After this lands, the next cc-session given a customer-webapp brief reads the scaffolded `CLAUDE.md`, sees explicit "DO NOT roll local auth — use BROBERG_AUTH_URL" rules, and integrates instead of reinvents. The architecture makes the right thing easy and the wrong thing visible.

## Scope

### IN-scope

1. **Capability contract** for the 5 surfaces every customer webapp uses:
   - **Auth**: magic-link login, passkey login (F59), session check, sign-out, role lookup
   - **Content**: read CMS docs (anonymous + token-scoped), webhook on content events
   - **Chat**: Eir-pattern using trail's MCP for memory + KB, optional per-site knowledge base
   - **Payments**: Stripe Connect platform-fee setup, webhook routing
   - **Storage**: media uploads via cms-admin's `/api/media`, document storage as collections
2. **Public auth API on cms-admin** (close the F59 gap) so sites can authenticate users against per-site `users` collection
3. **`create-broberg-webapp` scaffolder** with Next.js + Bun-Hono variants
4. **AI Builder Guide module 22** (`docs/ai-guide/22-webapp-blueprint.md`)
5. **Reference implementation** — small real customer-app (`house-of-wellness.dk` candidate) end-to-end on the new contract
6. **Per-customer documentation** that gets injected into every scaffolded site's `CLAUDE.md`

### OUT-of-scope

- **Migrating sanne-andersen** to the new contract. Per Christian's note (2026-05-06), sanne keeps its current local-auth + local-content arch. A migration runbook is appendix-only, not executed.
- **Building a "Web Application Server" gateway** (F148-pending-discussion). F147 deliberately leaves this as an implementation choice behind the contract. If F148 lands, env-vars in scaffolded apps re-point; webapp code unchanged.
- **Replacing existing customer-app builds** that don't follow the contract (trail-landing, sanneandersen-site, fdsport.net). F147 is forward-looking only.
- **Stripe master-account onboarding** — that's a business setup, not code. F147 documents the contract; you handle the Stripe Connect partner-account application separately.

### Non-goals

- Becoming a general-purpose BaaS like Supabase or Firebase. F147 is opinionated for broberg.ai customer-webapps, not a public product.
- Forcing webapps to use cms-admin as their primary database. CMS stays optimized for editorial content; if a webapp needs transactional write-heavy data (orders, ledger), it can still use its own DB. The contract just standardizes the shared concerns (auth, content, chat, payments).

## Architecture

### The 5 capabilities — interface sketches

Each capability is an env-var-addressed endpoint. Implementation lives in cms-admin (or future F148 gateway). Webapp code never hardcodes hostnames.

#### Auth (`BROBERG_AUTH_URL`)

```
POST   /api/auth/magic-link    { email, siteSlug }    → { ok, expiresAt }   # sends magic-link email
POST   /api/auth/verify        { token }              → { sessionToken, user }
GET    /api/auth/me            (Authorization: Bearer)→ { user, role, permissions }
POST   /api/auth/sign-out      { sessionToken }       → { ok }
POST   /api/auth/passkey/begin { email }              → WebAuthn challenge   # F59 reuse
POST   /api/auth/passkey/finish { credential }        → { sessionToken, user }
```

User identity comes from cms-admin's per-site `users` collection. Roles are the collection's `role` field. Webhook (F35 lifecycle) fires `user.created` / `user.role-changed` so webapps can warm caches.

#### Content (`BROBERG_CMS_URL`)

```
GET  /api/cms/{collection}?site={slug}             → list docs (anonymous OK for published)
GET  /api/cms/{collection}/{slug}?site={slug}      → single doc
POST /api/cms/{collection}?site={slug}             → create (token-authed)
PATCH /api/cms/{collection}/{slug}?site={slug}     → update (token-authed)
```

Already exists post-d7ce07db (today's `?site=` routing fix). Webhooks already exist (F35).

#### Chat (`BROBERG_TRAIL_URL` + `BROBERG_TRAIL_KB`)

```
POST /api/chat                  { message, sessionId, kb? }   → SSE stream
GET  /api/chat/sessions/{id}    → session history
POST /api/kb/search             { query, kb }                  → relevant neurons
```

Trail handles. Eir-style assistant becomes a small client-side component that points at trail with the site's KB-prefix. Already used by sanne-andersen — F147 just standardizes.

#### Payments (Stripe Connect via Christian's master account)

Not a service URL — a config pattern. Each customer webapp has its own Stripe Connect account that's connected to Christian's master account at Stripe-onboarding time. Code-side:

```ts
// scaffolded lib/stripe.ts
const stripe = new Stripe(env.STRIPE_SECRET);
await stripe.checkout.sessions.create({
  // ...
  payment_intent_data: {
    application_fee_amount: calcPlatformFee(total),       // routes to master
    transfer_data: { destination: env.STRIPE_CONNECT_ACCOUNT_ID },
    on_behalf_of: env.STRIPE_CONNECT_ACCOUNT_ID,
  },
});
```

`calcPlatformFee` lives in a shared `@broberg/stripe-utils` package so the fee logic isn't reinvented per site.

#### Storage / media (via cms-admin)

```
POST /api/media?site={slug}      multipart upload     → { url, sha256, variants }
GET  /api/media?site={slug}      list                 → media library
```

Already exists. F147 just documents that webapps SHOULD use this, not local file uploads.

### What the scaffolder produces

```
my-customer-webapp/
├── CLAUDE.md                    # ← read by cc day 1, hard rules + contract reference
├── cms.config.ts                # collections that match the contract pattern
├── lib/
│   ├── auth.ts                  # magic-link + passkey client
│   ├── cms.ts                   # content fetcher with site-token
│   ├── eir.ts                   # trail chat client
│   ├── stripe.ts                # Stripe Connect with platform fee
│   └── env.ts                   # asserts all BROBERG_* vars at boot
├── app/
│   ├── (public)/                # SSR pages reading from cms
│   ├── (auth)/login/page.tsx    # uses lib/auth, NOT custom NextAuth
│   ├── api/
│   │   └── revalidate/route.ts  # ICD endpoint (F145 boilerplate)
│   └── ...
├── .env.example                 # BROBERG_AUTH_URL, BROBERG_CMS_URL, ...
└── README.md                    # quickstart + link to contract
```

The generated `CLAUDE.md` includes:

```
## Hard rules (the broberg.ai webapp contract)

1. **DO NOT roll local auth.** Use lib/auth.ts which talks to BROBERG_AUTH_URL.
   No local auth_users table. No local password hashing. The CMS is the user store.

2. **DO NOT hardcode content.** All editable strings live in CMS collections.
   If you find yourself writing content into a .tsx file, stop and add it to cms.config.ts.

3. **DO NOT build a custom chat assistant.** Use lib/eir.ts for chat — it routes to trail
   with the site's KB-prefix. Memory and knowledge are trail's job.

4. **DO NOT integrate Stripe directly.** Use lib/stripe.ts which routes platform fees
   correctly via Stripe Connect to the master account. Edit calcPlatformFee in
   @broberg/stripe-utils, not inline.

5. **DO NOT modify lib/env.ts to remove asserts.** All BROBERG_* env-vars must be
   set at boot. Missing one = build fail. This is intentional — silent fallbacks
   to localhost are how customer-sites drift.
```

### Contract evolution + F148 alignment

The contract stays implementation-agnostic. Day 1 implementation:
- `BROBERG_AUTH_URL` = `https://webhouse.app/api/auth`
- `BROBERG_CMS_URL` = `https://webhouse.app/api/cms`
- `BROBERG_TRAIL_URL` = `https://trail.broberg.ai/api`

If F148 (Web Application Server gateway) lands later:
- `BROBERG_AUTH_URL` = `https://app-server.broberg.ai/auth`
- (etc.)

The webapp code does not change. Only env-vars in deployment config flip. This is the explicit reason F147's design centers on env-var-addressed endpoints rather than direct imports.

## Phases

### Phase 1 — Inventory + capability matrix (0.5d)

- Walk through cms, trail, stripe-utils, MCP servers and document what each already exposes as a public service vs gaps
- Output: `docs/architecture/broberg-stack-services.md` — table of 5 capabilities × current status × what's needed

### Phase 2 — Contract spec (1d)

- Write `docs/architecture/broberg-webapp-contract.md` — the implementation-agnostic interface for each capability
- Decide error-shapes (always JSON, conventional HTTP codes), versioning policy (URL-prefixed `/v1/`), backwards-compat policy
- This doc becomes the source-of-truth that F148 (if/when it lands) must implement, AND that F147's scaffolder generates clients against

### Phase 3 — Service exposure (close gaps from P1) (2d)

- Expose F59 as `/api/auth/{magic-link, verify, me, sign-out, passkey/*}` for sites
- Wire per-site `users` collection as authoritative user store (cms-admin already manages it)
- Add lifecycle webhooks: `user.created`, `user.role-changed`, `user.deleted`
- Document existing F134 token API as the service-to-service auth pattern
- One-shot reverse-sync helper: pull current auth_users → cms users-collection (so existing customer sites can adopt without losing users)

### Phase 4 — `create-broberg-webapp` scaffolder (1.5d)

- New package `packages/create-broberg-webapp/` with templates: nextjs, bun-hono
- Generates the structure described in "Architecture" above
- `CLAUDE.md` contains the 5 hard rules verbatim
- Includes a smoke-test that boots the skeleton + verifies all BROBERG_* env-vars are reachable

### Phase 5 — Reference implementation (1.5d)

- Build a small real customer-app using the scaffolder, deployed end-to-end
- Candidate: `house-of-wellness.dk` (mentioned in Christian's broberg.ai mind-map) or a throwaway demo
- Validates the scaffolder works, the contract is sufficient, no hidden gaps

### Phase 6 — AI Builder Guide module + propagation (0.5d)

- New module: `docs/ai-guide/22-webapp-blueprint.md` — full contract reference + when to fetch it
- `packages/cms/CLAUDE.md` quick-decisions table gets `"Build a customer webapp"` → `fetch 22`
- Each existing customer-site CLAUDE.md (sanneandersen-site, fdsport.net, etc.) gets a sentence: *"This site predates F147 and uses the legacy direct-DB pattern. New webapps should follow F147 (see `docs/ai-guide/22-webapp-blueprint.md`)."*

### Phase 7 — sanne-andersen migration runbook (deferred)

- Write `docs/architecture/sanneandersen-migration-to-f147.md` as appendix
- Documents the steps: replace local auth_users with cms users-collection, update Eir to use scaffolded `lib/eir.ts`, etc.
- **Not executed in F147.** Christian decides timing separately.

## Acceptance criteria

1. **A new cc-session given "build a customer webapp called X" runs `npm create broberg-webapp X`, reads the generated CLAUDE.md, and ships an authenticated multi-page site without rolling its own auth/content/chat.** This is the qualitative test — does the friction-of-doing-the-right-thing drop below the friction-of-reinventing?
2. **Auth API endpoints `/api/auth/*` on cms-admin work end-to-end**: magic-link sent, link verified, session token returned, /me returns user with site-scoped role from cms users collection
3. **Webhook `user.created` fires** when a webapp triggers signup-flow, payload includes site, email, initial role
4. **Reference implementation deployed and accessible**, demonstrating all 5 capabilities from a single env-config
5. **AI Builder Guide module 22 published**, linked from `packages/cms/CLAUDE.md` quick-decisions table
6. **F148-compatibility verified**: webapp's only contract-touching code is via `lib/{auth,cms,eir,stripe}.ts` — those files import URLs from `lib/env.ts`, never hardcode hostnames

## Risici + afbødning

| Risiko | Sandsynlighed | Afbødning |
|---|---|---|
| Public `/api/auth/*` endpoints become abuse target | Mellem | Rate-limit pr. siteSlug + email; existing cms-admin middleware patterns; magic-link tokens single-use + short TTL |
| Contract spec diverges from cms-admin reality over time | Mellem | OpenAPI spec auto-generated from cms-admin routes; CI fails if spec drifts; contract-tests in scaffolded webapps probe expected error shapes |
| Scaffolder template grows stale | Lav | Each cms-admin major-version bump triggers a "scaffolder review" task; reference implementation re-runs scaffolder on every release as smoke-test |
| Customer webapps want features not in the 5 capabilities | Mellem | Contract is opinionated about the SHARED concerns — webapps stay free to use any DB/queue/etc. for their own domain logic. We document this explicitly. |
| F148 design changes the contract shape after F147 ships | Lav-Mellem | Phase 2 contract spec is a 1-day investment with explicit versioning. F148 must respect or version-bump it; doesn't rewrite it from scratch. |
| Existing customer-sites refuse to migrate | Acceptabelt | Phase 7 is deferred — F147 is forward-only. Legacy sites stay on legacy patterns, marked clearly in their CLAUDE.md as predating the contract. |

## Why now

1. **The user-sync gap on sanneandersen** is what surfaced the architectural omission. Sanne is invisible in CMS, my role drifts, new signups don't propagate. Today's fix-attempts (option A/B/C from the ICD assessment) all sidestep the real issue: the contract doesn't exist yet.

2. **broberg.ai is about to ship 3+ new customer-webapps** (fdaalborg.dk, house-of-wellness.dk, fdsport.net evolution, app.trailmem.com). Without a blueprint, each one will repeat sanneandersen's mistakes. The cost of NOT doing F147 compounds linearly per new webapp; the cost of doing F147 once is bounded.

3. **F148 (Web Application Server) discussion is imminent.** F147's contract is the load-bearing artifact of that discussion — without it, F148 is hand-waving. With F147 done, F148 becomes a clean implementation choice ("do we put a gateway in front of the contract or keep direct-connect?") rather than a strategy debate.

4. **F59 + F134 + F136 are already shipped or in progress.** The ingredients exist. F147 is the thin layer that makes them composable from a customer-webapp's perspective.

## Why we didn't ship it earlier

The contract gap was invisible while there was only one customer-webapp (sanneandersen). With trail-landing, fdsport, app.trailmem on the horizon — and the current ICD audit surfacing that sanne's auth never connected to CMS — the gap is now load-bearing. F147 is the explicit response.

## Related

- **F59** — Passwordless Auth (admin-only today; F147 P3 exposes it as a public service)
- **F134** — Access Tokens (already the service-to-service pattern; F147 documents it as part of the contract)
- **F136** — Webshop Module (becomes the "Payments" pattern in the contract for product-selling webapps)
- **F139** — Headless Site API (the existing content-API surface; F147 stabilizes it as part of the contract)
- **F141** — Site switch context leak (precedent for per-site scoping; F147's auth API uses the same pattern)
- **F145** — ICD (the live-content propagation that customer webapps consume; scaffolder includes the boilerplate)
- **F148-pending-discussion** — Web Application Server (gateway-style consolidation that would implement the F147 contract behind a single ingress; not yet planned, awaits Christian's go)
- **2026-05-06 ICD audit** — surfaced the user-sync gap that motivates F147

## Effort

**L** — ~7 fokuserede dage core (P1-P6) + 0.5d deferred runbook (P7)

| Phase | Estimat |
|---|---|
| P1 Inventory + capability matrix | 0.5d |
| P2 Contract spec | 1d |
| P3 Service exposure (auth API) | 2d |
| P4 Scaffolder | 1.5d |
| P5 Reference implementation | 1.5d |
| P6 AI Builder Guide + propagation | 0.5d |
| P7 sanne-andersen migration runbook | 0.5d (deferred) |
