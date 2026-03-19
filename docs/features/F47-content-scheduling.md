# F47 — Content Scheduling

> Publish and unpublish content at specific future dates. Calendar view of scheduled content. Scheduler daemon that runs every minute.

## Problem

The CMS supports `publishAt` on documents and has a partial `/api/publish-scheduled` endpoint, but there's no `unpublishAt` for content expiry, no daemon to automate the checks, no calendar view, and the publish dialog doesn't expose date/time pickers. Editors have to manually publish content at the right time.

## Solution

Complete the scheduling system: add `unpublishAt` alongside the existing `publishAt`, build a scheduler daemon that checks every minute (leveraging F15 Agent Scheduler infrastructure), add date/time pickers to the publish dialog, and build a calendar view showing all scheduled content across collections.

## Technical Design

### 1. Document Fields (Extending Existing)

The `publishAt` field already exists in the Document type. Add `unpublishAt`:

```typescript
// packages/cms/src/storage/types.ts (existing, extended)

export interface Document {
  // ... existing fields ...
  publishAt?: string;    // Already exists — ISO timestamp for scheduled publish
  unpublishAt?: string;  // NEW — ISO timestamp for scheduled unpublish (content expiry)
}
```

### 2. Scheduler Daemon

```typescript
// packages/cms/src/scheduler/content-scheduler.ts

export class ContentScheduler {
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private cms: CmsInstance,
    private config: CmsConfig,
    private onAction?: (action: ScheduleAction) => void,
  ) {}

  /** Start checking every 60 seconds */
  start(): void {
    this.interval = setInterval(() => this.tick(), 60_000);
    this.tick(); // Run immediately on start
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
  }

  async tick(): Promise<ScheduleAction[]> {
    const now = new Date();
    const actions: ScheduleAction[] = [];

    for (const col of this.config.collections) {
      const { documents } = await this.cms.content.findMany(col.name, {});

      for (const doc of documents) {
        // Scheduled publish: draft → published
        if (doc.status === "draft" && doc.publishAt) {
          const at = new Date(doc.publishAt);
          if (!isNaN(at.getTime()) && at <= now) {
            await this.cms.content.update(col.name, doc.id, {
              status: "published",
              data: { ...doc.data, publishAt: undefined },
            });
            actions.push({ type: "published", collection: col.name, slug: doc.slug, at: doc.publishAt });
          }
        }

        // Scheduled unpublish: published → archived
        if (doc.status === "published" && doc.unpublishAt) {
          const at = new Date(doc.unpublishAt);
          if (!isNaN(at.getTime()) && at <= now) {
            await this.cms.content.update(col.name, doc.id, {
              status: "archived",
              data: { ...doc.data, unpublishAt: undefined },
            });
            actions.push({ type: "unpublished", collection: col.name, slug: doc.slug, at: doc.unpublishAt });
          }
        }
      }
    }

    for (const action of actions) {
      this.onAction?.(action);
    }

    return actions;
  }
}

export interface ScheduleAction {
  type: "published" | "unpublished";
  collection: string;
  slug: string;
  at: string;
}
```

### 3. Existing API Route Enhancement

The existing endpoint at `packages/cms-admin/src/app/api/publish-scheduled/route.ts` already handles `publishAt`. Extend it to also handle `unpublishAt`:

```typescript
// packages/cms-admin/src/app/api/publish-scheduled/route.ts (modified)

// Add unpublishAt handling after the existing publishAt loop:
if (doc.status === "published") {
  const unpublishAt = doc.data?.unpublishAt as string | undefined;
  if (!unpublishAt) continue;
  const at = new Date(unpublishAt);
  if (isNaN(at.getTime()) || at > now) continue;
  await cms.content.update(col.name, doc.id, { status: "archived" });
  unpublished.push({ collection: col.name, slug: doc.slug });
}
```

### 4. Publish Dialog — Date/Time Pickers

```typescript
// packages/cms-admin/src/components/editor/publish-dialog.tsx (modified)

export function PublishDialog({ document, onPublish }: PublishDialogProps) {
  const [scheduleMode, setScheduleMode] = useState<"now" | "scheduled">("now");
  const [publishAt, setPublishAt] = useState<Date | null>(null);
  const [unpublishAt, setUnpublishAt] = useState<Date | null>(null);

  return (
    <Dialog>
      {/* Existing publish options */}

      {/* Schedule toggle */}
      <RadioGroup value={scheduleMode} onValueChange={setScheduleMode}>
        <RadioGroupItem value="now" label="Publish now" />
        <RadioGroupItem value="scheduled" label="Schedule for later" />
      </RadioGroup>

      {scheduleMode === "scheduled" && (
        <>
          <DateTimePicker
            label="Publish at"
            value={publishAt}
            onChange={setPublishAt}
            minDate={new Date()} // Can't schedule in the past
          />
          <DateTimePicker
            label="Unpublish at (optional)"
            value={unpublishAt}
            onChange={setUnpublishAt}
            minDate={publishAt ?? new Date()}
          />
        </>
      )}
    </Dialog>
  );
}
```

### 5. Calendar View

New admin page showing all scheduled content across collections:

```typescript
// packages/cms-admin/src/app/scheduled/page.tsx

export default function ScheduledContentPage() {
  // GET /api/cms/scheduled — returns all documents with publishAt or unpublishAt
  // Renders a month calendar grid
  // Each day cell shows scheduled items with collection badge + title
  // Click item → opens editor
  // Color coding: green = publish, red = unpublish
}
```

### 6. API Endpoint for Scheduled Content

```typescript
// packages/cms-admin/src/app/api/cms/scheduled/route.ts

export async function GET() {
  // Iterate all collections, find documents with publishAt or unpublishAt
  // Return sorted by date
  return NextResponse.json({
    items: [
      {
        collection: "posts",
        slug: "upcoming-feature",
        title: "Upcoming Feature",
        publishAt: "2026-03-20T09:00:00Z",
        unpublishAt: null,
        status: "draft",
      },
      // ...
    ],
  });
}
```

### 7. Scheduled Content Indicators

In collection lists, show scheduling status:

- Clock icon next to title for documents with `publishAt` in the future
- Tooltip: "Scheduled to publish Mar 20, 2026 at 09:00"
- Expiry icon for documents with `unpublishAt`
- Tooltip: "Expires Apr 15, 2026 at 00:00"

## Impact Analysis

### Files affected
- `packages/cms/src/storage/types.ts` — add `unpublishAt` to Document type
- `packages/cms/src/scheduler/content-scheduler.ts` — new scheduler class
- `packages/cms-admin/src/app/api/publish-scheduled/route.ts` — extend with unpublish
- `packages/cms-admin/src/components/editor/publish-dialog.tsx` — add date/time pickers
- `packages/cms-admin/src/app/scheduled/page.tsx` — new calendar view page
- `packages/cms-admin/src/app/api/cms/scheduled/route.ts` — new API endpoint

### Blast radius
- Document type change (`unpublishAt`) affects all storage adapters
- Publish dialog modification affects document editing workflow
- Scheduler daemon runs continuously — resource consumption concern

### Breaking changes
- `Document` type gains `unpublishAt` field — optional, backwards-compatible

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Scheduled publish triggers at correct time
- [ ] Scheduled unpublish archives document at correct time
- [ ] Calendar view shows all scheduled content
- [ ] Date/time pickers work in publish dialog

## Implementation Steps

1. **Add `unpublishAt` to Document type** in `packages/cms/src/storage/types.ts`
2. **Extend `/api/publish-scheduled` route** — add unpublishAt handling
3. **Build `ContentScheduler` class** — tick-based daemon with configurable interval
4. **Add date/time pickers to publish dialog** — schedule mode toggle, DateTimePicker components
5. **Build `GET /api/cms/scheduled` endpoint** — list all scheduled content
6. **Build calendar view page** — month grid, scheduled item rendering
7. **Add scheduling indicators to collection lists** — clock/expiry icons with tooltips
8. **Integrate ContentScheduler with F15 Agent Scheduler** — register as a system task
9. **Add scheduling fields to document editor sidebar** — show/edit publishAt and unpublishAt
10. **Test** — schedule a document, verify it publishes on time, verify unpublish works, verify calendar shows items

## Dependencies

- **F15 Agent Scheduler** — daemon infrastructure for running the scheduler (currently in progress)
- **Existing `publishAt` field** — already in `Document` type and `publish-scheduled/route.ts`
- **Existing publish dialog** — `packages/cms-admin/src/components/editor/document-editor.tsx`

## Effort Estimate

**Medium** — 3-4 days

- Day 1: unpublishAt field, extend publish-scheduled route, ContentScheduler class
- Day 2: Publish dialog date/time pickers, scheduling indicators in collection lists
- Day 3: Calendar view page, scheduled content API endpoint
- Day 4: F15 integration, sidebar scheduling fields, testing
