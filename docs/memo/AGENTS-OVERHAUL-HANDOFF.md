# Agents Overhaul — Session Handoff

**Date:** 2026-04-06
**Previous session:** F35 Webhooks, F94 Favorites, F92 PWA, F124 Snippets, F81 Homepage, F119 Wizard, F122 Beam, Clone Site, Org Settings setup, Agentic Tester clone
**Next session goal:** Complete audit-driven overhaul of the Agents subsystem

---

## Context for the next session

The user wants to do a comprehensive improvement pass on the Agents architecture (the `/admin/agents` menu and everything that hangs off it: scheduling, curation queue, tool use, brand voice, analytics, feedback loop). A full audit was completed in the previous session — this document contains the findings and the prioritized work plan.

**Critical setup that already exists:**

1. **Test target site:** `Agentic Tester` (id: `agentic-cms-demo`) is a clone of CMS Demo specifically created for autonomous agent testing. It lives at `/Users/cb/Apps/webhouse/cms/examples/static/agentic-cms-demo/`. Its hero badge says "OPEN SOURCE — MIT LICENSE (AGENTIC TESTER)" so you can visually distinguish it from CMS Demo in preview.
2. **Org-level keys configured:** The Examples org (`/Users/cb/Apps/webhouse/webhouse-site/_admin/_data/org-settings/examples.json`) has real Anthropic, Gemini, and Resend API keys + sensible model defaults. All sites under Examples (including Agentic Tester) inherit these via F87 Org Settings inheritance.
3. **Deploy is enabled** on Agentic Tester to its OWN GitHub repo (`cbroberg/agentic-cms-demo-site`) — not the CMS Demo repo. Safe to spam.
4. **Future clones default to deploy=off** thanks to a fix in `lib/site-clone.ts` from the previous session — clones are sandboxes by default unless you flip `deployOnSave: true` manually.
5. **F35 webhooks fire** `agent.started` and `agent.completed` events from agent-runner.ts. Discord test webhook for the user is `https://discord.com/api/webhooks/1471574318726250496/Qgzmm_IROBuLa-9ldwZmFs31fe7_Me_yZ5PvRV1JLsosLMpxf7gNxlcu3FaJwIlXtJXL` (their "reports" channel).

**Hard rules to remember:**
- **NEVER touch port 3010.** It's the live CMS admin dev server. Don't kill, restart, bind, or `lsof -i :3010` it. The user starts/stops it themselves. Checking it's up via `curl http://localhost:3010/admin/login` is fine.
- **Use Agentic Tester for all destructive testing.** Switching active site is via cookies (`cms-active-org=examples`, `cms-active-site=agentic-cms-demo`).
- **Test before claiming done.** Runtime verification on port 3010 is mandatory after any code change to agents.

---

## Audit findings (from previous session)

The previous session ran a thorough Explore agent over the entire agents subsystem. Key files and findings:

### ✅ Solid foundation (already production-ready)

| Component | File | What works |
|-----------|------|------------|
| Agent CRUD | `lib/agents.ts` | Full lifecycle, JSON storage in `_data/agents/*.json`, 5 default agents seeded |
| Agent runner | `lib/agent-runner.ts` | Tool-use loop, brand voice injection, multi-model comparison, cost tracking, F35 webhook events at lines 210-214 + 385-392 |
| Scheduling | `lib/scheduler.ts` | daily/weekly + budget gates, called from `instrumentation-node.ts` every 5 min |
| Curation queue | `lib/curation.ts` | Approval workflow, retention purge, alternatives storage |
| Tools | `lib/tools/index.ts`, `cms-tools.ts`, `web-search.ts`, `mcp-tools.ts` | CMS internal search/list/get, Brave/Tavily web search, MCP connections |
| Brand voice | `lib/brand-voice.ts` | Versioning, locale variants, prompt context injection |
| Analytics | `lib/analytics.ts` | Run logs (500), content edits (2000), agent stats |
| Cockpit | `lib/cockpit.ts`, `app/admin/(workspace)/command/page.tsx` | Global params, monthly budget, multi-model toggle |
| UI list/detail/new | `app/admin/(workspace)/agents/*` | Grid/list view, full edit form, AI describe-to-create |

### ⚠️ Half-built (visible gaps)

| # | Issue | File |
|---|-------|------|
| 1 | **GEO Optimizer role** is defined as a default agent (`agents.ts:64-87`) but missing from UI role picker (`agents-list.tsx:19`, `agents/new/page.tsx:9`) — users can't create new GEO agents from UI |
| 2 | **Multi-model comparison** infrastructure exists (`agent-runner.ts:311-331`) and stores alternatives in queue items, but **no UI in curation queue** lets users see/swap between alternatives. Default disabled in `cockpit.ts:23` |
| 3 | **Feedback loop** loads past corrections via `loadFeedback()` in `agent-runner.ts:34-42` and injects them into system prompt, but **no API endpoint exists to save feedback**. One-way only — F10 feature is half-built |
| 4 | **SEO score** field exists on `QueueItem` (`curation.ts:20`) and is displayed in UI (`curation/page.tsx:276-282`) but **no code computes it**. Pure placeholder |
| 5 | **Description→Config** AI generation works (`api/cms/agents/create-from-description/route.ts`) but has zero tests and minimal error recovery |
| 6 | **Locale per agent** — `agent-runner.ts:236` always uses site's defaultLocale. No UI to select target language per agent. Multi-locale sites can't have e.g. English+Danish agents |
| 7 | **Manual vs scheduled distinction** in UI is unclear — schedule form exists but the "Run" button on agent detail page doesn't make obvious whether it's a one-off or simulates a scheduled run |

### ❌ Completely missing

- **Per-agent cost guards / rate limits** — only the global monthly budget exists in `cockpit.ts`. No way to cap individual agents' daily/weekly spend
- **Agent-to-agent handoffs** — no `transfer_to_agent` tool, no multi-step workflows
- **Image generation tool** — agents can't create images. No `generate_image` in any tool registry
- **Agent template library** — every new site gets the same 5 hardcoded default agents from `agents.ts:6-88`. No marketplace/preset system
- **Cost breakdowns by collection** — `costByAgent` exists in `analytics.ts:222-229` but no `costByCollection`
- **Content edit ratio dashboard** — `getContentRatio()` function exists in `analytics.ts:242-269` but the data is never surfaced in any UI

### 🐛 Real bugs to fix

1. **MCP connection leak (MODERATE)** — `agent-runner.ts:409` calls `await toolRegistry.cleanup()` only in the success path. If the agent run throws, MCP servers stay connected. Fix: wrap in `try/finally`.

2. **Web search fake fallback (MINOR)** — `tools/web-search.ts:46-57` returns a dummy tool that says "not configured" even when web search is disabled in the agent. The agent can still call it and waste LLM tokens. Fix: return `null` from `buildWebSearchTool()` and have `buildToolRegistry` skip nulls.

3. **Field editor type-blindness (MODERATE)** — `curation/page.tsx:386-434` filters out richtext/body/content fields, then falls back to `<input type="text">` for everything else. Markdown, HTML, JSON, and custom fields render and save incorrectly. Fix: switch on field type from collection schema.

4. **No rollback on curation approval failure (MODERATE)** — `curation.ts:98-106` catches creation errors but if the doc doesn't exist either, the queue item still gets marked approved with no actual document. Should be transactional.

5. **No deadletter queue for failed scheduled runs (MODERATE)** — `scheduler.ts` and `agent-runner.ts` log errors but don't persist failed runs anywhere. Failed scheduled runs vanish from any audit trail.

6. **Token limit silent truncation** — `agent-runner.ts:258` uses `cockpit.speedQuality === "thorough" ? 4096 : 2048` for maxTokens. No streaming or truncation handling. Quality silently degrades in "fast" mode.

---

## Recommended work plan

### Phase 1 — Quick wins (estimated 2-3 hours)

1. **Add GEO role to UI** — `agents-list.tsx`, `agents/new/page.tsx` ROLE_LABELS
2. **Fix MCP connection leak** — wrap `agent-runner.ts` in try/finally
3. **Fix web search fake fallback** — return null instead of dummy tool
4. **Add E2E smoke test** for full agent flow on Agentic Tester:
   - Trigger Content Writer manually → verify queue item created → approve → verify document exists → verify webhook fired → verify brand voice was used (check the LLM call's system prompt)

### Phase 2 — Feedback loop (estimated 4-6 hours, HIGH VALUE)

This is the most important missing piece. Without it, agents never get better.

1. New API: `POST /api/cms/agents/[id]/feedback` — body: `{ queueItemId, type: "correction" | "rejection" | "edit", original, corrected, notes }`
2. Storage: append to `_data/agents/feedback/{agentId}.jsonl`
3. Update `loadFeedback()` in `agent-runner.ts:34` to read from the new location (currently it reads from somewhere — verify path)
4. Wire it into the curation queue: when a curator edits a draft before approving, automatically submit a "correction" feedback. When they reject with notes, submit a "rejection" feedback.
5. Add a small "Recent feedback" panel on agent detail page showing last 5 corrections so users can see what the agent is learning from.

### Phase 3 — Multi-model UI (estimated 3-4 hours)

The infrastructure already exists. Just needs the curation UI:

1. In curation queue, when a queue item has `alternatives.length > 0`, show a model selector chip row
2. Click an alternative → swaps the displayed `contentData` to that alternative
3. Approve uses whichever alternative was selected
4. Add a "side-by-side" toggle to compare two alternatives in split view

### Phase 4 — Per-agent cost guards (estimated 3-4 hours)

1. Add fields to `AgentConfig` in `agents.ts`: `dailyBudgetUsd?: number`, `weeklyBudgetUsd?: number`, `monthlyBudgetUsd?: number`
2. New helper in `analytics.ts`: `getAgentSpendInPeriod(agentId, "day" | "week" | "month")`
3. Pre-flight check in `agent-runner.ts:204` (after loading agent): if any budget is set and current period spend exceeds it, throw a clear error
4. Pre-flight check in `scheduler.ts:111-124`: also respect per-agent budgets, not just global
5. UI: add three optional input fields to agent detail form

### Phase 5 — SEO score calculation (estimated 2-3 hours)

The placeholder is there. Hook up actual computation:

1. Reuse F97 SEO module rules — find `lib/seo/` or `lib/seo-rules.ts`
2. After `addQueueItem()` in `agent-runner.ts:351`, compute SEO score from the generated `contentData` and patch it onto the queue item
3. The UI already displays it — no UI work needed

### Phase 6 — Deferred / discuss with user

- Agent-to-agent handoffs (large)
- Image generation tool (medium — needs DALL-E or Flux integration; user has Anthropic only)
- Agent template marketplace (large)
- Locale-per-agent support (medium)

---

## Critical files to read first in the next session

1. `packages/cms-admin/src/lib/agents.ts` — data model + defaults
2. `packages/cms-admin/src/lib/agent-runner.ts` — the engine, ~410 lines
3. `packages/cms-admin/src/lib/curation.ts` — queue lifecycle
4. `packages/cms-admin/src/lib/scheduler.ts` — scheduled runs
5. `packages/cms-admin/src/lib/tools/index.ts` + `cms-tools.ts` + `web-search.ts` + `mcp-tools.ts`
6. `packages/cms-admin/src/lib/analytics.ts` — what's tracked
7. `packages/cms-admin/src/app/admin/(workspace)/agents/[id]/page.tsx` — edit form
8. `packages/cms-admin/src/app/admin/(workspace)/curation/page.tsx` — approval UI

## Active site context

Make sure to test as `cms-active-org=examples` + `cms-active-site=agentic-cms-demo`. The user can switch to it via the sites list. The site has the same 5 default agents as CMS Demo (Content Writer, SEO Optimizer, Translator, Content Refresher, GEO Optimizer) with 8 existing posts to work with.

## Test verification checklist for any agent change

After every code change touching agent-runner, scheduler, or curation:
- [ ] `npx tsc --noEmit --project packages/cms-admin/tsconfig.json` — clean
- [ ] `cd packages/cms-admin && npx vitest run` — all 267+ tests pass
- [ ] Trigger an agent run on Agentic Tester via the Run button on agent detail page
- [ ] Verify queue item appears in `/admin/curation`
- [ ] Approve it and verify the document appears in `/admin/posts/{slug}`
- [ ] Check that webhook fired in user's Discord (or check `_data/webhook-deliveries.jsonl`)
- [ ] If it's a feedback loop change: edit the draft before approving and verify the correction was logged

## Roadmap status

After the previous session, the roadmap has these completed in Tier 2 already:
- ✅ F35 Webhooks (full integration)
- ✅ F81 Homepage Designation
- ✅ F92 Desktop PWA
- ✅ F94 Favorites
- ✅ F119 Docker Wizard
- ✅ F122 Beam (archive + live)
- ✅ F124 Snippet Embeds

The Agents overhaul does NOT have an F-number assigned. Treat it as an internal cleanup pass. If something turns into a major new feature (like agent-to-agent handoffs), give it a fresh F-number and a plan doc in `docs/features/`.
