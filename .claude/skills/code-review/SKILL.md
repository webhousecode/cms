---
name: code-review
description: Review a card's code change locally ($0, Max-plan) — read the diff, judge it against the plan-doc + AC + CLAUDE.md conventions, and record structured findings via cardmem_record_review(type:code). The "code" pillar of Full Auto Review (F095). YOU are the reviewer — no metered API, no /code-review harness, no ultrareview.
argument-hint: "F<n> | <global-slug>"
---

# /code-review F<n>

Review the code behind a single card and record the verdict. **You** (this cc
session, on the Max-plan) are the reviewer — this costs **$0**. Do **not** call
any metered LLM API, the billed `/code-review` cloud harness, or `ultrareview`.
That is the whole point of F095.

## Steps

1. **Load the card.** `cardmem_get_card({card_id_or_slug: "<F-number>"})` → read its
   `plan_md` (the contract), `task`/`role`/`constraints`, and `acceptance_criteria`.
   The review judges the diff *against this card's stated intent*, not in a vacuum.

2. **Get the diff** (local — never a cloud fetch). In the repo, find the change set:
   - Commits that reference the card: `git log --oneline -20 --grep "<F-number>"`.
   - Diff them: `git diff <oldest-1>..<newest>` for those commits (or the card's
     `agent/F<n>` branch vs `main` if it landed on a branch), e.g.
     `git --no-pager diff <base>..HEAD -- <changed paths>`.
   - If nothing references the F-number, fall back to the working tree / last commit
     and say so in the summary. Cap very large diffs (>~2000 lines) — review the
     highest-signal files and note in the summary that coverage was bounded.

3. **Review against the rubric.** Read the diff and judge:
   - **bug** — logic errors, off-by-one, wrong condition, unhandled null/promise.
   - **error-handling** — missing try/catch on real failure paths, swallowed errors,
     empty catch blocks (a CLAUDE.md "no quick-fix" violation).
   - **architecture** — wrong layer, duplicated logic, abstraction that fights the
     codebase, hardcoded value that should be one-source (CLAUDE.md rule).
   - **dead-code / naming / style** — vestigial code, misleading names, drift from
     surrounding style.
   - **test-coverage** — a claim of "works" with no test/runtime evidence (the
     "aldrig påstå noget virker uden bevis" rule).
   - **convention** — CLAUDE.md violations: native dialogs/`<select>`, missing
     `data-testid` on interactive UI (F086), API-heavy where Max-plan/local fits,
     secrets inline, destructive ops without order.
   Skip anything the plan-doc's Open Questions / Out-of-scope already addresses.

4. **Decide the status.**
   - `passed` — no error/warning findings (info-only or clean).
   - `flagged` — one or more should-fix (warning) or blocks-merge (error) findings.
   - `failed` — you could not review (build broken, diff unreadable) — rare.

5. **Record it.** Call:
   ```
   cardmem_record_review({
     card_id_or_slug: "<F-number>",
     type: "code",
     status: "passed" | "flagged" | "failed",
     summary: "<1-line headline: 'clean' / '2 findings: 1 error, 1 warning'>",
     findings: [
       { file, line_start, line_end, severity: "info"|"warning"|"error",
         category, message, suggestion? }
     ],
     evidence: "<diff range, e.g. abc123..def456, + files reviewed>"
   })
   ```

## Rules

- **$0, local, you-are-the-reviewer.** No metered API, no cloud harness, no `ultrareview`.
- **Specific over general** — point at exact `file:line`. Max ~10 findings, highest-signal first.
- **Don't fix here** — record findings only. `/auto-review` (or a human) decides what to repair.
- This skill records the **code** pillar; the gate (`cardmem_card_verdict`) needs
  `code` + `security` passed (+ Lens/AC) before a card is `ready_for_done`.
