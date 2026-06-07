---
name: auto-review
description: The Full Auto Review gate (F095). Walk the Review column and, per card, run all four checks LOCALLY ($0) — Lens (visual) + AC (contract) + code-review + security-review — aggregate via cardmem_card_verdict, and flip Review→Done ONLY when ready_for_done, attaching a review report. On any fail, fix the findings in-session and re-handoff to Review (the review→fix→re-review loop), bounded by the project's max-fix-rounds cap — then escalate to the human. Never flips without all-green + evidence.
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

2. **Lens** — verify the card's visual surfaces (the `verify_route`/`verify_selector`
   of its visual AC, or the repo's `lens.manifest.json` surfaces the card touched).
   `cardmem_record_review({type:"lens", status, summary:"<n surfaces, m green>",
   evidence:"<lens run ids>"})`. If the card has no UI, skip Lens (the verdict treats
   a missing lens row as non-blocking).

3. **Code review** — run `/code-review <F-number>` (records `type:"code"`).

4. **Security review** — run `/security-review <F-number>` (records `type:"security"`).

5. **Aggregate + decide** — `cardmem_card_verdict({card_id_or_slug})` returns
   `ready_for_done`, plus the fix-loop cap: `fix_rounds` (how many times this card has
   re-entered Review after a failed pass), `max_fix_rounds` (the project setting), and
   `escalate` (true when not ready AND the cap is reached). Branch on it:

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
  satisfied AND code + security passed AND any recorded lens/ac passed AND nothing
  failed/flagged. The AC gate (F017.1) still blocks Done independently.
- **Every tick carries evidence** — a tool-result, a value, or a Lens run id. Never
  tick an AC or pass a check you didn't prove ("aldrig påstå noget virker uden bevis").
- **$0, local, all four pillars.** No metered API, no billed harness, no `ultrareview`.
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
