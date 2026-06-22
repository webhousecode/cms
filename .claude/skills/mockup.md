---
name: mockup
description: Generate a self-contained HTML mockup of an idea, epic or card — knowing THIS repo's design tokens — and save it to cardmem via cardmem_save_mockup so it shows up in the Mockups gallery, cross-linked to its source. Use when the user wants to SEE a proposal before you build it ("mock this up", "vis mig hvordan det ser ud", "lav en mockup af F<n>"), or to iterate a new version of an existing mockup. The design-first gate before code (F122).
---

# mockup — cc-generated visual proposals (F122)

A **mockup** is a single self-contained HTML file that visualizes an idea, epic
or card *before* it's built. You generate it (you know the repo's CSS + design
traditions); cardmem stores it, renders it sandboxed, cross-links it to its
source, versions it, and routes it through approve → promote → build. This is the
"show me before you build it" loop, made first-class.

## When to reach for this

- The user wants to **see** a proposal before committing to the build
  ("mock it up first", "hvordan kommer det til at se ud").
- You're about to build something visual and want a cheap approval gate.
- The user asks to **iterate** an existing mockup (a new version).

Do NOT use it for backend-only work, or as a substitute for the `feature` skill
(planning) — a mockup is the *visual* artifact, the plan-doc is the *spec*.

## The hard rule — self-contained HTML only

The mockup renders in a **sandboxed iframe** (`sandbox="allow-scripts"` — inline
JS runs, but in a null origin with no access to cardmem's cookies/DOM). So the
HTML MUST be self-contained:

- **Inline `<style>` only.** No `<link rel="stylesheet" href="http…">`.
- **Inline `<script>` IS allowed and RUNS** — so mockups can be interactive
  (theme toggles, filters, tabs, JS-rendered grids). Keep it inline.
- **No external `<script src="http…">`** (rejected — bundle/inline it instead).
- **No remote `@import`.** Inline every token + font fallback you need.
- Remote `<img>` is tolerated but avoid it — prefer inline SVG / CSS shapes /
  data-URIs so the mock is portable and renders offline.

`cardmem_save_mockup` **rejects** HTML that pulls an external script/stylesheet/
`@import`. If it throws "must be self-contained", inline the offending resource.

## Step 1 — learn THIS repo's design

Before writing markup, ground the mock in the repo's real look so it reads as
*this product*, not a generic wireframe:

1. Read `CLAUDE.md` → the `## Project layout` table + any design section.
2. Read `docs/design-references/` (if present) — visual refs + existing mock
   HTML you can copy tokens from (e.g. `logo-neutral-mock.html`).
3. Pull the **CSS variables** from the app's stylesheet (`globals.css` /
   `styles.css` / `@theme` block): colors, fonts, radii, spacing. Inline those
   exact values into the mock's `<style>` so it matches the live palette.

A good mock reuses the repo's `--color-*`, serif/mono font stacks, border radii
and card chrome — it should look like a real screen of the app.

## Step 2 — generate the mockup

Write ONE `<!doctype html>` file: `<head>` with an inline `<style>` block
carrying the repo tokens, `<body>` with the proposed screen. Keep it ~5–15 KB.
It can be a static visual OR interactive — inline `<script>` runs in the
sandbox, so add toggles / filters / tabs when they make the proposal clearer.
Show realistic content, not lorem ipsum.

## Step 3 — save it to cardmem

```
cardmem_save_mockup({
  project_id,                       // the active project
  source_type: "idea"|"epic"|"card"|"standalone",
  source_id,                        // the idea.id or card.id it proposes a design for (omit for standalone)
  title: "<short name>",
  html: "<the full self-contained HTML>"
})
```

Returns `{ mockup_id, version, url }`. Tell the user the viewer URL
(`/mockups/<id>`) so they can open it. It now appears in the **Mockups** gallery
and in the source card/epic's "Mockups (N)" section.

## Step 4 — iterate (new versions)

When the user asks for changes, DON'T create a new mockup — append a version to
the same one so the timeline + visual diff stay intact:

```
cardmem_save_mockup({ mockup_id, project_id, source_type, title, html, changelog: "what changed" })
```

`current_version` bumps; the viewer's version timeline + side-by-side / swipe
diff let the user compare iterations.

## Step 5 — the workflow after approval

- The user sets status in the viewer: `proposed → approved / changes / rejected`.
- On **approve**, they (or you) can **Promote → build card**
  (`cardmem_promote_mockup`) — the mockup becomes that card's visual spec
  ("build THIS"). The build card lands in Backlog linked back to the mockup.
- Feedback lives on the mockup as notes (`cardmem_add_mockup_note`).

## Tools

| Tool | Purpose |
|---|---|
| `cardmem_save_mockup` | Create a mockup (v1) or append a version. Pass inline `html` for small ad-hoc mockups, OR **`html_url`** (a public raw URL of a committed mockup file) for a large/generated one — the server fetches it, so the HTML never shuttles through your context (token-frugal + drift-proof: re-save the same URL to refresh). |
| `cardmem_list_mockups` | Gallery list / a source's mockups. |
| `cardmem_get_mockup` | One mockup: versions + notes + source. |
| `cardmem_set_mockup_status` | proposed → approved / changes / rejected. |
| `cardmem_add_mockup_note` | Feedback thread. |
| `cardmem_promote_mockup` | Approved mockup → build card (visual spec). |

## Don'ts

- Don't reach for raw HTML files on disk as the deliverable — the mockup lives in
  cardmem (so it's cross-linked + versioned + reviewable). Save it. **HARD RULE
  (F122):** a design proposal that isn't saved via `cardmem_save_mockup` doesn't
  count — a loose `.html`/screenshot goes stale + invisible. For a big generated
  mockup, commit it + pass `html_url` (don't paste 75KB through your context).
- Don't pull external CSS/JS/fonts — inline everything (the sandbox is strict).
- Don't invent a new mockup for an iteration — append a version.
- Don't skip the source ref — the cross-link back to the idea/epic/card is the
  point. Use `standalone` only when there genuinely is no source.
