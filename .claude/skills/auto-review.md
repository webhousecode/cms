---
name: auto-review
description: The Full Auto Review gate (F095). Walk the Review column and, per card, run all four checks LOCALLY ($0) — Lens (visual) + AC (contract) + code-review + security-review — aggregate via cardmem_card_verdict, and flip Review→Done ONLY when ready_for_done, attaching a review report. A card with any failed/flagged check stays in Review with its findings. Never flips without all-green + evidence.
argument-hint: "[F<n>]  (omit to sweep the whole Review column)"
---

# /auto-review [F<n>]

Run the Review→Done gate. With an F-number, review that one card; with no
argument, sweep every card in the **Review** column. **Everything runs locally
on the Max-plan — $0.** No metered API, no billed `/code-review` harness, no
`ultrareview`.

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

5. **Aggregate + decide** — `cardmem_card_verdict({card_id_or_slug})`:
   - `ready_for_done === true` → `cardmem_review_report({card_id_or_slug})` to attach
     the evidence bundle, then move the card to **Done**
     (`cardmem_move_card` / `cardmem_handoff_card` per the repo's flow). The report is
     the proof behind the flip.
   - `ready_for_done === false` → **leave the card in Review.** Summarise the failing
     checks + findings (so a human or a follow-up `/auto-review` can act). Never flip.

## Hard rules

- **Never flip a card to Done without `ready_for_done === true`** — i.e. AC gate
  satisfied AND code + security passed AND any recorded lens/ac passed AND nothing
  failed/flagged. The AC gate (F017.1) still blocks Done independently.
- **Every tick carries evidence** — a tool-result, a value, or a Lens run id. Never
  tick an AC or pass a check you didn't prove ("aldrig påstå noget virker uden bevis").
- **$0, local, all four pillars.** No metered API, no billed harness, no `ultrareview`.
- **Propose, don't override the human.** For anything subjective or `manual`, surface
  it; Christian owns the final flip. `/auto-review` does the proven 80%, not the judgment call.

## Dogfood

The first real run is `/auto-review` over **F095's own cards** — the epic reviews
itself. Then it sweeps the rest of the Review column, converting handed-off work
into evidence-backed Done flips (or surfacing what's actually unfinished).
