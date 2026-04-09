# F129 — Edit What You See (Contextual Edit FAB)

> **Status:** Tier 1  
> **Created:** 2026-04-09  
> **Applies to:** cms-mobile (primary), cms-admin (secondary)

## Summary

When browsing a site in preview (inline thumbnail or fullscreen iframe), an **Edit FAB** (pencil icon, brand gold) replaces the Chat FAB. The user navigates the live site, finds a page that needs editing, taps Edit — and lands directly in the document editor for that exact page.

This transforms preview from "nice to look at" into the **primary navigation method for content editing**. No other CMS has browser-to-editor in one tap.

## User Flow

```
Preview iframe shows: https://webhouse.dk/blog/cms-chronicle-13
                                    ↓
             User taps ✏️ Edit FAB
                                    ↓
      App resolves URL → collection: "posts", slug: "cms-chronicle-13"
                                    ↓
         Navigates to DocumentEditor for that document
                                    ↓
        User edits, saves, goes back to preview → sees changes
```

## Technical Design

### 1. URL → Document Resolver

Server-side endpoint (works for both mobile and desktop):

```
GET /api/mobile/content/resolve?orgId=...&siteId=...&path=/blog/cms-chronicle-13

Response: { collection: "posts", slug: "cms-chronicle-13" }
    or:   { error: "No matching document" } → 404
```

**Resolution algorithm:**
1. Load all collections with `urlPrefix` from the site's `cms.config.ts`
2. For each collection, check if `path` starts with `urlPrefix`
3. If match: extract the remainder as the slug candidate
4. For category-based URLs (`urlPattern: "/:category/:slug"`): parse pattern, extract slug segment
5. Verify the slug exists in the collection via `cms.content.findBySlug()`
6. Return first match

**Edge cases:**
- Homepage (`/`) → look for a `global` collection or a page with slug `index`/`home`
- Locale prefixed paths (`/da/blog/my-post`) → strip locale prefix before matching
- Query params and hashes → strip before matching
- No match → return 404, FAB shows a toast "Can't resolve this page"

### 2. Iframe URL Tracking

**The challenge:** cross-origin iframes don't expose `location.href`.

**Solution by context:**

| Preview type | Origin | Strategy |
|---|---|---|
| Proxy preview (localhost via preview-proxy) | Same-origin | Inject `postMessage` script in proxy response |
| Live URL (external domain) | Cross-origin | Track the initial URL only; on Edit, ask the proxy to resolve |
| Fullscreen preview | Either | Same strategies as above |

**Proxy injection (preferred):**
The `/api/mobile/preview-proxy` already relays HTML. Inject a small script before `</body>`:

```html
<script>
  // Report URL to parent on every navigation
  (function() {
    function report() {
      window.parent.postMessage({ type: 'wh-preview-url', url: location.pathname }, '*');
    }
    report();
    // Catch SPA navigations
    const _pushState = history.pushState;
    history.pushState = function() {
      _pushState.apply(this, arguments);
      report();
    };
    window.addEventListener('popstate', report);
  })();
</script>
```

**Parent listener (in SitePreviewFullscreen / SitePreview):**
```typescript
const [currentPath, setCurrentPath] = useState<string | null>(null);

useEffect(() => {
  function onMessage(e: MessageEvent) {
    if (e.data?.type === 'wh-preview-url') {
      setCurrentPath(e.data.url);
    }
  }
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}, []);
```

**For live URLs (cross-origin):** Fall back to the initial URL that was loaded into the iframe. The user can still tap Edit to edit the landing page. Full SPA tracking for cross-origin requires a service worker approach (Phase 2).

### 3. Mobile Implementation (cms-mobile)

**Edit FAB placement:**
- `SitePreviewFullscreen` — show Edit FAB (bottom-right, same position as Chat FAB)
- `Site` screen inline preview — show small Edit overlay on the preview card
- Hide Chat FAB when Edit FAB is shown (never both)

**Flow:**
1. User opens fullscreen preview → iframe loads site
2. `postMessage` listener tracks current path
3. Edit FAB appears (pencil icon, gold, `active:scale-90`)
4. Tap → call `/api/mobile/content/resolve` with current path
5. If resolved → navigate to `/site/:orgId/:siteId/edit/:collection/:slug`
6. If not resolved → toast "Can't find a document for this page"
7. After editing + save → back button returns to preview

**New files:**
- `src/components/EditFab.tsx` — the FAB component
- Modify `SitePreviewFullscreen.tsx` — add message listener + EditFab
- Modify `App.tsx` FabGate — hide Chat FAB when on fullscreen preview

### 4. Desktop Implementation (cms-admin)

**Edit FAB / button placement:**
- Preview panel in document list → "Edit" overlay button
- Site dashboard preview card → "Edit this page" action
- Any preview iframe → floating edit button

**Flow:**
1. Schema is already loaded client-side
2. Resolve URL → collection + slug client-side (no API call needed)
3. Navigate to `/admin/content/[collection]/[slug]`

**Resolver (client-side):**
```typescript
function resolvePathToDocument(
  path: string,
  collections: CollectionConfig[]
): { collection: string; slug: string } | null {
  const cleanPath = path.split('?')[0].split('#')[0];
  for (const col of collections) {
    if (!col.urlPrefix) continue;
    if (cleanPath.startsWith(col.urlPrefix + '/')) {
      const slug = cleanPath.slice(col.urlPrefix.length + 1).replace(/\/$/, '');
      if (slug && !slug.includes('/')) return { collection: col.name, slug };
    }
  }
  return null;
}
```

### 5. Preview Proxy Script Injection

Modify `/api/mobile/preview-proxy` to inject the URL reporter script into proxied HTML responses. This is the enabler for same-origin preview tracking.

**Rules:**
- Only inject into `text/html` responses
- Only inject when response includes `</body>`
- Script is minimal (~200 bytes gzipped)
- No injection for non-proxy (external/live) URLs

## Implementation Priority

### Phase 1 (MVP — this feature)
1. Server-side URL resolver endpoint
2. `postMessage` injection in preview-proxy
3. Edit FAB on `SitePreviewFullscreen` (mobile)
4. Basic path tracking (initial URL + pushState)

### Phase 2
5. Edit overlay on inline preview card (mobile)
6. Desktop preview edit button (cms-admin)
7. Client-side resolver for desktop (no API call)

### Phase 3
8. Cross-origin tracking via service worker
9. Visual highlight of editable regions in preview
10. "Edit" context menu on long-press (mobile) / right-click (desktop)

## Key Files

| File | What |
|------|------|
| `cms-admin/src/app/api/mobile/content/resolve/route.ts` | URL → document resolver API |
| `cms-admin/src/app/api/mobile/preview-proxy/route.ts` | Inject postMessage script |
| `cms-mobile/src/components/EditFab.tsx` | Edit FAB component |
| `cms-mobile/src/screens/SitePreviewFullscreen.tsx` | Message listener + EditFab |
| `cms-mobile/src/App.tsx` | FabGate logic update |

## Test Plan

1. Open fullscreen preview of webhouse.dk → navigate to `/blog/cms-chronicle-13`
2. Tap Edit FAB → should open DocumentEditor for `posts/cms-chronicle-13`
3. Edit title, save → go back to preview → verify change visible
4. Navigate to homepage → tap Edit → should show toast (no matching doc) or resolve to index page
5. Test with category-based URLs (if any site uses `urlPattern`)
6. Test with locale-prefixed paths (`/da/blog/...`)
7. Test with external live URL (cross-origin) → should resolve initial URL only
