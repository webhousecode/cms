# Site Builder Errors — Lessons Learned

Errors made by Claude Code when building static site templates for `@webhouse/cms`. Document these so future AI sessions (and humans) don't repeat them.

## 1. `type: 'json'` does not exist

**Error:** Used `type: 'json'` for fields storing structured objects.
**Symptom:** Zod validation crash — CMS admin shows "Collections: 0" and throws `invalid_enum_value`.
**Fix:** Use `type: 'object'` with sub-fields, or flatten to individual `text`/`textarea` fields.

Valid field types: `text`, `textarea`, `richtext`, `number`, `boolean`, `date`, `image`, `relation`, `array`, `object`, `blocks`, `select`, `tags`, `image-gallery`, `video`, `audio`, `htmldoc`, `file`, `interactive`, `column-slots`.

## 2. `type: 'list'` does not exist

**Error:** Used `type: 'list'` for repeatable items.
**Symptom:** Same Zod crash as above.
**Fix:** Use `type: 'array'` with a `fields` sub-array.

## 3. Objects stored in `textarea` fields show `[object Object]`

**Error:** After fixing `type: 'json'` → `type: 'textarea'`, the JSON values were still JavaScript objects (e.g. `{ "hero": { "heading": "..." } }`). Textarea expects a string.
**Symptom:** CMS admin displays `[object Object]` in every textarea field.
**Fix:** Flatten nested objects to individual scalar fields:
```
// WRONG
{ name: 'hero', type: 'textarea' }   // with value { heading: "...", subtitle: "..." }

// CORRECT
{ name: 'heroHeading', type: 'text' }
{ name: 'heroSubtitle', type: 'textarea' }
```

## 4. HTML in richtext fields renders as escaped text

**Error:** Stored raw HTML (`<h2>Title</h2>`, `<p>Text</p>`) in richtext fields.
**Symptom:** TipTap editor in CMS admin shows the literal HTML tags as text, not rendered markup.
**Fix:** Richtext fields must contain **markdown**: `## Title`, `**bold**`, `> quote`, etc. Build scripts must convert markdown → HTML before injecting into templates.

## 5. HTML/CSS in content JSON (e.g. `<span class="gradient-text">`)

**Error:** Embedded styling markup in content strings: `"We craft <span class=\"gradient-text\">digital experiences</span> that matter"`.
**Symptom:** Content is coupled to template CSS. Breaks separation of concerns. CMS editor can't safely edit it.
**Fix:** Split into separate text fields that the template assembles:
```json
"heroHeadingBefore": "We craft ",
"heroHeadingHighlight": "digital experiences",
"heroHeadingAfter": " that matter"
```
Template applies styling: `${before}<span class="gradient-text">${highlight}</span>${after}`

## 6. Missing `urlPrefix` on pages collection

**Error:** Pages collection defined without `urlPrefix: '/'`.
**Symptom:** CMS admin site card shows "Pages: 0" even when page JSON files exist. The stats endpoint counts only documents in collections that have `urlPrefix` set.
**Fix:** Always add `urlPrefix: '/'` to the pages collection.

## 7. `select` options as plain strings

**Error:** Used `options: ['Dresses', 'Tops', 'Bottoms']` for select fields.
**Symptom:** Zod validation crash — CMS shows "Collections: 0".
**Fix:** Select options must be `{ label, value }` objects:
```typescript
options: [
  { label: 'Dresses', value: 'dresses' },
  { label: 'Tops', value: 'tops' },
]
```

## 8. Missing content JSON files for defined collections

**Error:** Collections defined in `cms.config.ts` but no JSON files in `content/{collection}/`.
**Symptom:** CMS admin shows the collection in the sidebar but "No items yet" when opened. Site appears broken/empty.
**Fix:** Every collection in the config must have at least one document in `content/{collectionName}/`. See `MANDATORY: Content File Requirements` in `packages/cms/CLAUDE.md`.

## 9. Hardcoded content in build.ts

**Error:** Text content (headings, descriptions, CTAs) written directly in template strings inside build.ts instead of reading from JSON files.
**Symptom:** Editing content in CMS admin and rebuilding has no effect — the hardcoded text always wins.
**Fix:** All content must come from JSON files. Build scripts read JSON and inject values into templates.

## 10. Image fields using `type: 'text'`

**Error:** Used `type: 'text'` for fields that store image URLs (heroImage, coverImage, photo).
**Symptom:** Works technically, but CMS admin shows a plain text input instead of the image picker/preview UI.
**Fix:** Use `type: 'image'` for any field that stores an image URL.

---

## Quick Checklist for New Templates

Before committing a new static site template, verify:

- [ ] All field types in `cms.config.ts` are from the valid list (no `json`, `list`, or made-up types)
- [ ] `select` options use `{ label, value }` format
- [ ] Pages collection has `urlPrefix: '/'`
- [ ] Every collection has at least one JSON document
- [ ] JSON documents use `{ slug, status, data: { ... } }` format
- [ ] Richtext fields contain markdown, not HTML
- [ ] No HTML/CSS markup in content JSON values
- [ ] Image fields use `type: 'image'`, not `type: 'text'`
- [ ] Build.ts reads ALL content from JSON — zero hardcoded text
- [ ] `npx tsx build.ts` runs without errors
- [ ] CMS admin loads without Zod errors (check browser console)
