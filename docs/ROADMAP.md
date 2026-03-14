# @webhouse/cms — Roadmap

**Last updated:** 2026-03-15

---

## Done

| # | Task | Plan doc | Completed |
|---|------|----------|-----------|
| 01 | **Core engine** — schema, storage (filesystem + SQLite), REST API, build pipeline | PHASES.md (Phase 1) | 2026-01 |
| 02 | **AI agents** — generate, rewrite, translate, SEO, orchestrator engine | PHASES.md (Phase 2), redesign/plan-patch.md (A-C) | 2026-02 |
| 03 | **AI Lock** — field-level content protection, `_fieldMeta`, auto-lock on user edit | PATCH-AI-LOCK.md | 2026-02 |
| 04 | **Dual MCP servers** — public read-only + authenticated admin, 21 tools total | PATCH-MCP-DUAL.md | 2026-02 |
| 05 | **Admin UI** — document editor, rich text, media library, curation queue, AI cockpit | CMS-ENGINE.md (Phase 2) | 2026-02 |
| 06 | **GitHub storage adapter** — read/write content via GitHub API | CMS-ENGINE.md (Phase 3) | 2026-03 |
| 07 | **Multi-site admin** — registry, site pool, org/site switchers, cookie-based activation | MULTI-SITE.md | 2026-03 |
| 08 | **GitHub OAuth** — connect GitHub, org/repo picker, create repos from admin | MULTI-SITE.md | 2026-03-14 |
| 09 | **Block editor** — visual editor for `type: "blocks"` and structured arrays | — | 2026-03-14 |
| 10 | **Structured object editor** — nested object editing with JSON/UI toggle | — | 2026-03-14 |
| 11 | **Site scaffolder** — `npm create @webhouse/cms`, CLAUDE.md, .mcp.json, start.sh | — | 2026-03-14 |
| 12 | **npm trusted publishing** — GitHub Actions OIDC, 7 packages | TRUSTED-PUBLISHING.md | 2026-03 |
| 13 | **README** — complete rewrite with all 4 admin options, CLI, API docs | — | 2026-03-15 |
| 14 | **OpenAPI spec** — updated to v0.2.6 with i18n, scheduling, query params | — | 2026-03-15 |

---

## In progress

| # | Task | Plan doc | Status |
|---|------|----------|--------|
| 15 | **Landing page build pipeline** — CMS content → static HTML for examples/landing | LANDING-MIGRATION.md (Phase 3-4) | Schema + content done, build pipeline not started |
| 16 | **Analytics + feedback loop** — agent performance metrics, few-shot learning | redesign/plan-patch.md (Phase D-E) | Orchestrator done, analytics not started |
| 17 | **Docker admin image** — standalone `Dockerfile.admin`, test build + run | — | Dockerfile written, not built/tested |
| 18 | **Test blank CC session** — scaffold site with `create-cms`, let Claude build it, iterate CLAUDE.md | — | Scaffolder ready, test not run |

---

## Next up

| # | Task | Plan doc | Size | Notes |
|---|------|----------|------|-------|
| 19 | **webhouse.app marketing site** — landing page for the CMS product | — | Medium | Could be built by blank CC session as dogfooding test |
| 20 | **webhouse.app cloud** — hosted admin, user auth, connect GitHub repos | — | Large | Requires auth, multi-tenancy, billing |
| 21 | **Plugin system hooks** — lifecycle hooks wired in engine (beforeCreate, afterUpdate, etc.) | CMS-ENGINE.md (Phase 3.5) | Medium | Spec exists, hooks not fully wired |
| 22 | **Database adapters** — Supabase/PostgreSQL, Turso | PHASES.md (Phase 3) | Medium | Interface defined, adapters not built |
| 23 | **UI screenshot agent** — Playwright-based automated visual docs | UI-SCREENSHOT-AGENT.md | Small | Spec + template ready |
| 24 | **Framework adapters** — Next.js, Astro, Remix helpers | PHASES.md (Phase 4) | Medium | Content loader functions exist in CLAUDE.md |

---

## Future

| # | Task | Plan doc | Size |
|---|------|----------|------|
| 25 | **E-commerce plugin** — products, Stripe, gated content, digital delivery | CMS-PLUGIN-SHOP.md | Large |
| 26 | **Shop + AI guide integration** — RAG search, cart via MCP tools | CMS-PLUGIN-SHOP-PATCH.md | Medium |
| 27 | **Social media plugin** — AI post bank, multi-platform scheduling | CMS-PLUGIN-SOME.md | Large |
| 28 | **Design system** — component library, themes | PHASES.md (Phase 5) | Large |
| 29 | **Marketplace** — plugin/template marketplace | PHASES.md (Phase 6) | Large |
| 30 | **Enterprise** — RBAC, audit logs, SSO, multi-tenant | PHASES.md (Phase 7) | Large |

---

## Reference docs (not tasks)

| Doc | Purpose |
|-----|---------|
| CMS-ENGINE.md | Master technical blueprint |
| AI-ORCHESTRATED-CMS.md | High-level vision document |
| EXTERNAL-DEPENDENCIES.md | Service catalog |
| FEATURES.md | Feature brainstorm / notes |
