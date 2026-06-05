---
name: security-review
description: Security-review a card's diff locally ($0, Max-plan) — secret-in-diff scan + OWASP-class review + dependency-audit — and record findings via cardmem_record_review(type:security). The "security" pillar of Full Auto Review (F095). YOU are the reviewer; no metered API, no billed harness.
argument-hint: "F<n> | <global-slug>"
---

# /security-review F<n>

Security-review the code behind a single card and record the verdict. **You**
(this cc session, Max-plan) do the reasoning — **$0**, no metered API, no billed
cloud harness, no `ultrareview`.

## Steps

1. **Load the card + diff.** Same as `/code-review`: `cardmem_get_card` for context,
   then the local diff for the card's commits (`git --no-pager diff <base>..HEAD`).
   Read the changed files — security review is about *what the change introduces*.

2. **Secret-in-diff pre-scan (cheap, do first).** Grep the diff for committed secrets:
   - `AWS_ACCESS_KEY_ID` / `AKIA[0-9A-Z]{16}`, `-----BEGIN .* PRIVATE KEY-----`
   - Bearer/API tokens, `pa_`/`pi_`/`uk_`/`sk_` keys, `password=`/`secret=` literals
   - A `.mcp.json` or `.env` with a real key being **added to git** (must be gitignored)
   Any hit → an `error` / `secret-leak` finding (this alone makes status `failed`).

3. **OWASP-class review** of the diff:
   - **injection** — unparameterised SQL/`sql\`...${userInput}\``, shell exec on
     user input, template injection.
   - **broken-auth / authz** — a route or tool that skips an auth check, a missing
     org/user scope on a query, an admin op without a role gate. (CLAUDE.md:
     `cb@webhouse.dk` must stay admin; never remove auth as a workaround.)
   - **sensitive-data exposure** — secrets/PII in logs, in API responses, in error
     messages; a non-gitignored config.
   - **SSRF / open redirect / path traversal** — unvalidated URL fetch, `../` in a
     file path from input, a sandbox escape.
   - **destructive ops** — `DROP TABLE`, `rm -rf`, mass `DELETE` without a `WHERE`
     excluding protected rows, `--force` push (CLAUDE.md destructive-command rule).

4. **Dependency audit** (only if the diff touches a lockfile):
   `pnpm audit --json` (or `npm audit --json`) — fold high/critical advisories into
   findings (`category: dependency-vuln`).

5. **Decide the status.** `failed` if any secret-leak or a critical exploitable issue;
   `flagged` for should-fix security findings; `passed` if clean.

6. **Record it.**
   ```
   cardmem_record_review({
     card_id_or_slug: "<F-number>",
     type: "security",
     status: "passed" | "flagged" | "failed",
     summary: "<1-line: 'clean' / '1 secret-leak (BLOCK)' / '2 OWASP findings'>",
     findings: [{ file, line_start, line_end, severity, category, message, suggestion? }],
     evidence: "<diff range + 'pnpm audit: 0 high' etc.>"
   })
   ```

## Rules

- **$0, local.** No metered API, no billed harness, no `ultrareview`.
- A **committed secret is always `error` + `failed`** — never downgrade it.
- Don't fix here — record findings; `/auto-review` or a human repairs.
- Records the **security** pillar; `cardmem_card_verdict` needs `code` + `security`
  passed (+ Lens/AC) before `ready_for_done`.
