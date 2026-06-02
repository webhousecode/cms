# `data-testid` convention — the Lens verification contract

> Verification is a **contract between the code and Lens**, never a guess from
> the outside. A `data-testid` is the stable anchor a visual AC points at. This
> is the strict, preferred mode — inferred CSS/text selectors are a fallback,
> not the norm. (Lens = F074; enforcement = F074.7 audit gate + F073 AC-gate.)

## Why testids, not CSS/text selectors

- **Stable across refactors.** A class name or DOM path changes when you restyle
  or restructure; a `data-testid` is an explicit promise that survives both.
- **Unambiguous.** `[data-testid="board-column-ready"]` names exactly one thing.
  `.flex.gap-2 > div:nth-child(3)` names whatever happens to be third today.
- **Greppable.** `lens testid-inventory` scans the repo and lists every anchor,
  so the manifest and the audit gate both know what exists.

## Naming

`data-testid="<area>-<thing>[-<qualifier>]"` — lowercase, hyphen-separated, no
spaces, stable.

| Pattern | Example | Use |
|---|---|---|
| `<route>` | `board`, `reader`, `inbox` | the route shell / page root |
| `<route>-<region>` | `board-column-ready`, `reader-toc` | a named region within a route |
| `<component>-<role>` | `card-detail-title`, `project-switcher-trigger` | a component's key part |
| `<component>-<role>-<id>` | `card-row-F074.5` | one instance in a list (id suffix) |

Rules:

1. **Interactive elements that an AC verifies MUST have a testid** — buttons,
   inputs, toggles, the thing a feature is "about". The F074.7 audit flags an
   interactive element with no testid; a visual AC cannot pass its gate without
   its anchor.
2. **Lowercase + hyphens only.** Match the route/component name already in the
   codebase. No `camelCase`, no spaces.
3. **Stable, not incidental.** Don't encode styling or position. `card-detail-save`,
   never `card-detail-blue-button-2`.
4. **One per concept.** Don't reuse the same testid on multiple distinct
   elements — it breaks element-mode capture (Lens takes `.first()`).

## SSR / Preact notes

- **Preact passes `data-*` through verbatim** — `data-testid` lands on the real
  DOM node exactly as written (same as React). No camelCase conversion; the
  attribute is literally `data-testid`.
- **Hydration-stable.** Put the testid on the element that exists in *both* the
  server-rendered HTML and the hydrated tree, so a capture taken before/after
  hydration anchors the same node. Avoid putting it only on a node a client-only
  branch renders.
- **Conditional render gates.** If a region appears after data loads, give the
  surface a `waitFor` (the testid selector) in `lens.manifest.json` so Lens waits
  for the node before shooting — don't shoot an empty shell.
- **Lists.** Suffix the testid with a stable id (`card-row-<f_number>`), never the
  array index (re-orders break the anchor).

## How Lens uses it

- **Element capture** (`mode: "element"`, `selector: "[data-testid=…]"`) crops the
  screenshot to exactly that node — the preferred, stable capture mode.
- **`lens.manifest.json`** lists each surface with its `selector` (a testid),
  `captureMode`, `waitFor`, `baseline_key`, and an optional `assert`. One
  `lens_capture_catalogue` / `POST /lens/catalogue` call photographs + verifies
  the whole surface.
- **`assert.js`** can target a testid for a DOM measurement, e.g.
  `return { pass: document.querySelector('[data-testid=cta]').getBoundingClientRect().width > 120 }`.

## Inventory

```
POST 127.0.0.1:7475/lens/testid-inventory  { "local_path": "<repo>" }
```

Returns every `data-testid` in the repo's source with counts + files — the
auto-discovery feed for authoring a manifest and for the audit gate.
