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

## Implementation Steps

1. Create `packages/cms/src/schema/site-validator.ts` with config validation (field types, structure)
2. Add content structure validation (directories, JSON format, schema match)
3. Add suggestion engine for common mistakes (typos in field types)
4. Create `/api/cms/registry/validate` endpoint
5. Add pre-validation to "New site" form — validate before allowing creation
6. Update `site-pool.ts` to use `safeValidateConfig()` and return friendly errors
7. Add "Validate site" button to site settings panel
8. Add health indicator to site cards on `/admin/sites`

## Dependencies

- F23 (New Site Wizard) — already done, this extends it with validation

## Effort Estimate

**Medium** — 3-4 days. Core validator is straightforward (mostly Zod + filesystem checks), bulk of work is the UI integration and error message formatting.
