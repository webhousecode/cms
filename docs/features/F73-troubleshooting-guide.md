# F73 — Troubleshooting Guide

> In-app troubleshooting section accessible from the Help drawer. Searchable, categorized, with common issues and solutions.

## Problem

When users hit issues (GitHub sync failing, media uploads broken, AI not responding, scheduled content not publishing), they have nowhere to look inside the admin. They end up asking on Discord or opening a GitHub issue for problems that have known solutions. A searchable troubleshooting guide inside the admin reduces support burden and unblocks users immediately.

## Solution

A **Troubleshooting** section in the existing Help drawer that:

1. Renders a curated list of common issues organized by category
2. Supports instant search/filter across all entries
3. Links to relevant docs or Settings pages where applicable
4. Content stored as a markdown file or JSON in the CMS package — easy to update

Categories: **GitHub**, **Media**, **AI**, **Scheduling**, **Auth**, **General**.

Eventually integrates into F31 Documentation Site, but starts as embedded help content shipping with the admin.

## Technical Design

### 1. Troubleshooting Data

```typescript
// packages/cms-admin/src/lib/troubleshooting.ts

export interface TroubleshootingEntry {
  id: string;
  category: "github" | "media" | "ai" | "scheduling" | "auth" | "general";
  title: string;          // e.g. "GitHub push fails with 409 conflict"
  symptoms: string[];     // what the user sees
  solution: string;       // markdown — step-by-step fix
  relatedLink?: string;   // link to Settings page or external docs
}

export const troubleshootingEntries: TroubleshootingEntry[] = [
  // 15-20 entries covering common issues
];
```

### 2. Help Drawer Integration

Add a "Troubleshooting" tab or section to the existing Help drawer. Search input at the top filters entries by title, symptoms, and solution text. Category pills for quick filtering.

```
┌─────────────────────────────────┐
│ Help                        [×] │
│                                 │
│ [Troubleshooting] [Shortcuts]   │
│                                 │
│ 🔍 Search issues...             │
│                                 │
│ [GitHub] [Media] [AI] [Sched.]  │
│ [Auth] [General]                │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ GitHub push fails with 409  │ │
│ │ Category: GitHub            │ │
│ │ ▸ Click to expand solution  │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ AI generation returns empty │ │
│ │ Category: AI                │ │
│ │ ▸ Click to expand solution  │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

### 3. Initial Content (examples)

| Category | Issue | Solution |
|----------|-------|----------|
| GitHub | Push fails with 409 conflict | Re-fetch from GitHub, merge changes, retry save |
| GitHub | "Bad credentials" after token refresh | Disconnect and reconnect GitHub in Settings |
| Media | Upload fails for large files | Check file size limit in config (default 10MB) |
| AI | Generation returns empty content | Verify API key in Settings → AI, check model availability |
| AI | "Rate limited" errors | Wait 60s or switch to a different model tier |
| Scheduling | Content not publishing on time | Check scheduler daemon status, verify F60 heartbeat |
| Auth | Invitation email not received | Check spam folder, verify email address, resend from Team panel |
| General | Admin shows blank page | Clear browser cache, check console for errors |

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/troubleshooting.ts` — new troubleshooting data
- `packages/cms-admin/src/components/help/TroubleshootingPanel.tsx` — new panel component
- `packages/cms-admin/src/components/help/HelpDrawer.tsx` — add Troubleshooting tab

### Blast radius
- Help drawer modification — test existing keyboard shortcuts display

### Breaking changes
- None

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Troubleshooting panel renders in Help drawer
- [ ] Search filters entries by title and symptoms
- [ ] Category pills filter correctly
- [ ] Solution accordion expands/collapses

## Implementation Steps

1. Create `troubleshootingEntries` data file with 15-20 entries
2. Create `TroubleshootingPanel` component with search + category filter + accordion
3. Integrate into existing Help drawer as a tab
4. Test search across all fields

## Dependencies

- Existing Help drawer in admin UI
- No external dependencies

## Effort Estimate

**Small** — 1 day

- Half day: data file with 15-20 curated entries
- Half day: panel component with search, category filter, accordion expand
