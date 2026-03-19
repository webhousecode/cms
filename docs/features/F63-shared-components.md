# F63 — Shared Component Library & Design Tokens

> Consolidate repeated UI patterns, local-only components, and API conventions into a shared library so every new feature built by humans or AI reuses the same building blocks.

## Problem

The CMS admin has **~1,965 inline style objects** scattered across 82+ files. Key UI components (`Card`, `Toggle`, `InputRow`, `SaveButton`, `ErrorMsg`, `CopyButton`) are defined **locally** in `general-settings-panel.tsx` and never exported — so every new panel reimplements them. API error responses use inconsistent formats. Colors like `#4ade80` (success green) are hardcoded in 33+ places instead of using CSS variables.

This means:
1. **Claude Code reinvents patterns** every time it builds a new feature — it can't know about local components it hasn't read
2. **Visual inconsistency** — borderRadius varies between 7px, 8px, 10px across files
3. **Maintenance burden** — fixing a pattern means finding all inline copies
4. **No single source of truth** — new contributors (human or AI) guess at styles instead of importing them

## Audit Results (current state)

| Category | Count | Shared? | Action needed |
|----------|-------|---------|---------------|
| Section headings | 23 uses | Mostly ✓ (`section-heading.tsx`) | 6 inline duplicates to clean up |
| Card/panel wrappers | 46 uses | ✗ (local only) | **Export as shared component** |
| Button styles | 52 files, 200+ inline | Partial (Button CVA exists) | **Export SaveButton, CopyButton** |
| Toggle/switch | 4 files | ✗ (local only) | **Export as shared component** |
| Input fields | 50+ inline | ✗ (InputRow local) | **Export InputRow** |
| Error messages | 6 files | ✗ (ErrorMsg local) | **Export as shared component** |
| Save/loading states | 17 components | ✗ (repeated pattern) | **Create useSaveState hook** |
| API error format | 82 routes | ✗ (inconsistent) | **Standardize apiError/apiOk helpers** |
| Hardcoded colors | 33× `#4ade80` | ✗ | **Replace with CSS variable** |

## Solution

Three deliverables:

1. **Promote local components to shared** — move from `general-settings-panel.tsx` to `components/ui/` or `components/shared/`
2. **Create conventions doc** — `CLAUDE.md` section or `docs/COMPONENTS.md` that AI sessions reference
3. **Add design tokens** — CSS variables for success/warning colors, standard spacing, borderRadius

## Technical Design

### 1. Shared UI Components to Export

All go in `packages/cms-admin/src/components/ui/`.

**Already done — reference example:**

`section-heading.tsx` was the first component extracted to shared:

```typescript
// packages/cms-admin/src/components/ui/section-heading.tsx
// Canonical style: CAPS, 0.8rem, 700 weight, muted color, 0.07em tracking
export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.07em",
      textTransform: "uppercase", color: "var(--muted-foreground)", margin: "0 0 0.875rem" }}>
      {children}
    </h2>
  );
}
```

Used in 23+ places. This is the pattern to follow for all remaining extractions:

**Remaining components to extract:**

```typescript
// ── card.tsx ──────────────────────────────────────
// Already exists locally in general-settings-panel.tsx (lines 83-89)
export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      "bg-card border border-border rounded-[10px] p-5 flex flex-col gap-4",
      className
    )}>
      {children}
    </div>
  );
}

// ── toggle.tsx (admin) ───────────────────────────
// Already exists locally in general-settings-panel.tsx (lines 30-58)
// Different from shadcn Toggle (which is a button variant)
export function SettingsToggle({ checked, onChange, label, description }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) { /* ... existing implementation ... */ }

// ── input-row.tsx ────────────────────────────────
// Already exists locally in general-settings-panel.tsx (lines 60-80)
export function InputRow({ label, description, ...inputProps }: {
  label: string;
  description?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) { /* ... */ }

// ── error-msg.tsx ────────────────────────────────
export function ErrorMsg({ msg }: { msg: string }) {
  return msg ? <p className="text-xs text-destructive">{msg}</p> : null;
}

// ── save-button.tsx ──────────────────────────────
export function SaveButton({ saving, saved, label }: {
  saving: boolean;
  saved: boolean;
  label?: string;
}) { /* ... existing implementation ... */ }

// ── copy-button.tsx ──────────────────────────────
// Currently duplicated in mcp-settings-panel.tsx AND team-panel.tsx
export function CopyButton({ text, label }: { text: string; label?: string }) { /* ... */ }
```

### 2. Custom Hook: useSaveState

Replace the repeated `saving/saved/setSaving/setSaved` pattern (found in 17 components):

```typescript
// packages/cms-admin/src/hooks/use-save-state.ts

export function useSaveState() {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function execute(fn: () => Promise<Response>) {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fn();
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? `Failed (${res.status})`);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } catch (err) {
      setError(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
    return { saving, saved, error };
  }

  return { saving, saved, error, execute, setError };
}
```

### 3. API Response Helpers

Standardize all 82+ API routes:

```typescript
// packages/cms-admin/src/lib/api-response.ts

import { NextResponse } from "next/server";

/** Success response */
export function apiOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

/** Error response — always { error: string } */
export function apiError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

/** Wrap an async handler with try/catch that returns apiError on throw */
export function apiHandler(fn: (req: Request) => Promise<NextResponse>) {
  return async (req: Request) => {
    try {
      return await fn(req);
    } catch (err) {
      console.error(`[API] ${req.url}:`, err);
      return apiError(err instanceof Error ? err.message : "Internal error", 500);
    }
  };
}
```

### 4. Design Tokens (CSS Variables)

Add to `globals.css`:

```css
:root {
  /* ── Status colors (missing today) ── */
  --success: #22c55e;             /* replaces hardcoded #4ade80 */
  --success-foreground: #fff;
  --warning: #f59e0b;
  --warning-foreground: #fff;

  /* ── Brand ── */
  --brand-gold: #F7BB2E;
  --brand-dark: #0D0D0D;

  /* ── Standard spacing ── */
  --radius-card: 10px;            /* cards, panels */
  --radius-input: 7px;            /* inputs, buttons */
  --radius-badge: 9999px;         /* pills, tags */

  /* ── Admin page padding ── */
  --page-padding: 2rem;
  --page-max-width: 88rem;
}
```

### 5. CLAUDE.md Component Reference

Add to `packages/cms-admin/CLAUDE.md` (or the project CLAUDE.md) so every Claude Code session knows about shared components:

```markdown
## Shared Admin Components

When building new admin UI, always import from shared components:

| Need | Import | NOT this |
|------|--------|----------|
| Settings card | `import { Card } from "@/components/ui/card"` | Inline `div` with bg-card |
| Toggle switch | `import { SettingsToggle } from "@/components/ui/settings-toggle"` | Custom toggle div |
| Text input | `import { InputRow } from "@/components/ui/input-row"` | Inline input with style |
| Save button | `import { SaveButton } from "@/components/ui/save-button"` | Custom save button |
| Copy to clipboard | `import { CopyButton } from "@/components/ui/copy-button"` | Reimplemented copy logic |
| Error text | `import { ErrorMsg } from "@/components/ui/error-msg"` | Inline red text |
| Section title | `import { SectionHeading } from "@/components/ui/section-heading"` | Inline uppercase heading |
| Save state mgmt | `import { useSaveState } from "@/hooks/use-save-state"` | Manual saving/saved/error |
| API success | `import { apiOk } from "@/lib/api-response"` | `NextResponse.json(data)` |
| API error | `import { apiError } from "@/lib/api-response"` | `NextResponse.json({ error })` |
| Success green | `var(--success)` or `text-success` | `#4ade80` or `#22c55e` |
```

## Impact Analysis

### Files affected
- `packages/cms-admin/src/components/ui/card.tsx` — extract from general-settings-panel
- `packages/cms-admin/src/components/ui/settings-toggle.tsx` — extract from general-settings-panel
- `packages/cms-admin/src/components/ui/input-row.tsx` — extract from general-settings-panel
- `packages/cms-admin/src/components/ui/error-msg.tsx` — extract from general-settings-panel
- `packages/cms-admin/src/components/ui/save-button.tsx` — extract from general-settings-panel
- `packages/cms-admin/src/components/ui/copy-button.tsx` — merge from mcp-settings-panel + team-panel
- `packages/cms-admin/src/hooks/use-save-state.ts` — new custom hook
- `packages/cms-admin/src/lib/api-response.ts` — new API response helpers
- `packages/cms-admin/src/app/globals.css` — add design token CSS variables
- Multiple settings panels — update imports to shared components

### Blast radius
- Component extraction from general-settings-panel — must not break existing settings pages
- CSS variable additions affect global styles — test dark mode too
- 33 hardcoded color replacements across many files

### Breaking changes
- None — extraction preserves exact same rendering

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] General settings page renders identically after extraction
- [ ] MCP settings page uses shared CopyButton
- [ ] `var(--success)` renders correct green in light and dark modes
- [ ] `useSaveState` hook works in settings panels

## Implementation Steps

### Phase 1 — Extract & Export (day 1-2)
1. Move `Card`, `SettingsToggle`, `InputRow`, `ErrorMsg`, `SaveButton` from `general-settings-panel.tsx` to `components/ui/`
2. Merge `CopyButton` from `mcp-settings-panel.tsx` and `team-panel.tsx` into shared `components/ui/copy-button.tsx`
3. Update all imports in `general-settings-panel.tsx`, `mcp-settings-panel.tsx`, `team-panel.tsx` to use shared versions
4. Delete local definitions

### Phase 2 — Hook & API Helpers (day 2-3)
5. Create `hooks/use-save-state.ts`
6. Create `lib/api-response.ts` with `apiOk`, `apiError`, `apiHandler`
7. Refactor 3-5 settings panels to use `useSaveState` as proof of concept
8. Refactor 5-10 API routes to use `apiOk`/`apiError` as proof of concept

### Phase 3 — Design Tokens (day 3)
9. Add `--success`, `--warning`, `--brand-gold`, `--radius-card`, `--radius-input` to `globals.css`
10. Replace all 33 instances of `#4ade80` with `var(--success)`
11. Replace scattered `borderRadius` values with token references where practical

### Phase 4 — Documentation (day 3-4)
12. Add shared component reference to project `CLAUDE.md`
13. Run `scripts/code-audit.sh` to verify no broken imports
14. Gradually migrate remaining inline patterns in future features (not a big-bang rewrite)

## Dependencies

None — this is a refactoring/infrastructure feature that improves all future work.

## Effort Estimate

**Medium** — 3-4 days

- Day 1: Extract and export 6 shared components
- Day 2: Create useSaveState hook + apiResponse helpers, refactor proof-of-concept
- Day 3: Design tokens + color cleanup (33 replacements)
- Day 4: CLAUDE.md documentation + audit cleanup

## Principles

- **No big-bang rewrite.** Extract, export, and migrate incrementally. New features use shared components immediately; old code migrates as it's touched.
- **Inline styles are OK for one-offs.** The goal is to share *repeated* patterns, not eliminate all inline styles.
- **CLAUDE.md is the enforcer.** If it's documented in CLAUDE.md, Claude Code will use it automatically in every session.
