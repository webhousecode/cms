# UI Screenshot Agent

Automated visual documentation for @webhouse/cms admin UI.

The agent captures screenshots of every significant UI surface, crops them to useful regions using Sharp, uploads them to the CMS media library, and optionally creates or updates a blog post/guide with the fresh images.

---

## How it works (the pattern established in session 2026-03-13)

### Dependencies

```bash
# Install into a temp working dir (not in the repo)
mkdir -p /tmp/screenshot-agent
cd /tmp/screenshot-agent
npm init -y
npm install playwright sharp
npx playwright install chromium
```

Neither dependency needs to live in the repo. They are installed on demand before the agent runs.

### Core primitives

```js
import { chromium } from '/tmp/screenshot-agent/node_modules/playwright/index.mjs';
import sharp from '/tmp/screenshot-agent/node_modules/sharp/lib/index.js';
import fs from 'fs';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
```

**Navigate and wait:**
```js
await page.goto('http://localhost:3010/admin/blocks', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500); // let animations settle
```

**Full viewport screenshot:**
```js
await page.screenshot({ path: '/tmp/my-screen.png' });
```

**Full page screenshot (scrolls entire page):**
```js
await page.screenshot({ path: '/tmp/my-screen.png', fullPage: true });
```

**Crop with Sharp — ALWAYS use Math.round() on coordinates:**
```js
await sharp('/tmp/source.png')
  .extract({
    left:   Math.round(x),
    top:    Math.round(y),
    width:  Math.round(w),
    height: Math.round(h),
  })
  .toFile('/tmp/cropped.png');
```

> Sharp crashes on float coordinates. `boundingBox()` from Playwright returns floats. Always round.

**Find an element and crop to its bounding box:**
```js
const el = page.locator('button:has-text("Save")').first();
const box = await el.boundingBox();
if (box) {
  const padded = {
    left:   Math.round(Math.max(0, box.x - 16)),
    top:    Math.round(Math.max(0, box.y - 16)),
    width:  Math.round(Math.min(1440, box.width + 32)),
    height: Math.round(Math.min(900, box.height + 32)),
  };
  await sharp('/tmp/source.png').extract(padded).toFile('/tmp/element.png');
}
```

**Upload to CMS media library (copy to uploads dir):**
```js
const UPLOADS = '/Users/cb/Apps/webhouse/webhouse-site/public/uploads';

function saveToUploads(srcPath, label) {
  const dest = `${Date.now()}-${label}.png`;
  fs.copyFileSync(srcPath, `${UPLOADS}/${dest}`);
  return `/uploads/${dest}`;
}
```

---

## Surfaces to document (full catalogue)

Each entry is: `{ url, waitFor, crops[] }`.

### Admin — Collections

| Surface | URL | Notes |
|---|---|---|
| Collection list | `/admin/posts` | Full page |
| Document editor — top | `/admin/posts/<slug>` | Crop top 700px |
| Editor toolbar | Same | Crop toolbar row only |
| Editor richtext body | Same | Scroll to content field, crop |
| Block type fields | `/admin/blocks/<slug>` | Shows dynamic fields per type |
| Blocks collection | `/admin/blocks` | Full page |
| New item dialog | `/admin/posts` → click + | Inline create UI |

### Admin — Sidebar & navigation

| Surface | Notes |
|---|---|
| Full sidebar | Left 240px of any admin page |
| Tab bar | Top 36px strip below nav |

### Admin — Media library

| Surface | URL | Notes |
|---|---|---|
| Grid view | `/admin/media` | Full page |
| List view | `/admin/media` → toggle | Full page |
| Lightbox | Click an image | Capture open lightbox |

### Admin — Special pages

| Surface | URL |
|---|---|
| Trash | `/admin/trash` |
| Preview iframe | `/admin/preview?url=...` |
| Link checker | `/admin/link-checker` |

### Site — Rendered output

| Surface | URL | Notes |
|---|---|---|
| Article page | `/blog/<cat>/<slug>` | Full + crop comparison, images |
| Comparison block | Same | Locate via `getByText()` |
| Notice block | Same | |
| Blog index | `/blog` | |
| Home page | `/` | Hero area crop |

---

## Naming convention

```
{timestamp}-{surface-name}.png
```

Examples:
- `1773359363029-blocks-list.png`
- `1773359412230-comp-block-fields.png`
- `1773359466037-site-comparison.png`

---

## Script template

Save as `scripts/screenshot-agent.mjs` and run with `node scripts/screenshot-agent.mjs`.

```js
import { chromium } from '/tmp/screenshot-agent/node_modules/playwright/index.mjs';
import sharp from '/tmp/screenshot-agent/node_modules/sharp/lib/index.js';
import fs from 'fs';
import path from 'path';

/* ─── Config ─────────────────────────────────────────────────── */
const ADMIN   = 'http://localhost:3010';
const SITE    = 'http://localhost:3009';
const UPLOADS = '/Users/cb/Apps/webhouse/webhouse-site/public/uploads';
const TMP     = '/tmp/cms-screenshots';

fs.mkdirSync(TMP, { recursive: true });

/* ─── Helpers ────────────────────────────────────────────────── */
async function shot(page, name, opts = {}) {
  const file = path.join(TMP, `${name}.png`);
  await page.screenshot({ path: file, ...opts });
  return file;
}

async function crop(srcFile, box, outName) {
  const out = path.join(TMP, `${outName}.png`);
  await sharp(srcFile).extract({
    left:   Math.round(Math.max(0, box.x ?? box.left ?? 0)),
    top:    Math.round(Math.max(0, box.y ?? box.top  ?? 0)),
    width:  Math.round(box.width),
    height: Math.round(box.height),
  }).toFile(out);
  return out;
}

async function save(file, label) {
  const dest = `${Date.now()}-${label}.png`;
  fs.copyFileSync(file, path.join(UPLOADS, dest));
  return `/uploads/${dest}`;
}

async function shotAndSave(page, name, label, opts = {}) {
  const f = await shot(page, name, opts);
  return save(f, label);
}

/* ─── Runs ───────────────────────────────────────────────────── */
const browser = await chromium.launch({ headless: true });
const ctx     = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const results = {};

// — Admin: blocks collection list —
const admin = await ctx.newPage();
await admin.goto(`${ADMIN}/admin/blocks`, { waitUntil: 'networkidle' });
await admin.waitForTimeout(1000);
results['blocks-list'] = await shotAndSave(admin, 'blocks-list', 'blocks-list');

// — Admin: comparison block editor —
await admin.goto(`${ADMIN}/admin/blocks/feature-comparison`, { waitUntil: 'networkidle' });
await admin.waitForTimeout(1500);
const full = await shot(admin, 'comp-block-full');
results['comp-block'] = await save(
  await crop(full, { x: 0, y: 100, width: 900, height: 650 }, 'comp-block'),
  'comp-block'
);

// — Admin: post editor with toolbar —
await admin.goto(`${ADMIN}/admin/posts/design-at-a-higher-altitude`, { waitUntil: 'networkidle' });
await admin.waitForTimeout(2500);
await admin.evaluate(() => window.scrollTo(0, 350));
await admin.waitForTimeout(400);
const editorFull = await shot(admin, 'editor-full');
results['editor-toolbar'] = await save(
  await crop(editorFull, { x: 270, y: 225, width: 820, height: 55 }, 'editor-toolbar'),
  'editor-toolbar'
);
results['editor-body'] = await save(
  await crop(editorFull, { x: 270, y: 220, width: 1130, height: 400 }, 'editor-body'),
  'editor-body'
);

// — Site: comparison block rendered —
const site = await ctx.newPage();
await site.goto(`${SITE}/blog/ai-dispatch/design-at-a-higher-altitude`, { waitUntil: 'networkidle' });
await site.waitForTimeout(1500);
const siteFull = await shot(site, 'site-article', { fullPage: true });
const compEl = site.getByText('Pixel precision').first();
if (await compEl.count() > 0) {
  const box = await compEl.boundingBox();
  if (box) {
    results['site-comparison'] = await save(
      await crop(siteFull, { x: box.x - 40, y: box.y - 40, width: 800, height: 320 }, 'site-comparison'),
      'site-comparison'
    );
  }
}

await browser.close();

console.log('Screenshot URLs:');
console.log(JSON.stringify(results, null, 2));
```

---

## Extending to a Claude Code agent

When this runs as a Claude Code agent (via `Agent` tool), the flow is:

1. **Detect what changed** — git diff of `packages/cms-admin/src/` since last run
2. **Map changed files to surfaces** — e.g. `media/page.tsx` changed → re-shoot Media Library surfaces
3. **Run Playwright** — headless, against running dev servers
4. **Upload screenshots** — copy to `public/uploads/`
5. **Update the relevant guide post** — find the post by slug, patch `content` to use new image URLs

### Surface → file mapping

```
packages/cms-admin/src/app/admin/media/         → media-library surfaces
packages/cms-admin/src/components/editor/        → editor toolbar + body surfaces
packages/cms-admin/src/components/tab-bar.tsx    → tab bar surface
packages/cms-admin/src/components/sidebar.tsx    → sidebar surface
packages/cms-admin/src/app/admin/blocks/         → blocks collection surfaces
packages/cms-admin/src/app/admin/trash/          → trash page surface
```

### Guide post → surfaces mapping

```
how-blocks-work        → blocks-list, comp-block, editor-toolbar, editor-body, site-comparison
(future) media-guide   → media-list-grid, media-list-view, media-lightbox, media-upload
(future) editor-guide  → editor-toolbar, editor-richtext-full, all block types rendered
```

---

## Prerequisites for running

Both dev servers must be running:
```bash
# Terminal 1
cd packages/cms-admin && pnpm dev

# Terminal 2
cd /Users/cb/Apps/webhouse/webhouse-site && pnpm dev --port 3009
```

Or run via Claude Code which can start them via Bash tool calls before running the script.

---

## Known gotchas

| Issue | Fix |
|---|---|
| Sharp crashes on float coordinates | Always `Math.round()` all values from `boundingBox()` |
| `networkidle` not enough for animated UI | Add `waitForTimeout(1000–2500)` after navigation |
| iframe pages (preview) won't screenshot inner content | Screenshot the outer admin page instead |
| Full-page screenshots have very tall height | Use `crop()` to extract the relevant region |
| Element not visible after scroll | Use `page.evaluate(() => window.scrollTo(0, Y))` then `waitForTimeout(400)` before screenshot |
| Dev server on wrong port | Check with `curl -s -o /dev/null -w "%{http_code}" http://localhost:3010` before running |
