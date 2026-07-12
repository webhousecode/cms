# F162 — Inline-edit coverage enforcement

> **Goal:** every @webhouse/cms-powered site is *provably* 100% customer-editable inline, enforced automatically in CI on every change — not discovered reactively by a human clicking around (which is how the F157/F003 rollout has worked so far, and how the broberg header/lead gaps surfaced on 2026-07-12).

## Motivation

Today, wiring a rendered text element to a CMS field is 100% manual, field-by-field: a dev threads a `CmsRef` and spreads `cmsAttrs`/`cmsHtmlAttrs` per string. Forgetting one is invisible — no compiler error, no test, no CI gate. Two silent failure modes look identical to all tooling: (a) a hardcoded string with no CMS field at all, and (b) a CMS-backed field that was never tagged so it's editable only in the admin doc-editor, not inline. Gaps are found by a human noticing an element won't highlight in edit mode. That does not scale and always leaves holes.

Christian's product promise: **every customer site is 100% customer-editable, inline, with zero developer intervention.** This epic makes that promise *enforceable* instead of aspirational.

## The two gates (Christian's scope decision, 2026-07-12: BOTH)

**Gate A — "all rendered CMS text is editable inline"** (framework-agnostic, tool ready today)
Run `computeCoverage(html, schema)` (from `@broberg/lens-engine@0.4.0`, built by components, F056) on each built page → diff `[data-cms-field]`-tagged elements against `webhouse-schema.json` → `missing[]` = fields that cannot be edited inline = CI failure. Works identically on Preact (broberg) and Next.js (Sanne) because it reads server-rendered attributes in the fetched HTML.

**Gate B — "no hardcoded strings"** (per-stack source lint, heavier → phase 4)
A source lint that catches user-visible text literals in templates that aren't wired to CMS at all. Framework-specific (Preact vs Next.js each need their own rule) and higher false-positive risk, so it ships after Gate A is green.

## Architecture & ownership

| Part | Owner | Status |
|---|---|---|
| Coverage engine `computeCoverage(html, schema)` / `coverage(url, schema)` | components / `@broberg/lens-engine` | ✅ live (0.4.0) |
| `cms coverage` CLI (parse `webhouse-schema.json` → engine's `CoverageSchema`, build+serve site, scan, exit non-zero on missing) | **cms** (`@webhouse/cms-cli`) | this epic |
| Reusable CI workflow + rollout into all site-repos | **cms** | this epic |
| Token-safe save mode (`data-cms-token-safe`) | **cms** (`@broberg/cms-inline-edit`) | this epic |
| Gate B per-stack source lint | **cms** | this epic (phase 4) |
| Allowlist of intentionally-static / excluded fields | per site-repo | — |

**Key ownership fact (confirmed 2026-07-12, cardmem #17393):** the coverage engine lives in Lens (components) — cms does NOT re-roll it. But getting the CI gate into every site-repo is **cms's** job, NOT cardmem's F057 propagation (F057 only propagates canonical CLAUDE.md sections + skills, not CI workflows). The interactive `lens_coverage` MCP tool (cardmem F236.2, authed-prod path) is paused and is NOT the CI vehicle — it does not block this epic. The CI path needs neither daemon nor auth: `computeCoverage()` is a pure Node function over fetched HTML.

## How the gate runs in CI

Build the site → serve it locally → for each page: fetch HTML → `computeCoverage(html, schema)` → **fail only when the change adds NEW gaps** ("no new gaps" delta model, same as the F086 testid-gaps gate — otherwise it nags on pre-existing debt and gets ignored). A per-repo `coverage-allowlist` file holds the intentionally-static / intentionally-excluded fields.

## The allowlist — intentionally-excluded is not a gap

Some fields must NOT be inline-editable, and that is correct, not a hole:
- **SEO meta text** (lead/manchet, excerpt): stored plain because it IS the meta description — a rich toolbar there would leak markup into search results (established 2026-07-12, the broberg lead/excerpt revert).
- **alt text, aria labels, legal/config strings**, a deliberately static badge, etc.
- **Auto-token fields** (see dependency below): e.g. Sanne's `"{år} års erfaring"`. Christian's explicit order 2026-07-12: `{år}`/`{antal}` MUST NOT be changed — these fields stay unmarked/untouched until he says otherwise.

The allowlist reports these transparently as *intentionally excluded* (counted separately, never hidden), so "100%" means "100% of what SHOULD be editable."

## Dependency: token-safe save (raised by sanne #17395)

Some CMS fields store auto-resolve tokens expanded at render time (`"{år} års erfaring"` → `"26 års erfaring"`). Plain inline-edit saves the *rendered* `textContent` → overwrites and permanently destroys the token. So those fields are deliberately unmarked today (F035 safe-default). "100% editable" eventually requires they be editable *without killing the token* → a token-safe save mode in the package (which cms owns) is a **prerequisite** for Gate A to demand coverage of token fields. This is harder than "diff and re-insert": the real challenge is **re-alignment** — mapping edited rendered text back to the template (`"26 års erfaring i kropsterapi"` → `"{år} års erfaring i kropsterapi"`), robust against the expansion value appearing elsewhere. Leaning toward explicit `data-cms-token-safe="true"` + a render-supplied token-map (not fragile auto-detection). Activation is per-site opt-in and, for Sanne, awaits Christian's explicit word (his current order is "don't touch them").

## Rollout (Christian's decision: reusable workflow + per-repo stub)

One central reusable GitHub workflow holds the logic; each site-repo carries a ~3-line stub that references it — logic lives in one place, no copy drift. New sites are born with the stub via the scaffolder (`create-@webhouse/cms`). Existing sites get the stub + allowlist rolled out by cms. Ships as **warn** first, then flips to **block**.

## Phases

1. **F162.1** `cms coverage` CLI on top of `computeCoverage()`.
2. **F162.2** Baseline coverage report for broberg + Sanne (see the real gaps).
3. **F162.3** Token-safe save mode in `@broberg/cms-inline-edit` (unlocks token fields; activation per-site opt-in).
4. **F162.4** Reusable CI workflow + rollout (warn → block; scaffolder for new sites).
5. **F162.5** Gate B per-stack "no hardcoded strings" lint.

## Dependencies / preconditions

- Each site commits `webhouse-schema.json` and keeps it in sync with `cms.config.ts` (already a repo Hard Rule).
- The site must be buildable + servable in CI (fetch each page's HTML).

## Non-goals (v1)

- Image/media coverage; translation coverage; authed-prod scanning (that's the paused cardmem F236.2, a separate path). Coverage is for visible text fields.
