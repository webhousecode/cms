---
name: adopt
description: FORCED onboarding skill for a repo just imported into cardmem. Walks a local cc session step-by-step through translating the repo's existing plans into cardmem cards (epics → stories → AC → dependencies), or bootstrapping a plan if none exists. Invoked via the Init epic; binding until init is complete.
---

# Adopt this repo into cardmem

> You are reading this because **this repo was just imported into cardmem and has not been adopted yet**. This is your first and only job until it is done. Work top to bottom. Do not skip steps. Do not start unrelated work — not even tempting "obvious" cleanups in `CLAUDE.md` or elsewhere. If you catch yourself editing something this skill didn't ask for, stop and come back here.

---

## 1. What cardmem is (and why you're doing this)

**cardmem** is the project-management layer that connects *planning* with *execution*.

- **Planning** happens wherever a plan gets authored: in Claude Desktop, in a Claude Code session like you, in chat — and increasingly **inside cardmem itself**, which is growing the tooling to author a product's plan end-to-end. A plan can arrive from many places, but it only becomes *trackable, executable work* once it lives on a cardmem **board** as cards.
- **Execution** happens here, in a terminal cc session like you, working one card at a time against the real repo.

**It's all a roadmap.** This repo may or may not have a literal `ROADMAP.md` — that doesn't matter. Working with a product's features and release plans *is* a roadmap: a flow of features that drip down through **development → test → deployment**, organised in tiers (Now / Next / Later). When you adopt this repo's features as cards, you are reconstructing that roadmap inside cardmem.

A cardmem project has a **board** with columns: **Backlog → Ready → In progress → Review → Done**. Work is a hierarchy:

- **epic** (`F<n>`) — a whole feature. Has a plan-doc at `docs/features/F<n>-<slug>.md`.
- **story** (`F<n>.<m>`) — a concrete, pick-up-able slice of an epic, with **acceptance criteria** and optionally **dependencies** on other cards.
- **task / subtask** (`F<n>.<m>.<k>`) — finer breakdown when a story is large.

**Right now cardmem knows nothing about what this repo contains.** Your job is to translate whatever planning already exists into that card hierarchy — faithfully, with real content, not stubs. You reason it all out *here*, where you have full filesystem + git access. **cardmem-cloud runs no LLM** — there is no server-side intelligence to fall back on. The thinking is yours.

---

## 2. Why stories matter — and how the Board, Reader, and queue-drain connect

**A story / task / subtask is a small, self-contained prompt for a cc session** — "here is exactly what to build/test/fix, and here is the acceptance criteria." That is the unit of work the whole system runs on.

This is not cosmetic, it's operational:

- **Queue-drain is ON by default** (verified: every new project starts with `auto_pickup_mode: 'queue-drain'`). A card flipped to **Ready** is auto-claimed by an idle cc session and worked — no human nudge needed.
- **But there is nothing to claim if an epic has no stories.** An epic on its own is an unpickable wall of text. **No stories → no pickup → no work → no product built in cardmem.** Cutting epics into real stories is the single thing that makes the board actually drive development. Treat "every adopted epic ends up with workable stories" as the success condition of this whole exercise.

**Plan-docs must land in the DB, not just on disk.** Every plan you adopt — a full set of `F`-plans *or* a single stray plan document — must be loaded into cardmem's database (via `cardmem_create_card`'s `plan_md`, or `cardmem_write_plan`), not left as a lone file. That is what makes it visible in the **Reader**.

**Board ↔ Reader are fixed-linked.** Every card on the Board links to its plan-doc in the Reader; every plan-doc in the Reader maps back to its card. A plan that's only a file — never loaded — is invisible to cardmem. Adoption means *both*: the card on the board **and** its plan in the Reader.

---

## 3. The cardmem tools you'll use

All available via the `cardmem` MCP server in this repo:

- `cardmem_suggest_next_f_number({ project_id, parent_card_id? })` — never invent F-numbers; always ask for the next one.
- `cardmem_create_card({ ... , plan_md? })` — create an epic/story/task. For epics/stories you author from prose, pass `plan_md` so the plan-doc lands in `docs/features/` **and** the DB/Reader in one call.
- `cardmem_create_cards([...])` — batch-create an epic's stories in one call.
- `cardmem_write_plan` — load an existing on-disk plan-doc into the DB/Reader and link it to its card.
- `cardmem_update_card`, `cardmem_move_card`, `cardmem_handoff_card`, `cardmem_archive_card`, `cardmem_add_dependency`, `cardmem_ac_check`.
- `cardmem_get_card`, `cardmem_list_cards`, `cardmem_search`.

**Never call `cardmem_bulk_import_f_docs`.** It only creates shallow stubs and caused a real data disaster (2026-05-28). Every card carries real `role` / `task` / `constraints` / acceptance criteria, derived from reading the plan-doc + the code.

---

## 4. Step 0 — Recon the repo

Build an inventory of what planning material exists. Run a real filesystem sweep (you have local access — use it, like `/init` does when it builds a `CLAUDE.md`):

```
# existing F-plan docs (the strongest signal)
ls docs/features/F*-*.md 2>/dev/null

# any other planning prose
ls docs/PLAN.md docs/ROADMAP.md PLAN.md ROADMAP.md README.md 2>/dev/null
find docs -name '*.md' -maxdepth 2 2>/dev/null

# breadth: every markdown in the repo, so nothing is missed
git ls-files '*.md' | head -200
```

Read enough to answer one question: **does this repo already contain authored plans, a single spec, or nothing usable?** Then pick exactly one branch in Step 1.

---

## 5. Step 1 — Pick your branch (A / B / C)

- **Branch A — the repo already has `docs/features/F<n>-*.md` plan-docs.**
  → Authored plans (almost always **epics**). Adopt each as a real card and cut it into stories. **Go to Section 6.**

- **Branch B — no F-docs, but a `docs/PLAN.md` (or a README/prose spec with real scope) exists.**
  → A plan, not yet split into features. Cut the prose into epics, each decomposed into stories + AC. **Go to Section 7.**

- **Branch C — nothing usable exists** (just code, or an empty/placeholder README).
  → Don't invent a roadmap. Bootstrap a *draft* `docs/PLAN.md` from the code for the human to review, then stop. **Go to Section 8.**

A single real `PLAN.md` qualifies B. A bare `ROADMAP.md` pointer-stub alone does **not** — prefer C and propose a cleaner `PLAN.md`. When genuinely unsure, **ask the user**.

---

## 6. Branch A — adopt each existing F-doc

The most common and most valuable path. You have a set of `docs/features/F<n>-*.md` files.

### 6a. ⛔ STOP — ask the scope question BEFORE you create a single card

**This is a hard gate.** Do not read on, do not create or edit any card, do not start adopting, until you have asked the user this **and received an answer**:

> **How much of this repo's history do you want in cardmem — lean or full?**
>
> - **Lean** — only the features **not yet implemented** (the live + planned work). Fast, cheap, board working immediately.
> - **Full history** — **every** feature, including everything already shipped, as **Done** epics + stories, so the complete repo/product story lives in cardmem with full traceability.

Full history is genuinely valuable but **token-heavy** — trail's ran to **130+ epics** — so it is **never yours to assume**. Ask, wait for the answer, *then* proceed.

**Lean** → just the active/planned work, your normal model; sequential is plenty. Skip to 6b.

**Full history** → this is bulk work, so **also offer the user an execution mode** (don't pick silently — present all three and let them choose):

1. **Sequential (safest)** — one F-doc/epic per turn, full quality, fresh context each. Most turns, but verifiable as you go; runs itself under queue-drain, the user need do nothing.
2. **Batch-N (middle)** — adopt N (e.g. 5) F-docs per turn inline, no swarm. Fewer turns than pure sequential, still under your direct control and verifiable per batch.
3. **Haiku swarm (fastest, cheapest)** — fan out **one Haiku agent per F-doc**, in parallel. ⚠️ Calling cardmem MCP tools from subagents is **not yet proven** — so **validate on 1–2 epics first**, inspect the result (real stories? correct `parent_card_id`? no stubs?), and **fall back to sequential if it's messy**. **Every swarm agent MUST be Haiku** — bulk historical adoption is mechanical; never burn Opus/Sonnet on it.

Recommend **sequential or batch** for quality; reach for the **swarm** only after a clean 1–2-epic validation.

**Do not move past this section until the user has answered both questions** (scope + execution mode for full history). Asking is not optional politeness — it decides how many hundreds of cards (and how many tokens) you are about to create.

### 6b. For each `F<n>` epic plan-doc

Work **one F-doc per turn** to keep context fresh, and **adopt parents before children** (epics `F<n>` before sub-stories `F<n>.<m>`).

1. **Read the plan-doc end to end.** Understand intent, scope, stated non-goals.
2. **Classify status from reality — code + git, not vibes:**
   - **Done** — clearly shipped: code present, no obvious gaps, commits reference it.
   - **In progress** — partial code, recent commits, AC not all met.
   - **Planned** — just the plan-doc, no implementing code yet.
   - Can't tell? **Ask the user** — never default to Done.
3. **Adopt the epic as a card** (`kind: 'epic'`, `f_number: 'F<n>'`) with real `role`/`task`/`constraints`. It already has a plan-doc on disk — load it into the Reader (`cardmem_write_plan`) and link it; don't rewrite it. Put it in the column matching step 2.
4. **Cut the epic into stories — the core of the work, not optional.** (Remember Section 2: an epic with no stories is unpickable; no stories = no work.) From the plan-doc's "## Stories" section (or the logical slices you derive), create each story:
   - `kind: 'story'`, `parent_card_id: <epic>`, `f_number: 'F<n>.<m>'` (use `cardmem_suggest_next_f_number` with the epic as parent).
   - Concrete `role`/`task`/`constraints` — written as a **small prompt a cc session can pick up and execute**.
   - **Acceptance criteria** (`ac: [...]`).
   - **Dependencies** where one story must precede another (`cardmem_add_dependency`).
   - Column from the same status logic (a shipped epic's stories are Done; a planned epic's stories sit in Backlog).
   - Batch with `cardmem_create_cards` when cleaner.
5. **Next F-doc.** Repeat until every `F<n>-*.md` is adopted with its stories.

The server rejects a story carrying a top-level (dotless) F-number — stories nest as `F<n>.<m>` with `parent_card_id`. Use the local `feature` skill (`.claude/skills/feature.md`) to help author clean breakdowns.

---

## 7. Branch B — cut `PLAN.md` into epics

No F-docs yet, but a real spec. Read it fully, then for each logical epic:

1. Use the local `feature` skill to author the epic's plan-doc — this includes the **Discovery reuse check** (feature Step 3.5, F217): before writing each epic's plan, `GET https://discovery.broberg.ai/api/search?q=<capability>` for every cross-cutting capability and record reuse-vs-build in the plan-doc's `## Reuse` section. Matching a new repo's plan against the shared `@broberg/*` inventory — instead of re-rolling a capability that already exists — is a core aim of adoption.
2. `cardmem_create_card({ kind: 'epic', plan_md: <plan-doc> })` so the file lands at `docs/features/F<n>-<slug>.md` **and** in the Reader.
3. **Decompose it into stories** — same as 6b step 4: stories with `parent_card_id`, AC, dependencies, each a small pick-up-able prompt. An epic with no stories is a rule violation.
4. Everything starts in **Backlog** (nothing shipped yet — fresh planning).

Stop and ask the user if the prose is ambiguous about where one epic ends and the next begins.

---

## 8. Branch C — bootstrap a draft `PLAN.md`

Nothing usable exists. Don't fabricate a roadmap.

1. Read `README.md` and skim `src/` to understand what this repo is.
2. Write a **draft** `docs/PLAN.md`: purpose, current stack, top-level surface areas, a few honest "what's next" bullets.
3. Commit the draft **on a branch** (not `main`), e.g. `docs/cardmem-bootstrap-plan`.
4. **Stop.** Hand the Init card to Review. The user reviews, edits, merges — then Branch B runs against the now-real `PLAN.md`.

Do **not** auto-cut the draft into epics. That's Branch B, after human review.

---

## 9. Offer a Lens-readiness foundry epic

Whichever branch you ran, **propose** (don't force) a foundry epic that makes this repo's UI verifiable by Lens.

**What Lens is:** Lens confirms a UI surface **looks + behaves right** before a card moves to Done. The browser (Playwright/Chromium) lives in the cardmem daemon (`127.0.0.1:7475`), not in this repo. You call it; it returns pass/fail + a screenshot, an optional pixel-diff vs an approved baseline, and an optional DOM assertion. **`data-testid` is the contract** — every verification anchors on a stable `[data-testid="…"]`, never a CSS/text guess.

**Why a foundry epic:** Lens can't see UI that has no `data-testid` anchors. So before visual AC can exist on *any* future UI card, the interactive UI needs instrumenting. Propose an epic — e.g. `Foundry: data-testid coverage for Lens` — with per-surface stories (one per route/component group), each adding `data-testid` to every interactive element (buttons, inputs, selects, cards, modals…) on that surface. This is itself a clean set of small, pick-up-able stories, and it unblocks Lens for the whole product. Create it only if the user agrees.

---

## 10. The Init cards are your test track

This repo's board already has 5 cards under the **Init** epic: `init.1 … init.5`. They mirror the branches above and exist so you can **prove you can drive the board** — read a card, edit it, move it across columns, hand it to Done — while doing the real adoption. Use them; don't ignore them:

- **`init.1` — Recon + pick branch.** Do Sections 4 + 5. Record your decision by editing the card (`cardmem_update_card` — which branch + why), then **hand `init.1` to Done**. Hand the chosen branch's card (`init.2`/`.3`/`.4`) to **Ready**.
- **`init.2` — Branch A** (Section 6) / **`init.3` — Branch B** (Section 7) / **`init.4` — Branch C** (Section 8). Work whichever your branch chose; **archive the other two** (`cardmem_archive_card`).
- **`init.5` — Finish.** Verify the branch you ran is in Done, archive the un-run branch cards, stamp completion: `cardmem_update_settings({ project_id, patch: { init_completed_at: <ISO timestamp> } })`. Hand `init.5` and the parent **Init** epic to Done.

Once `init_completed_at` is set, this skill stops being forced — the repo is fully under cardmem and you work normally from the board.

---

## 11. Guardrails (non-negotiable)

- **All reasoning is local.** cardmem-cloud runs no LLM. Use your full filesystem + git context.
- **Never `cardmem_bulk_import_f_docs`.** Real cards only — role/task/constraints/AC built from reading the plan-doc + code.
- **Adopt parents before children.** Epics before their stories.
- **One F-doc / one epic per turn** for active adoption — keep context fresh. (Full-history bulk adoption may swarm, but **Haiku-only**.)
- **Load every plan into the DB/Reader**, not just onto disk — a file-only plan is invisible to cardmem.
- **No stories = no work.** Every adopted epic must end with workable, pick-up-able stories — that's what queue-drain runs on.
- **Reuse before you build (F217).** Before authoring any epic plan-doc, run the Discovery reuse check (feature skill Step 3.5): search `discovery.broberg.ai/api/search` per cross-cutting capability and record the reuse-vs-build decision in the plan-doc's `## Reuse` section. The session-start `discovery_reuse` block also lists this repo's gap. Reuse a `@broberg/*` package over a hand-rolled copy.
- **When status, scope, or dependencies are ambiguous, ask the user.** Never guess "Done".
- **Stay in scope.** Your job is adoption. Don't drift into editing `CLAUDE.md`, refactoring, or other "while I'm here" work — that's how the previous attempt failed.
