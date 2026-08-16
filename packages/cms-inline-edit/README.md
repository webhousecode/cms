# @broberg/cms-inline-edit

Click-to-edit inline editing for live [@webhouse/cms](https://docs.webhouse.app)-powered sites. Copy-owned: each site installs this as a normal npm dependency and owns its own integration/version — no centrally-hosted script.

## Usage

Mark the plain-text elements a document's rendering code prints from CMS fields with `data-cms-collection` / `data-cms-slug` / `data-cms-field`:

```html
<h2 data-cms-collection="sections" data-cms-slug="hero-home" data-cms-field="eyebrow">
  Some CMS-sourced text
</h2>
```

Then, once per page load:

```ts
import { initInlineEdit } from "@broberg/cms-inline-edit";

initInlineEdit({
  cmsBaseUrl: "https://webhouse.app",
  siteId: "broberg-ai",
});
```

`initInlineEdit` looks for a `?cms_edit=<token>` URL param (minted by cms-admin's "Redigér live" button), persists it in `sessionStorage`, and — only when a token is present — makes every `[data-cms-field]` element click-to-edit, saving on blur directly against the CMS API.

Only plain text fields are supported. Do not attach these attributes to elements rendered via `dangerouslySetInnerHTML` (richtext/HTML fields) — not supported in this version.

## `./server` (optional)

Thin Node/Bun helpers for a site that wants a same-origin relay instead of the browser calling the CMS directly:

```ts
import { saveInlineEditField, verifyEditSession } from "@broberg/cms-inline-edit/server";
```

See `docs/features/F157-inline-editing.md` in the [@webhouse/cms](https://github.com/webhousecode/cms) repo for the full design.

## Links to a page (live references)

The toolbar's link button offers a **free URL** or **a page on the site**. A page
link stores a reference next to a real, working href:

```html
<a href="/da/om-sanne" data-cms-ref="sider:om-sanne" data-cms-ref-label="auto">Om Sanne</a>
```

Render it through `resolveCmsLinks()` and the link re-points itself when the page
moves or is renamed — nothing rewrites stored content:

```ts
import { resolveCmsLinks } from "@broberg/cms-inline-edit/server";

const html = resolveCmsLinks(renderMarkdown(doc.body), (collection, slug) => {
  const page = findPage(collection, slug);
  return page ? { url: page.path, title: page.title } : null;
});
```

`data-cms-ref-label="auto"` (set when the editor left the link text empty) also
follows the page's current title. An unknown reference keeps the href it has, so
a deleted page degrades to the last known link rather than a dead one — and a
site that never calls the resolver still ships working links.

The picker's page list comes from `GET /api/inline-edit/pages?site=<id>`
(published documents only).

## Markup in a PLAIN field — use `data-cms-token`

**Which save path a fix covers matters.** The serializer fixes in 0.4.21
(orphaned `<li>`) and 0.4.23 (top-level inline formatting, dropped images) live
in the **rich** path — a field marked `data-cms-richtext="true"`, serialised
through `htmlToMarkdown`.

A **plain** field is different: it saves `el.textContent`, and `textContent` has
no asterisks. So Markdown markup inside a plain field is lost on save, and
**0.4.23 does not change that.** If you are carrying a `data-cms-token`
workaround for markup in a plain field, KEEP IT after upgrading — it is not dead
code (reported by the sanneandersen session, 2026-08-17).

The supported way to keep markup in a plain field is `data-cms-token` on the
formatted segment, carrying the raw source:

```html
<span data-cms-token="**Alt fra Blad**"><strong>Alt fra Blad</strong></span>
```

`serializeTokenSafe()` round-trips those segments verbatim, so the stored value
keeps its `**…**` while the page shows the rendered form. Use the rich path
(`data-cms-richtext="true"`) when a field should support formatting generally.
