# F79 — Site Config Validator

> Robust validation of cms.config.ts and content/ structure when adding or loading a site, with clear error messages instead of runtime crashes.

## Problem

When a site with invalid configuration is added to CMS admin (e.g. `type: "json"` instead of a valid field type, missing content directories, malformed JSON files), the admin crashes with a raw ZodError stacktrace. This is especially dangerous when AI builders generate sites — they may use non-existent field types, forget content files, or produce invalid document structures. There is no validation gate between "Create site" and the CMS loading the config.

## Solution

Add a validation layer that runs:
1. **At site creation** — before saving to registry, validate the config file can be loaded and parsed
2. **On first site load** — validate content directory structure matches config
3. **On-demand** — "Validate site" button in site settings for ongoing health checks

Errors are presented as human-readable messages in the admin UI, never as raw stacktraces.

## Technical Design

### Validation Engine (`packages/cms/src/schema/site-validator.ts`)

```typescript
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  level: 'error';
  category: 'config' | 'content' | 'structure';
  path: string;           // e.g. "collections[3].fields[2].type"
  message: string;        // e.g. "Invalid field type 'json'. Valid types: text, textarea, ..."
  suggestion?: string;    // e.g. "Did you mean 'object'?"
}

export interface ValidationWarning {
  level: 'warning';
  category: 'config' | 'content' | 'structure';
  path: string;
  message: string;
}

export async function validateSite(configPath: string, contentDir?: string): Promise<ValidationResult>;
```

### Validation checks

**Config validation (cms.config.ts):**
- Can the file be loaded (import/require)?
- Does it export a valid config object?
- All field types are in the allowed enum
- Array/object fields have `fields` sub-array
- Collection names are valid identifiers (no spaces, special chars)
- Block references in `blocks` fields point to defined blocks
- No duplicate collection names or field names within a collection

**Content structure validation (content/):**
- Every collection in config has a matching `content/<name>/` directory
- Every JSON file has required system fields: `slug`, `status`, `data`
- `status` is one of: `draft`, `published`, `archived`, `expired`
- `data` fields match the collection schema (type-level check)
- No orphan directories (content dirs without matching collection)
- File names match slug values

**Suggestion engine:**
- For unknown field types, suggest closest valid type (Levenshtein distance)
- For missing content dirs, suggest creating them
- For malformed JSON, show line/column of parse error

### API endpoint (`packages/cms-admin/src/app/api/cms/registry/validate/route.ts`)

```typescript
// POST /api/cms/registry/validate
// Body: { configPath: string, contentDir?: string }
// Returns: ValidationResult
```

### Admin UI integration

**New site form (`sites/new/page.tsx`):**
- After user fills in config path, run validation before enabling "Create site"
- Show errors inline with red badges, warnings with yellow
- Block submission if there are errors

**Site settings:**
- "Validate site" button that runs full validation
- Results panel showing errors/warnings grouped by category

**Site card on `/admin/sites`:**
- Small health indicator (green/yellow/red dot) based on last validation

### Graceful error handling (`packages/cms-admin/src/lib/site-pool.ts`)

Replace the raw `validateConfig()` crash with:
```typescript
const result = safeValidateConfig(config);
if (!result.success) {
  // Return structured errors to the UI instead of throwing
  return { error: formatValidationErrors(result.error) };
}
```

### CMS Knowledge Rules

The validator must encode ALL implicit CMS rules that are not obvious from the schema alone. These are the "quirks" that cause sites to appear broken even when the config is technically valid:

| Rule | What to check | Error message |
|------|---------------|---------------|
| **Pages need urlPrefix** | Collections named "pages" (or with page-like content) should have `urlPrefix: '/'` | "Collection 'pages' has no urlPrefix. Add `urlPrefix: '/'` so pages appear in the admin page count." |
| **Homepage convention** | At least one page with slug `home` or `index` should exist | "No homepage found. Create a page with slug 'home' in content/pages/." |
| **Richtext = markdown** | Richtext field values in JSON must contain markdown, not HTML | "Field 'content' in pages/about.json contains HTML tags. Richtext fields expect markdown." |
| **No hardcoded content** | build.ts should read from JSON, not have inline strings (heuristic check) | "Warning: build.ts contains hardcoded content strings. Content should be read from JSON files." |
| **Image fields = URLs** | Image field values should be URL strings, not objects | "Field 'heroImage' contains an object. Image fields store URL strings." |
| **Array fields need sub-fields** | `type: "array"` must have `fields` array | "Array field 'items' is missing 'fields' definition." |
| **Valid field types only** | All field types must be in the allowed enum | "Invalid field type 'json'. Valid types: text, textarea, richtext, ... Did you mean 'object'?" |
| **Collection dirs exist** | Every collection must have a content directory with JSON files | "Collection 'pages' has no JSON files in content/pages/." |
| **Document format** | JSON files must have slug, status, data | "File content/pages/home.json is missing required field 'status'." |

### Repair Wizard

When validation finds errors, the admin should not just report them — it should offer to **fix them** via an interactive wizard. The wizard walks the user through each issue and asks what they intended:

```
┌─────────────────────────────────────────────────────────────┐
│ 🔧 Site Repair Wizard — Meridian Studio                    │
│                                                             │
│ Found 3 issues:                                             │
│                                                             │
│ 1/3 ──────────────────────────────────────────────────────  │
│                                                             │
│ ⚠ Collection "pages" has no urlPrefix                      │
│                                                             │
│ This means pages won't be counted in the dashboard and      │
│ preview won't work. Should this collection represent        │
│ top-level pages on your site?                               │
│                                                             │
│  [Yes, add urlPrefix: '/']     [No, skip]                  │
│                                                             │
│ 2/3 ──────────────────────────────────────────────────────  │
│                                                             │
│ ✗ Field "hero" has invalid type "json"                     │
│                                                             │
│ The type "json" doesn't exist. Looking at the data, this    │
│ field contains an object with keys: title, subtitle, image. │
│                                                             │
│ What should this field be?                                  │
│                                                             │
│  [Object with sub-fields]  [Textarea (raw text)]  [Skip]   │
│                                                             │
│ 3/3 ──────────────────────────────────────────────────────  │
│                                                             │
│ ⚠ content/pages/ has no JSON files                         │
│                                                             │
│ Your build.ts generates 3 pages (Home, About, Contact).     │
│ Should I create starter JSON files for these?               │
│                                                             │
│  [Yes, create pages]     [No, I'll add them manually]      │
│                                                             │
│                              [Apply 2 fixes]    [Cancel]   │
└─────────────────────────────────────────────────────────────┘
```

The wizard:
- Groups related issues (e.g. all invalid field types together)
- Inspects actual data in JSON files to suggest the right fix
- Shows what will change before applying
- Can auto-fix config file issues (urlPrefix, field types) and create missing files
- Never applies changes without explicit user confirmation
- Logs all changes for audit trail

### Integration with Import flow

When importing a site via the "New site" form, validation runs automatically after scanning the folder. If errors are found:
1. Show a summary: "Found 3 issues that should be fixed"
2. Offer "Fix now" (opens repair wizard) or "Import anyway" (imports with warnings)
3. After wizard fixes, re-validate and proceed to import

This ensures AI-built sites are corrected at import time, before they can crash the admin.

## Impact Analysis

### Files affected
- `packages/cms/src/schema/site-validator.ts` — new file: validation engine with config, content, and structure checks
- `packages/cms/src/schema/validate.ts` — extend existing validation with site-level rules and suggestion engine
- `packages/cms/src/schema/types.ts` — add `ValidationResult`, `ValidationError`, `ValidationWarning` interfaces
- `packages/cms-admin/src/lib/site-pool.ts` — replace raw `validateConfig()` crash with `safeValidateConfig()` returning structured errors
- `packages/cms-admin/src/app/api/cms/registry/validate/route.ts` — new file: POST endpoint for on-demand validation
- `packages/cms-admin/src/app/admin/(workspace)/sites/new/page.tsx` — add pre-validation before site creation
- `packages/cms-admin/src/app/admin/(workspace)/sites/page.tsx` — add health indicator (green/yellow/red dot) to site cards
- `packages/cms-admin/src/components/settings/general-settings-panel.tsx` — add "Validate site" button and results panel
- `packages/cms-admin/src/app/api/cms/registry/import/route.ts` — integrate validation into import flow

### Blast radius
- Site creation flow — validation gate could block imports if rules are too strict
- Site loading in `site-pool.ts` — changing error handling affects every route that loads a site config
- Existing sites with unconventional configs may suddenly show warnings/errors after upgrade

### Breaking changes
- None — validation is additive. Existing sites continue to load; errors are surfaced as UI feedback, not thrown exceptions.

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Validator catches all invalid field types and suggests closest match
- [ ] Validator detects missing content directories, malformed JSON, missing system fields
- [ ] CMS knowledge rules fire correctly (urlPrefix, homepage convention, richtext format)
- [ ] API endpoint returns structured `ValidationResult` for valid and invalid configs
- [ ] New site form blocks creation when errors are present, allows when only warnings
- [ ] Repair wizard applies fixes correctly and re-validates after
- [ ] Existing valid sites show green health indicator, no false positives
- [ ] `site-pool.ts` returns friendly errors instead of ZodError stacktraces

## Implementation Steps

1. Create `packages/cms/src/schema/site-validator.ts` with config validation (field types, structure)
2. Add content structure validation (directories, JSON format, schema match)
3. Encode all CMS knowledge rules (urlPrefix, homepage, richtext format, etc.)
4. Add suggestion engine for common mistakes (typos in field types, Levenshtein distance)
5. Create `/api/cms/registry/validate` endpoint
6. Add pre-validation to "New site" form — validate before allowing creation
7. Build Repair Wizard UI component with step-by-step issue resolution
8. Add auto-fix capabilities (modify config, create missing files) with confirmation
9. Update `site-pool.ts` to use `safeValidateConfig()` and return friendly errors
10. Add "Validate site" button to site settings panel
11. Add health indicator to site cards on `/admin/sites`
12. Integrate wizard into import flow (validate on scan, offer fixes before import)


> **NOTE — F107 Chat Integration:** When this feature introduces new API routes, tools, or admin actions, ensure they are also exposed as tool-use functions in F107 (Chat with Your Site). The chat interface must be able to perform any action the traditional admin UI can. See `docs/features/F107-chat-with-your-site.md`.

## Dependencies

- F23 (New Site Wizard) — already done, this extends it with validation

## Effort Estimate

**Large** — 5-7 days. Core validator + knowledge rules is 2 days. Repair wizard UI with auto-fix capabilities is 3-4 days. Import flow integration is 1 day.

---

> **Testing (F99):** This feature MUST include tests using the [F99 Test Infrastructure](F99-e2e-testing-suite.md).
> - **Unit tests** → `packages/cms-admin/src/lib/__tests__/{feature}.test.ts` or `packages/cms/src/__tests__/{feature}.test.ts`
> - **API tests** → `packages/cms-admin/tests/api/{feature}.test.ts`
> - **E2E tests** → `packages/cms-admin/e2e/suites/{nn}-{feature}.spec.ts`
> - Use shared fixtures: `auth.ts` (JWT login), `mock-llm.ts` (intercept AI), `test-data.ts` (seed/cleanup)
> - Tests are written BEFORE implementation. All tests must pass before merge.
