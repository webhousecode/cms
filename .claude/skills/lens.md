---
name: lens
description: Verify + DRIVE a UI via the cardmem daemon's Lens engine — screenshot + baseline diff + DOM assert (F074), AND full E2E flows/manuscripts that navigate, fill, click, create records, and assert each step (F082). Use before moving a card with a visual or flow AC to Done, to author manuscripts, or to instrument a repo with data-testids. No Playwright in this repo — the daemon owns the browser.
---

# Lens — visual verification (cardmem daemon, F074)

Lens confirms a UI surface **looks + behaves right** before a card moves to Done.
The browser (Playwright/Chromium) lives in the **cardmem daemon** (`127.0.0.1:7475`),
not in this repo. You call it; it returns pass/fail + a screenshot, an optional
pixel-diff vs an approved baseline, and an optional DOM assertion.

## HARD RULE — Lens, never raw Playwright (F112)

For **ANY** browser automation — drive, screenshot, verify, or E2E-test a UI — you
MUST use Lens (this skill / the `cardmem-lens` MCP / the daemon). **Never write a raw
`playwright` / `puppeteer` / `chromium` script.** The daemon owns the browser, so
anything you could script locally with Playwright, Lens does **by proxy** — there is
no Playwright capability Lens cannot expose.

If Lens genuinely cannot do what you need 100%, that is **not** a licence to drop to a
one-off script — it's a Lens gap to close: **file a capability request to cardmem**
(`cardmem_capture_idea` tagged `lens-gap`, or ask the cardmem session via intercom),
get it built INTO Lens, then use it. Reaching for raw Playwright is a contract
violation (a PreToolUse hook will remind you at the moment of the reach). No exceptions.

**`data-testid` is the contract.** Anchor every verification on a stable
`[data-testid="…"]`, never a CSS/text guess. See `TESTID-CONVENTION.md`.

## When to use

- A card has a **visual AC** → `lens_verify` the surface, attach the result.
- Before Done on UI work → run the project's `lens.manifest.json` via `/lens/gate`.
- Regression-check after a UI change → re-run against approved baselines.

## How to call it

**Preferred — MCP tools** (the `cardmem-lens` server in this repo's `.mcp.json`):

```
lens_verify({
  project: "<this-project-slug>",
  url: "http://localhost:<dev-port>/dashboard",
  mode: "element",                       // viewport | fullPage | element
  selector: "[data-testid=\"dashboard-root\"]",
  baseline_key: "dashboard",             // omit for a render-only check
  assert: "return { pass: document.querySelector('[data-testid=cta]').offsetWidth > 120 }"
})
// → { status: "pass"|"fail"|"no-baseline"|"error", screenshot_url, diff_url, diff_ratio, assert_detail }
```

`lens_capture` (screenshot only), `lens_approve_baseline({ project, run_id, baseline_key })`,
`lens_capture_catalogue` (batch), `lens_list_runs` round out the visual surface.
For E2E: `lens_run_flow`, `lens_run_manuscript`, `lens_list_flow_runs` (see
**E2E flows** below).

**Or HTTP** (CLI/CI): `POST 127.0.0.1:7475/lens/verify` with the same body; the
whole-surface gate is `POST 127.0.0.1:7475/lens/gate { "local_path": "<repo>" }`.

## The manifest + the gate

Commit a `lens.manifest.json` at the repo root listing your surfaces:

```json
{
  "project": "<slug>",
  "base_url": "http://localhost:<dev-port>",
  "auth": { "adapter": "storageState", "stateEnv": "<PROJECT>_STORAGE_STATE" },
  "surfaces": [
    { "name": "landing", "path": "/", "mode": "viewport", "baseline_key": "landing", "auth": null },
    { "name": "dashboard", "path": "/dashboard", "mode": "element",
      "selector": "[data-testid=\"dashboard-root\"]", "baseline_key": "dashboard" }
  ]
}
```

`POST /lens/gate { local_path }` reads it, verifies every surface, cross-checks
each element selector's testid against the repo (a non-existent anchor is a hard
**block** — "a visual AC cannot pass without its anchor"), and returns one
`{ verdict: "green"|"red" }`. First run = `no-baseline`; approve a good shot, then
re-runs pixel-diff against it.

## E2E flows — manuscripts (F082)

Beyond screenshot+diff, Lens can **drive** the site: log in, navigate, fill
fields, create users, submit, and assert each step. A **flow** is a scripted
scenario; the daemon runs it in one authed page and returns a per-step report
(stops + pins a screenshot on the first failing step).

**Author a manuscript** (prose, not JSON) and run it via
`lens_run_manuscript({ project, manuscript })` or `POST /lens/manuscript`:

```
# flow: create-user
base: https://staging.<app>.com
mutates: true

- goto /signup
- fill [email] = alice@example.com
- select [role] = admin
- check [agree]
- click [submit]
- waitFor [toast]
- expectVisible [success]
- expectText [success] ~ Account created
- expectAbsent [error]
- assert: return document.title.length > 0
- screenshot after-submit
```

Rules: testids go in `[brackets]`; `=` sets a fill/select value, `~` an expected
text substring. Verbs: `goto click fill select check uncheck waitFor expectVisible
expectAbsent expectText assert screenshot`. **Bulk + parallel** via a loop block:

```
- loop parallel 4:
    data: [{"n":"Alice","r":"admin"},{"n":"Bob","r":"user"}]
    - goto /signup
    - fill [name] = {{n}}
    - select [role] = {{r}}
    - click [submit]
    - expectText [success] ~ Created: {{n}}
```

`{{field}}` substitutes per row; `parallel N` runs N iterations concurrently
(each in its own authed page). A failing iteration is reported per-item — it
doesn't abort the others. Resume a half-finished bulk run with `from: <index>`.

**Screenshot timing:** a `screenshot` step grabs whatever is on screen NOW. If a
route mounts its shell then hydrates data via async fetch, an `expectVisible` on
the root passes before the data lands — the shot catches a half-loaded page. Put
an `expectText [data-node] ~ <value>` (which polls until the substring appears)
BEFORE the `screenshot` step to guarantee hydrated content in the image.

**Run JSON flows directly:** `lens_run_flow({ project, flow, from? })` /
`POST /lens/flow`. A flow can also live in `lens.manifest.json` under a `flows[]`
block; `POST /lens/flow-gate { local_path }` runs every flow + cross-checks each
referenced testid against the repo inventory (a missing anchor is a hard block).

**Don't know where to start?** `POST /lens/propose-flow { local_path }` drafts a
candidate smoke-flow from your manifest routes + their `[data-testid]` anchors —
edit it into a real scenario. Mutating flows (`mutates: true`) should target a
test env or use a write-scoped `mintEndpoint`, never prod with a standing admin.

## Adding data-testids (the hidden selectors Lens drives)

Lens can only click/fill what it can anchor. Instrument the repo so every
**interactive** element + every **route root** carries a stable `data-testid`:

- **Route roots:** the top container of each page → `data-testid="<route>-root"`
  (`board-root`, `inbox-root`). The manifest surfaces + propose-flow key off these.
- **Controls a flow touches:** inputs, selects, checkboxes, buttons, toasts,
  success/error nodes → a semantic id (`email`, `role`, `submit`, `success`).
- **Naming:** kebab-case, semantic not positional (`save-card`, not `btn-2`).
  They're test/automation hooks — invisible to users, stable across restyles.
- **Audit what's missing:** `POST /lens/testid-inventory { local_path }` lists
  every testid in the repo; the cardmem audit flags interactive elements without
  one. Add ids first, then write the manuscript against them.

A flow's testids must all exist in the repo (the flow-gate enforces it), so the
loop is: add `data-testid`s → `propose-flow` or hand-write a manuscript →
`run` → fix → commit the flow to `lens.manifest.json`.

## Auth (authed routes)

The credential lives on the **daemon side**, never in the call. Mark **public**
surfaces `auth: null` (a logged-in visitor often gets redirected off them).
Three adapters, in order of how clean they are:

1. **`mintEndpoint`** (best — scoped, no standing credential). Your app exposes a
   protected endpoint that mints a SHORT-LIVED, READ-ONLY session and returns it
   as a storageState JSON. The daemon calls it just before each capture and
   discards the session after. Nothing standing on disk, nothing in the transcript.
   ```json
   "auth": { "adapter": "mintEndpoint",
             "url": "https://<app>/api/lens-session",
             "secretPath": ".lens/mint-secret" }
   ```
   The endpoint authes on `Authorization: Bearer <secret>` (a NARROW "mint a lens
   session" key, not an admin session) and returns
   `{ "cookies": [ { "name": "...", "value": "...", "domain": "...", "secure": true } ], "origins": [] }`.
   The secret comes from `secretPath` (a gitignored file, relative → repo root) or
   `secretEnv`.

2. **`storageState` via `statePath`** (good — a file, no env/restart). Generate a
   Playwright `storageState.json`, gitignore it, and point the manifest at it:
   ```json
   "auth": { "adapter": "storageState", "statePath": ".lens/storage-state.json" }
   ```
   A relative `statePath` resolves against the repo root. Use a read-only user if
   you can — a stored session cookie is a real credential.

3. **`storageState` via `stateEnv`** (legacy). Same JSON, but behind a daemon env
   var (`auth.stateEnv`). Note: `launchctl setenv` only reaches NEW daemon spawns,
   so this needs a daemon restart to inject — prefer `statePath` or `mintEndpoint`.

## Gotchas (learned dogfooding cardmem)

- `waitUntil` is `load`, not `networkidle` — an SPA with an open SSE/websocket
  never goes network-idle.
- **Self-referential surfaces** (a dashboard that displays the very runs you're
  generating) can't have a stable pixel baseline — use a render-check (omit
  `baseline_key`) or an `assert`.
- Dynamic data (lists, timestamps) drifts a pixel baseline — prefer an `assert`
  for those, or re-approve the baseline on intentional changes.

## Docs

Always-current API/MCP reference: `GET https://services.cardmem.com/api/lens/docs`
(no auth). Convention: `TESTID-CONVENTION.md` (scaffolded into this repo).
