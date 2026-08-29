---
name: auto-review
description: The Full Auto Review gate (F095). Walk the Review column and, per card, run all five checks LOCALLY ($0) — Lens (visual) + AC (contract) + code-review + security-review + design-drift — aggregate via cardmem_card_verdict, and flip Review→Done ONLY when ready_for_done, attaching a review report. On any fail, fix the findings in-session and re-handoff to Review (the review→fix→re-review loop), bounded by the project's max-fix-rounds cap — then escalate to the human. Never flips without all-green + evidence.
argument-hint: "[F<n>]  (omit to sweep the whole Review column)"
---

# /auto-review [F<n>]

Run the Review→Done gate. With an F-number, review that one card; with no
argument, sweep every card in the **Review** column. **Everything runs locally
on the Max-plan — $0.** No metered API, no billed `/code-review` harness, no
`ultrareview`.

## Auto-triggered (F095.11)

When a project has **Auto Review enabled** (Settings → Workflow), a card landing
in Review auto-dispatches `/auto-review <card>` to this session over the same
`card_moved → daemon → binding-directive` chain queue-drain uses. So most runs
arrive as a binding intercom directive — act on it immediately, like a
queue-drain pickup. The manual `/auto-review` invocation still works identically.

## Per-card procedure

For each card (`cardmem_list_cards({column:"review"})`, or the one you were given):

1. **AC** — `cardmem_get_card` → for each acceptance criterion, route by `kind`:
   - `data` → verify it yourself (query the DB, call the tool, read the diff/exit
     code). If met: `cardmem_ac_check({passed:true, evidence:"<tool-result/value>"})`.
   - `visual` → `lens_verify({project, url: <dev-server><verify_route>, mode:"element",
     selector: <verify_selector>, ...})`. If pass: `cardmem_ac_check({passed:true,
     evidence:"lens run <id>"})`. (Lens is the ONLY visual engine — no `pnpm review:visual`.)
   - `manual` → leave unticked; note it needs a human.
   Then record the AC pillar: `cardmem_record_review({type:"ac", status: <all data/visual
   AC met ? "passed" : "flagged">, summary, evidence})`.

2. **Lens (+ composition critic, F126)** — verify the card's visual surfaces (the
   `verify_route`/`verify_selector` of its visual AC, or the repo's `lens.manifest.json`
   surfaces the card touched). **Pass a `critic` to every `lens_verify`/`lens_capture`**:
   read the project's setting once (`cardmem_get_settings` → `composition_critic`) and pass
   `critic:"both"` when `.vision` is `true`, else `critic:"dom"` (geometry is free + always
   on); when vision is on also pass `critic_vision_model: composition_critic.vision_model`
   (`"haiku"` default | `"sonnet"`). The critic checks the screen actually *holds together* — nothing
   overlapping, covered, clipped, or off-screen — which presence + pixel-diff can't see.
   The response carries a `critic` block (`high`/`medium`/`low` counts + `dom`/`vision`
   findings); a **high-severity** finding folds the verify `status` to `fail`, so **record
   the Lens pillar `failed` and FIX it** like any other fail (the named element + box is in
   the finding). **Lower-severity** findings → list them in the Lens `summary` as advisory,
   non-blocking notes. `cardmem_record_review({type:"lens", status, summary:"<n surfaces, m
   green; composition: H high / M med>", findings:<the critic dom+vision findings, each with
   its selector/region + box>, evidence:"<lens run ids>"})` — passing the findings persists
   them into the report (F097). **Waiver:** if a flagged overlap is genuinely intentional,
   record the Lens pillar `passed` with an evidence note saying why (the same explicit-
   satisfy path any AC has) — don't let a deliberate design choice block forever. If the
   card has no UI, skip Lens (the verdict treats a missing lens row as non-blocking).

3. **Code review** — run `/code-review <F-number>` (records `type:"code"`).

4. **Security review** — run `/security-review <F-number>` (records `type:"security"`).

4b. **Design drift (F280.3)** — if the card touched `apps/web/src`, run
   `node apps/web/scripts/design-drift.mjs`. It compares off-token colour + radius
   literals against the recorded baseline in `apps/web/design-drift-baseline.json`
   and names every offender `file:line`.

   - **Count ROSE** → this card added drift. `cardmem_record_review({type:"design",
     status:"failed", summary:"drift <n> > baseline <b>", findings:[…file:line…]})`.
     That **blocks** `ready_for_done`, so fix it: use the token the report names, or —
     only when a token genuinely cannot reach the site (a third-party brand mark, a
     canvas, a standalone document) — mark the site with `design-token-exception` and
     write the reason there. **Never a file-level exemption**; the marker covers the
     construct it sits in and nothing else.
   - **Count FELL** → good. Write the new number into the baseline file, in the same
     commit, then record the pillar `passed`.
   - **Unchanged and non-zero** → `status:"flagged"`. That is **advisory**: it appears
     in the verdict's `advisories`, it does NOT block, and it does not need fixing on
     this card. Do not "fix" it by raising the baseline — the number may only go down.
   - **Card touched no web UI** → skip it. A missing `design` row is non-blocking, the
     same as a missing lens row.

5. **Aggregate + decide** — `cardmem_card_verdict({card_id_or_slug})` returns
   `ready_for_done`, plus the fix-loop cap: `fix_rounds` (how many times this card has
   re-entered Review after a failed pass), `max_fix_rounds` (the project setting), and
   `escalate` (true when not ready AND the cap is reached). It also returns
   **`plan_doc.present`** (F115): if `false` on an epic/story, note "⚠ missing plan-doc"
   in the review summary and tell the human — this is a **soft, non-blocking** signal
   (it does NOT feed `ready_for_done`, so don't record a blocking flag for it; the board
   already shows the epic RED). It also returns **`reuse_section.present`** (F217.3): if
   `false` while `plan_doc.present` is `true` (a plan-doc that skipped its Discovery reuse
   check), note "⚠ no ## Reuse section" — same **soft, non-blocking** posture (never gates
   `ready_for_done`; don't record a blocking flag). Then branch:

   - **`ready_for_done === true`** → `cardmem_review_report({card_id_or_slug})` to attach
     the evidence bundle, then move the card to **Done** (`cardmem_move_card` /
     `cardmem_handoff_card` per the repo's flow). The report is the proof behind the flip.
     Done — no human touch.

   - **not ready, `escalate === false`** (still under the cap) → **fix the findings in
     this session.** Read the recorded code/security findings + the unmet AC, make the
     repair (real fix, root cause — no symptom-hiding), typecheck, then **re-handoff to
     Review** (`cardmem_handoff_card`). The re-entry re-fires this gate automatically —
     that is the **review → fix → re-review loop**. The `fix_rounds` counter bumps on the
     re-entry, so the loop is bounded.

   - **not ready, `escalate === true`** (cap reached: `fix_rounds ≥ max_fix_rounds`) →
     **STOP. Do not auto-fix again.** Leave the card in Review with its findings,
     write a short summary of what's still failing into the card (`cardmem_update_card`
     notes), and tell the human plainly why it needs them (in-session; the Review-column
     verdict pills already show the red checks). The human owns the call from here.

## Hard rules

- **Never flip a card to Done without `ready_for_done === true`** — i.e. AC gate
  satisfied AND code + security passed AND any recorded lens/ac/design passed AND nothing
  blocking (see the design-pillar asymmetry below). The AC gate (F017.1) still blocks Done independently.
- **Every tick carries evidence** — a tool-result, a value, or a Lens run id. Never
  tick an AC or pass a check you didn't prove ("aldrig påstå noget virker uden bevis").
- **$0, local, all five pillars.** No metered API, no billed harness, no `ultrareview`.
- **The design pillar is the one place `flagged` does NOT block.** `failed` (drift rose)
  blocks; `flagged` (drift at or below baseline) is advisory. That asymmetry is what lets
  the pillar exist at all — 152 pre-existing off-token values would otherwise turn every
  card red on day one, and a gate switched off on day one still looks like coverage.
  For every OTHER pillar, `flagged` still blocks.
- **The fix loop is bounded.** Auto-fixing on a failed pass is allowed (F095.11), but ONLY
  while `escalate === false`. The moment `fix_rounds ≥ max_fix_rounds`, stop and hand to
  the human — never loop past the cap. Always re-`cardmem_card_verdict` after a re-handoff;
  never assume a fix worked without re-running the checks ("aldrig påstå noget virker uden bevis").
- **Manual AC + subjective calls stay with the human.** A `kind:manual` AC is never
  auto-ticked or auto-fixed — surface it. Christian owns anything the checks can't prove.

## Dogfood

The first real run is `/auto-review` over **F095's own cards** — the epic reviews
itself. Then it sweeps the rest of the Review column, converting handed-off work
into evidence-backed Done flips (or surfacing what's actually unfinished).
