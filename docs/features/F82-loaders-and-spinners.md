# F82 — Loaders & Spinners

> Polished, branded loading animations throughout CMS admin — no more blank screens or frozen UI.

## Problem

CMS admin has inconsistent loading states: some routes show blank white screens while fetching, others show plain "Loading..." text, and long operations (AI generation, preview server startup, import scanning) give no visual feedback. This makes the app feel unfinished and unresponsive. Existing loading is ad-hoc — scattered `Loader2` icons with `animate-spin`, one `Skeleton` component that's rarely used, and many places with no loading state at all.

## Solution

Create a unified loading system with three tiers: skeleton screens for page/route loading, inline spinners for button/action feedback, and progress indicators for multi-step operations. All branded with webhouse gold (#F7BB2E) accent and smooth CSS animations. Ship as reusable components that make adding loading states a one-liner.

## Technical Design

### Tier 1: Route & Page Skeletons

Skeleton screens that mirror the actual layout, shown during route transitions and initial data fetches.

**Component:** `packages/cms-admin/src/components/ui/page-skeleton.tsx`

```typescript
interface PageSkeletonProps {
  variant: "collection-list" | "document-editor" | "dashboard" | "sites" | "settings" | "preview";
}

export function PageSkeleton({ variant }: PageSkeletonProps) {
  // Renders a skeleton matching the layout of each page type
  // Uses existing Skeleton component with consistent animation
}
```

**Where to use:**
- `loading.tsx` files in each route group (Next.js automatic loading UI)
- Collection list → skeleton table rows with shimmer
- Document editor → skeleton field blocks
- Dashboard → skeleton stat cards
- Sites list → skeleton site cards

**Animation:** Shimmer gradient sweep (left-to-right), not pulse. More premium feel:
```css
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.skeleton-shimmer {
  background: linear-gradient(90deg, var(--muted) 25%, var(--accent) 50%, var(--muted) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}
```

### Tier 2: Inline Spinners & Button States

Small spinners for buttons and inline actions.

**Component:** `packages/cms-admin/src/components/ui/spinner.tsx`

```typescript
interface SpinnerProps {
  size?: "xs" | "sm" | "md" | "lg";  // 12, 16, 24, 32px
  color?: "primary" | "muted" | "white";
  label?: string;  // accessible aria-label
}

export function Spinner({ size = "sm", color = "primary", label = "Loading" }: SpinnerProps) {
  // SVG-based spinner with smooth rotation
  // Uses webhouse gold for "primary" variant
}
```

**Button loading pattern:**
```typescript
// Standardized across all action buttons
<Button disabled={loading}>
  {loading ? <Spinner size="xs" color="white" /> : <Save />}
  {loading ? "Saving..." : "Save"}
</Button>
```

**Where to use:**
- Save/Publish buttons → spinner replaces icon while saving
- AI Generate → spinner + "Generating..." text
- Import scan → spinner + "Scanning..."
- Preview server start → spinner + "Starting preview..."
- Clone/Delete operations

### Tier 3: Progress Indicators

For multi-step or long-running operations.

**Component:** `packages/cms-admin/src/components/ui/progress-bar.tsx`

```typescript
interface ProgressBarProps {
  value: number;        // 0-100
  label?: string;       // "Building site..."
  sublabel?: string;    // "3 of 7 pages"
  indeterminate?: boolean;  // animated bar without specific progress
}
```

**Where to use:**
- AI content generation (stream progress)
- Site import with validation (scanning collections, validating files)
- Bulk operations (generate all, export)
- Build process feedback

### Tier 4: Route Transition Bar

Thin animated bar at the top of the viewport during route transitions (à la YouTube/GitHub).

**Component:** `packages/cms-admin/src/components/ui/top-loader.tsx`

```typescript
// Thin gold bar that animates across the top during navigation
// Uses Next.js router events or NProgress-style approach
// Sits above the nav, below browser chrome
```

**Implementation:** CSS-only with a `<div>` that transitions `width` and `opacity`. No library needed. Triggered by `usePathname()` changes.

### Brand Integration

All loading animations use consistent timing and colors:
- **Primary color:** `var(--primary)` / #F7BB2E (webhouse gold)
- **Skeleton base:** `var(--muted)` with lighter sweep
- **Timing:** 1.5s for skeletons, 0.8s rotation for spinners, 300ms for transitions
- **Easing:** `ease-in-out` for skeletons, `linear` for spinners

### Implementation Inventory

Current loading states to replace (audit):

| Location | Current state | Target |
|----------|--------------|--------|
| Route transitions | Blank screen | Top loader bar + page skeleton |
| Collection list | "Loading..." text | Skeleton table rows |
| Document editor | Blank | Skeleton field blocks |
| Dashboard stats | Numbers pop in | Skeleton stat cards |
| Sites list | "Loading sites..." | Skeleton site cards |
| Save button | Text changes | Spinner + text |
| AI generation | Loader2 spin | Spinner + progress bar |
| Preview startup | Nothing | Spinner + "Starting preview..." |
| Import scan | "Scanning..." | Spinner + collection count progress |
| Search | Nothing | Inline spinner in search field |
| Media library | Images pop in | Skeleton grid + fade-in on load |

## Implementation Steps

1. Create `Spinner` component with size/color variants
2. Create shimmer-based `PageSkeleton` component with page variants
3. Create `ProgressBar` component for multi-step operations
4. Create `TopLoader` route transition bar
5. Add `loading.tsx` files to all route groups for automatic skeleton screens
6. Replace all `Loader2 animate-spin` instances with `Spinner`
7. Add button loading states to all action buttons (Save, Publish, Generate, etc.)
8. Add progress indicators to AI generation and import flows
9. Add image fade-in animations to Media library and image fields
10. QA pass: verify every loading state feels consistent

## Dependencies

- None — purely UI, can be done at any time

## Effort Estimate

**Medium** — 3-4 days. Components are straightforward (1 day). Bulk of work is the audit and replacement across all pages (2-3 days).
