# The 3-gate quality standard — provably editable @webhouse/cms sites

**Audience:** any agent (cc/oc) building a new @webhouse/cms site, or upgrading an
existing one to inline editing + pure CMS editing.

**Goal:** make it *impossible* to ship a page where a visitor sees text that isn't
in the CMS, or CMS content that a client can't click-to-edit. Three deterministic
CI gates (NO LLM) enforce it. A red gate blocks deploy — back to development until
green. Both reference sites run all three: **broberg.ai** (Preact + Hono, bun) and
**sanneandersen** (Next.js, pnpm).

The single shared tool is **`@webhouse/cms-cli`** (`cms check-text`,
`cms check-editable`, `cms coverage`). Never hand-roll a per-site copy of these
scans — that is drift. Extend the tool if it's missing something.

---

## The three gates

| Gate | Command | What it proves | When | Model |
|---|---|---|---|---|
| **B** | `cms check-text` | No user-visible hardcoded text in `src/` outside the CMS | pre-deploy | allowlist (no NEW hardcoded text) |
| **A.1** | `cms check-editable` | Every visible line a visitor reads sits in a `[data-cms-field]` | post-deploy | strict (0 gaps) |
| **A.2** | `cms coverage` | Every rendered CMS *schema* field is inline-editable | post-deploy | baseline (no NEW gaps, F086) |

**Why both A.1 and A.2?** A.2 is schema-driven and unions per document — a field
editable on *any* page counts as covered, so a field rendered non-editably on one
specific page slips through. A.1 is DOM-driven and schema-independent — it catches
exactly that. They are complements; run both. (This blind spot was found live on
broberg: 8 real pages were 100% editable under A.2, while A.1 surfaced 12 unbuilt
placeholder routes A.2 was blind to.)

---

## 1. Install the tool

```bash
# in the workspace that owns the site
pnpm add -D @webhouse/cms-cli@^0.4.23 @broberg/lens-engine@^0.4.0   # or: bun add -d …
```

- `@webhouse/cms-cli` provides all three commands. `check-editable` bundles its DOM
  parser (`node-html-parser`) — works out of the box.
- `@broberg/lens-engine` is an **optional peer** used only by `cms coverage` (A.2).
  Install it in the coverage job; set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` (the
  engine is pure jsdom, no browser needed).

## 2. Let the SITE own its page list — `--sitemap`

**The site must expose a real `sitemap.xml`, and the gates discover pages from it.**
Do NOT hand-maintain a `--pages` list — that is exactly how phantom/duplicate slugs
creep in and how real pages get silently missed. The site already knows every URL it
serves (its router + i18n + CMS content); make it emit that as `sitemap.xml`, and
point the gates at it:

```jsonc
"gate:editable": "cms check-editable --sitemap https://YOUR-SITE/sitemap.xml",
"gate:coverage": "cms coverage --schema .cms-coverage-schema.json --sitemap https://YOUR-SITE/sitemap.xml --ignore … --baseline .cms-coverage-baseline"
```

`--sitemap` fetches the sitemap, reads every `<loc>`, and scans them all — a sitemap
index is followed one level deep. The list is always current: publish a new page and
the next gate run covers it automatically. `--pages <csv>` + `--url <base>` remains as
a manual override for the rare page not in the sitemap.

**Your sitemap must be built from ONE source of truth** — the same enumeration your
site uses to render its own links (never a second hand-list):

- **File-based router (Next.js):** `app/sitemap.ts` via `cmsSitemap` from
  `@webhouse/cms/next`, or walk the App Router tree. (sanne.)
- **Programmatic router (Hono/Express):** one exported `siteIndexGroups()`/enumerator
  that both the human site-index AND `/sitemap.xml` consume, so they can never drift.
  (broberg's `src/sitemap.ts` reuses `siteIndexGroups()` from `routes.tsx`.)

If `sitemap.xml` is missing or serves a placeholder, that is itself a bug (SEO + gate
coverage) — fix it first.

## 3. Wire the three scripts

```jsonc
// package.json
"scripts": {
  "gate:text":     "cms check-text --dir src --allowlist .cms-check-text-allowlist",
  "gate:editable": "node scripts/gate-editable.mjs",   // bun scripts/… on bun
  "gate:coverage": "node scripts/gate-coverage.mjs"
}
```

`gate-editable.mjs` (A.1) and `gate-coverage.mjs` (A.2) are thin wrappers that
import `publicRoutes()` and `spawnSync` the CLI, propagating its exit code:

```js
// scripts/gate-editable.mjs
import { spawnSync } from "node:child_process";
import { publicRoutes } from "./lib/public-routes.mjs";
const URL = process.argv[2] || process.env.COVERAGE_URL || "https://YOUR-SITE";
const res = spawnSync("cms",
  ["check-editable", "--url", URL, "--pages", publicRoutes().join(",")],
  { stdio: "inherit" });
process.exit(res.status ?? 1);
```

```js
// scripts/gate-coverage.mjs
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { publicRoutes } from "./lib/public-routes.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const URL = process.argv[2] || process.env.COVERAGE_URL || "https://YOUR-SITE";
// IGNORE = structural / non-prose fields edited in cms-admin, not inline:
const IGNORE = "metaTitle,metaDescription,ogTitle,ogDescription,siteName,siteTitle,siteDescription,navCtaUrl,ctaPrimaryUrl,ctaSecondaryUrl,contactEmail,order,readTime,url,label";
const res = spawnSync("cms", ["coverage",
  "--schema", join(ROOT, ".cms-coverage-schema.json"),
  "--url", URL, "--pages", publicRoutes().join(","),
  "--ignore", IGNORE, "--baseline", join(ROOT, ".cms-coverage-baseline")],
  { stdio: "inherit" });
process.exit(res.status ?? 1);
```

## 4. Commit the schema snapshot + baselines (so CI needs no token)

```bash
# one-time: snapshot the schema (webhouse.app returns typed fields; needs a wh_ token ONCE)
curl -H "Authorization: Bearer $WH_TOKEN" \
  "https://webhouse.app/api/schema?site=<siteId>" -o .cms-coverage-schema.json
```

- `.cms-check-text-allowlist` — accepted hardcoded chrome (nav/aria/loading/editor
  UI). Build it conservatively: **anything that looks like real public content does
  NOT go on the list — it goes in the CMS.**
- `.cms-coverage-baseline` — accepted `collection/field` gaps today (F086: only a
  NEW gap fails). Comment each entry (empty field / SEO-meta / HTML field / etc.).
- `.cms-coverage-schema.json` — committed so CI runs without a CMS token.
- `.cms-editable-baseline` (optional, A.1) — if some pages aren't inline-wired yet
  (Phase-2 detail pages, placeholders), list their paths and pass
  `cms check-editable --baseline .cms-editable-baseline`. A trailing `/` accepts a
  path's descendants (`/behandlinger/`), an exact path accepts one page (`/om`).
  Gaps on any OTHER page still fail — so you cover the whole sitemap now and wire the
  rest incrementally (remove a line when its page is wired → it goes strict again).

## 5. CI job shape (gate → deploy → coverage)

```yaml
jobs:
  gate:            # pre-deploy, BLOCKS deploy
    steps: [ checkout, install, typecheck, build, "run gate:text" ]
  deploy:
    needs: gate    # red gate = no deploy (no naked cutover)
    steps: [ "deploy your way" ]
  coverage:        # post-deploy — scans the just-deployed live site
    needs: deploy
    env: { PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1" }
    steps:
      - checkout; install
      - run: sleep 10               # let the new version go live
      - run: "run gate:editable"    # A.1 — 0 visible-text gaps
      - run: "run gate:coverage"    # A.2 — no new schema gaps
```

Deploy stays stack-specific (pnpm/bun, Fly/Pages/Docker) — the gates don't care.

## 6. The rendering contract (what makes a field editable)

An element becomes inline-editable by carrying:

```html
<h1 data-cms-collection="sections" data-cms-slug="home" data-cms-field="heading">…</h1>
```

- Wire the attributes only when the field **has a value** (conditional render) —
  A.2's baseline accepts empty/unrendered fields; A.1 only sees what's actually on
  the page.
- **Excluded by design:** richtext/HTML fields (`dangerouslySetInnerHTML`) — editing
  rendered HTML back to source Markdown is lossy. Baseline them.
- **Token fields** (`{year}`-style, e.g. "26 års erfaring") must NOT be naively
  inline-editable (a plain save freezes the token). Pass their text to
  `check-editable --ignore-text "års erfaring,…"` so they're reported as
  intentional-excludes, never gaps. (Token-safe editing is a separate mode.)

## 7. Adoption checklist

- [ ] `@webhouse/cms-cli` + `@broberg/lens-engine` devDeps
- [ ] `scripts/lib/public-routes.mjs` single-source, imported by both A.1 + A.2
- [ ] `gate:text` + `gate:editable` + `gate:coverage` scripts
- [ ] `.cms-check-text-allowlist` (chrome only), `.cms-coverage-baseline`,
      `.cms-coverage-schema.json` committed
- [ ] CI: `gate` (pre-deploy, blocking) → `deploy` → `coverage` (A.1 then A.2)
- [ ] All three green on `main`; verified by running against the live site

> Missing something the CLI can't express? **Extend `@webhouse/cms-cli`** (open a
> card / tell the cms session) — never work around it with a bespoke script. The
> whole point of the standard is one shared implementation.
