# F81 — Homepage Designation

> Explicit "Set as homepage" setting so the CMS knows which page maps to "/" — no more slug conventions.

## Problem

Today the CMS has no concept of "this page is the homepage". Preview, build scripts, and revalidation all use fragile slug conventions (`home`, `index`) scattered across multiple files:

- `document-editor.tsx` checks `slug === "home" || slug === "index"` for preview URL
- `F41` revalidation checks `slug === "index" || slug === "homepage"` for path computation
- `F42` boilerplate hardcodes `content/pages/home.json` as the homepage
- `F77` proxy middleware rewrites `/` → `/home.html`

This is undiscoverable (users don't know they must name their page "home"), fragile (renaming the slug breaks the site), and inconsistent (different parts of the codebase check different slugs).

Research shows only WordPress and Ghost enforce homepage designation among major CMS systems. All headless CMS (Strapi, Sanity, Contentful, Payload, Directus, Keystone) rely on conventions. We should do better.

## Solution

Add a `homepageSlug` setting to the site registry that explicitly designates which page document serves as the homepage. The admin UI provides a dropdown in Site Settings populated from the pages collection. All systems (preview, build, revalidation, proxy) read from this single source of truth.

## Technical Design

### Registry Extension

Add `homepageSlug` to `SiteEntry` in `packages/cms-admin/src/lib/site-registry.ts`:

```typescript
export interface SiteEntry {
  id: string;
  name: string;
  adapter: "filesystem" | "github";
  configPath: string;
  contentDir?: string;
  uploadDir?: string;
  previewUrl?: string;
  github?: SiteGitHub;
  revalidateUrl?: string;
  revalidateSecret?: string;
  homepageSlug?: string;        // ← NEW: slug of the page that maps to "/"
  homepageCollection?: string;  // ← NEW: collection name (default: "pages")
}
```

### Site Settings UI

In `packages/cms-admin/src/components/settings/general-settings-panel.tsx`, add a "Homepage" section:

```
┌─────────────────────────────────────────┐
│ HOMEPAGE                                │
│                                         │
│ Collection:  [Pages           ▾]        │
│ Page:        [Home — Welcome  ▾]        │
│                                         │
│ This page will be served at "/"         │
└─────────────────────────────────────────┘
```

- Collection dropdown: lists all collections that have `urlPrefix: "/"` (typically just `pages`)
- Page dropdown: lists all published documents in the selected collection
- Shows the page title + slug for clarity
- Saves to `homepageSlug` + `homepageCollection` in registry

### Homepage Resolution Helper

Create `packages/cms-admin/src/lib/homepage.ts`:

```typescript
export interface HomepageInfo {
  collection: string;
  slug: string;
}

/**
 * Get the designated homepage for the active site.
 * Falls back to slug convention if no explicit setting exists.
 */
export async function getHomepage(): Promise<HomepageInfo | null> {
  const registry = await loadRegistry();
  const site = getActiveSite(registry);

  // Explicit setting takes priority
  if (site.homepageSlug) {
    return {
      collection: site.homepageCollection ?? "pages",
      slug: site.homepageSlug,
    };
  }

  // Fallback: convention-based detection
  // Check for slug "home" or "index" in any collection with urlPrefix "/"
  // ...
  return null;
}

/**
 * Check if a document is the designated homepage.
 */
export function isHomepage(site: SiteEntry, collection: string, slug: string): boolean {
  if (site.homepageSlug) {
    return slug === site.homepageSlug
      && collection === (site.homepageCollection ?? "pages");
  }
  // Fallback convention
  return (slug === "home" || slug === "index")
    && getCollectionUrlPrefix(collection) === "/";
}
```

### Consumers Updated

**Preview** (`document-editor.tsx`):
```typescript
// Replace hardcoded slug check with:
const homepage = isHomepage(activeSite, collection, doc.slug);
const pagePath = homepage ? "/" : `${prefix}/${doc.slug}`;
```

**Build scripts** (`build.ts` in static sites):
```typescript
// Read homepage setting from registry or site config
const homepageSlug = siteSettings.homepageSlug ?? "home";
if (page.slug === homepageSlug) {
  writeFileSync(join(DIST, "index.html"), html);
} else {
  writeFileSync(join(DIST, page.slug, "index.html"), html);
}
```

**Revalidation** (`F41 webhook handler`):
```typescript
// Replace slug convention check with homepage helper
if (isHomepage(site, doc.collection, doc.slug)) {
  paths.push("/");
}
```

**Proxy/Middleware** (`F77`):
```typescript
// Read homepage from registry instead of hardcoding
const homepage = await getHomepage();
if (pathname === "/" && homepage) {
  return rewrite(`/${homepage.slug}`);
}
```

### Visual Indicator in Admin

When viewing a document that is the designated homepage, show a small badge:

```
← pages / home
🏠 Homepage    ● published    Clone    Generate    AI    History
```

The 🏠 badge is not an emoji in the actual UI — it's a small styled tag like the "published" badge, saying "Homepage".

### Collection List Indicator

In the pages collection list, the homepage document gets a subtle home icon next to its title, so users can see at a glance which page is the homepage without opening Site Settings.

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/site-registry.ts` — add `homepageSlug` and `homepageCollection` to `SiteEntry` interface
- `packages/cms-admin/src/lib/homepage.ts` — new file: `getHomepage()` and `isHomepage()` helpers
- `packages/cms-admin/src/components/settings/general-settings-panel.tsx` — add Homepage section with collection + page dropdowns
- `packages/cms-admin/src/components/editor/document-editor.tsx` — replace hardcoded `slug === "home"` preview check with `isHomepage()`; add Homepage badge
- `packages/cms-admin/src/components/collection-list.tsx` — add home icon indicator for the homepage document
- `packages/cms-admin/src/lib/revalidation.ts` — replace slug convention check with `isHomepage()` for path computation
- `packages/cms-admin/src/app/api/cms/registry/route.ts` — persist `homepageSlug`/`homepageCollection` in registry read/write
- `packages/cms/CLAUDE.md` — document `homepageSlug` setting for AI builders

### Blast radius
- Preview URL computation in `document-editor.tsx` — incorrect `isHomepage()` logic would break preview for all pages
- Revalidation path logic — homepage revalidation would fail to revalidate `/` if the helper returns wrong results
- Sites relying on slug convention (`home`, `index`) continue to work via fallback, but behavior changes if `homepageSlug` is explicitly set to a different slug

### Breaking changes
- None — `homepageSlug` is optional with backward-compatible fallback to slug convention. Existing sites work without changes.

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] `isHomepage()` returns true for explicitly set `homepageSlug`
- [ ] `isHomepage()` falls back to slug convention when `homepageSlug` is unset
- [ ] Site Settings Homepage dropdown lists only collections with `urlPrefix: "/"`
- [ ] Saving homepage setting persists to registry and survives admin restart
- [ ] Preview URL shows `/` for the designated homepage, `/{slug}` for other pages
- [ ] Homepage badge appears in document editor header for the designated page
- [ ] Collection list shows home icon on the correct document
- [ ] Revalidation sends `/` path for homepage documents

## Implementation Steps

1. Add `homepageSlug` and `homepageCollection` to `SiteEntry` interface
2. Create `lib/homepage.ts` with `getHomepage()` and `isHomepage()` helpers
3. Add Homepage section to Site Settings panel (collection + page dropdowns)
4. Update `document-editor.tsx` preview to use `isHomepage()` instead of hardcoded slug check
5. Add 🏠 Homepage badge to document editor header
6. Add home icon to collection list for the homepage document
7. Update F41 revalidation to use `isHomepage()`
8. Update CLAUDE.md builder docs to reference `homepageSlug` setting
9. Remove all hardcoded `slug === "home"` checks across codebase

## Dependencies

- None — can be implemented independently

## Effort Estimate

**Small** — 2 days. Most work is the Site Settings UI (dropdown populated from collection). The helper functions and consumer updates are straightforward find-and-replace.
