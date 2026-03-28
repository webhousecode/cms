# F96 — Embeddable Maps

> Three ways to embed Google Maps in CMS content: iframe in richtext, dedicated map field type, and Interactive template.

## Problem

There is no built-in way to embed maps in CMS-managed content. Users managing sites with contact pages, location listings, or store finders have to manually copy-paste raw HTML or work around the CMS. Maps are one of the most commonly needed embeds on business websites.

## Solution

Provide three progressively richer options so every user — from non-technical editors to developers — can embed maps:

1. **Richtext iframe embed** — Paste a Google Maps embed URL into any richtext field. TipTap already supports iframes for YouTube/Vimeo; extend to recognize Google Maps URLs.
2. **`map` field type** — A new CMS field type that stores address/coordinates and renders an interactive map picker in the admin UI.
3. **Map Interactive template** — A pre-built HTML Interactive (managed in the Interactives library) with configurable pins, zoom, and styling.

## Technical Design

### Option 1: Richtext Google Maps Embed

Extend the existing TipTap video embed node to also accept Google Maps embed URLs.

**How it works today:** The richtext editor has an "Embed video" toolbar button that accepts YouTube/Vimeo URLs and wraps them in a responsive iframe.

**Change:** Rename to "Embed" (or add a separate "Embed map" button). When the pasted URL matches `google.com/maps/embed` or `maps.google.com`, render it as a responsive iframe with map-appropriate defaults (no autoplay, 16:9 or 4:3 aspect ratio, `loading="lazy"`).

**File:** `packages/cms-admin/src/components/editor/tiptap-extensions/` — the iframe/embed extension.

**Stored in markdown as:**
```markdown
<iframe src="https://www.google.com/maps/embed?pb=!1m18!..." width="100%" height="450" style="border:0" allowfullscreen loading="lazy"></iframe>
```

**Site rendering:** The existing `ArticleBody` react-markdown component already passes through HTML. No site-side changes needed.

### Option 2: `map` Field Type

A new field type that stores structured location data and renders a map picker in the admin editor.

**Schema:**
```typescript
// packages/cms/src/schema/types.ts — add to FieldType union
| 'map'

// FieldConfig additions
mapProvider?: 'google' | 'mapbox';  // default: 'google'
mapDefaultZoom?: number;             // default: 14
mapDefaultCenter?: { lat: number; lng: number };  // default: Copenhagen
```

**Stored data format:**
```json
{
  "location": {
    "lat": 55.6761,
    "lng": 12.5683,
    "address": "Nyhavn, Copenhagen, Denmark",
    "zoom": 15,
    "placeId": "ChIJSxh1..."
  }
}
```

**Admin UI component:** `packages/cms-admin/src/components/editor/fields/map-field.tsx`
- Text input for address with Google Places Autocomplete
- Draggable pin on an embedded map preview
- Lat/lng displayed as read-only fields
- Zoom slider
- Requires `GOOGLE_MAPS_API_KEY` env var (optional — degrades to address-only without it)

**Site rendering helper:**
```typescript
// Example: render a map field in Next.js
function GoogleMap({ location }: { location: { lat: number; lng: number; zoom: number } }) {
  const src = `https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&q=${location.lat},${location.lng}&zoom=${location.zoom}`;
  return <iframe src={src} width="100%" height="450" style={{ border: 0 }} loading="lazy" allowFullScreen />;
}
```

### Option 3: Map Interactive Template

A pre-built HTML Interactive that users can upload to the Interactives library. Configurable via CMS data fields.

**File:** `packages/cms-admin/public/templates/map-interactive.html` — shipped as a template in the admin.

**Features:**
- Google Maps JavaScript API with configurable pins
- Multiple markers from CMS array field
- Custom info windows with CMS text
- Style presets (default, dark, minimal)
- Responsive, works in iframe embed

**CMS collection for map data:**
```typescript
defineCollection({
  name: "locations",
  label: "Locations",
  fields: [
    { name: "name", type: "text", required: true },
    { name: "address", type: "text" },
    { name: "lat", type: "number" },
    { name: "lng", type: "number" },
    { name: "description", type: "textarea" },
    { name: "phone", type: "text" },
    { name: "hours", type: "text" },
  ],
})
```

The Interactive reads location data via props (data-driven pattern from CLAUDE.md).

## Impact Analysis

### Files affected

**New files:**
- `packages/cms/src/schema/types.ts` — add `'map'` to FieldType union
- `packages/cms-admin/src/components/editor/fields/map-field.tsx` — new admin component
- `packages/cms-admin/public/templates/map-interactive.html` — template file
- `docs/features/F96-embeddable-maps.md` — this plan

**Modified files:**
- `packages/cms-admin/src/components/editor/document-editor.tsx` — add map field renderer case

### Downstream dependents

`packages/cms/src/schema/types.ts` is imported by 6+ files across packages/cms and packages/cms-admin. Adding a new union member to `FieldType` is additive — no existing code breaks since no `switch` exhaustiveness checks exist on FieldType.

`packages/cms-admin/src/components/editor/document-editor.tsx` is the main field renderer. Adding a new case to the field type switch is additive.

### Blast radius

- **Low risk.** Option 1 (richtext embed) is a minor TipTap extension change — existing embeds unaffected.
- **Option 2** (map field type) adds a new type to the union — backwards compatible since unknown types already fall back to text input in the editor.
- **Option 3** (Interactive template) is a static file with no code dependencies.
- No storage format changes, no API changes, no breaking changes.

### Breaking changes

None. All three options are purely additive.

### Test plan

- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Paste a Google Maps embed URL in richtext → renders as map iframe
- [ ] Add `type: 'map'` field to a collection → admin shows map picker
- [ ] Map field stores lat/lng/address/zoom in document JSON
- [ ] Upload map-interactive.html to Interactives → renders in preview
- [ ] Regression: existing richtext embeds (YouTube, Vimeo) still work
- [ ] Regression: existing field types unaffected

## Implementation Steps

1. **Option 1 (richtext embed):** Extend TipTap embed extension to recognize Google Maps URLs. Add "Embed map" button to toolbar or extend existing "Embed" button with URL detection.
2. **Option 2 (map field):** Add `'map'` to FieldType union. Create `map-field.tsx` admin component with address input + optional map preview. Add renderer case in document-editor.
3. **Option 3 (Interactive template):** Create `map-interactive.html` with Google Maps JS API. Add to Interactives template gallery (if exists) or document as uploadable template.


> **NOTE — F107 Chat Integration:** When this feature introduces new API routes, tools, or admin actions, ensure they are also exposed as tool-use functions in F107 (Chat with Your Site). The chat interface must be able to perform any action the traditional admin UI can. See `docs/features/F107-chat-with-your-site.md`.

## Dependencies

- None blocking. All three options can be built independently.
- Option 2 (map field) benefits from a Google Maps API key but degrades gracefully without one (address-only, no preview).

## Effort Estimate

**Small** — 2-3 days for all three options. Option 1 is ~2 hours (TipTap extension). Option 2 is ~1 day (new field type + admin component). Option 3 is ~half day (HTML template).

---

> **Testing (F99):** This feature MUST include tests using the [F99 Test Infrastructure](F99-e2e-testing-suite.md).
> - **Unit tests** → `packages/cms-admin/src/lib/__tests__/{feature}.test.ts` or `packages/cms/src/__tests__/{feature}.test.ts`
> - **API tests** → `packages/cms-admin/tests/api/{feature}.test.ts`
> - **E2E tests** → `packages/cms-admin/e2e/suites/{nn}-{feature}.spec.ts`
> - Use shared fixtures: `auth.ts` (JWT login), `mock-llm.ts` (intercept AI), `test-data.ts` (seed/cleanup)
> - Tests are written BEFORE implementation. All tests must pass before merge.
