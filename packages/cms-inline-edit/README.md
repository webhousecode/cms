# @webhouse/cms-inline-edit

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
import { initInlineEdit } from "@webhouse/cms-inline-edit";

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
import { saveInlineEditField, verifyEditSession } from "@webhouse/cms-inline-edit/server";
```

See `docs/features/F157-inline-editing.md` in the [@webhouse/cms](https://github.com/webhousecode/cms) repo for the full design.
