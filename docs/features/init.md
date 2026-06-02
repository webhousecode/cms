# Init — adopting `cms` into cardmem

> Auto-written by `cardmem_initialize_project` when this project was linked.
> Documents the one-time onboarding epic; the per-repo cc session executes it.

## Purpose

Bring this project's cardmem board in sync with what the repo actually
contains. No server-side LLM — all reasoning happens in the local cc session,
which has full filesystem + git context. cardmem-cloud does not.

## Three branches

`init.1` inspects the repo and picks exactly one branch:

- **Branch A** (`init.2`) — the repo already has `docs/features/F<n>-*.md`
  plan-docs → adopt each as a real card, classifying status (done /
  in-progress / planned) from code + git log.
- **Branch B** (`init.3`) — no F-docs but a `docs/PLAN.md` (or prose spec)
  exists → cut it into epics, each decomposed into stories + acceptance criteria.
- **Branch C** (`init.4`) — nothing exists → bootstrap a draft `docs/PLAN.md`
  for human review; Branch B runs after it's merged.

The two un-run branches are archived in `init.5`.

## Sub-stories

- **init.1** — Detect existing plan-docs, pick the branch.
- **init.2** — Branch A: adopt each F-doc as a card.
- **init.3** — Branch B: cut PLAN.md into epics + stories.
- **init.4** — Branch C: bootstrap a draft PLAN.md.
- **init.5** — Mark Init done; archive un-run branches; stamp `init_completed_at`.

## Guardrails

- Never call `cardmem_bulk_import_f_docs` — it only creates shallow stubs
  (the tool that caused the 2026-05-28 disaster). Build real
  role/task/constraints/AC per card from reading the plan-doc + code.
- Ask the user whenever status, scope, or dependencies are ambiguous — never guess.

## Done when

The chosen branch is in Done, the two un-run branches are archived, and
`init_completed_at` is set in project settings.
