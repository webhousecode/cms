# PATCH: AI Lock — Field-Level Content Protection

**Priority:** HIGH — Must be in core foundation, not bolted on later
**Applies to:** `@webhouse/cms` core package
**Reference:** CMS-ENGINE.md §1.2, §3.1, §4.2, §4.7

---

## What This Is

AI Lock prevents AI agents from overwriting human-edited content. It's a field-level metadata system that automatically protects any field a user has touched. This is a **core engine feature**, not a plugin — every collection, every field, every AI operation must respect it.

---

## 1. Field Metadata System (`_fieldMeta`)

Every document gets a `_fieldMeta` object stored alongside its content. This tracks per-field authorship and lock state.

### Data Structure

```typescript
interface FieldMeta {
  aiLock: boolean;
  aiLockReason: 'user-edit' | 'manual-lock' | 'approved' | 'import';
  aiLockAt: string;           // ISO 8601 date
  lastEditedBy: 'user' | 'ai' | 'import';
  aiGenerated: boolean;
  aiGeneratedAt: string | null;
  aiModel: string | null;     // e.g. "anthropic/claude-sonnet-4"
  aiPromptHash: string | null; // For regeneration tracking
}

// Stored on each document:
interface DocumentFieldMeta {
  [fieldPath: string]: Partial<FieldMeta>;
}
```

### Field Path Format

Keys in `_fieldMeta` use dot-notation and bracket-indexing for nested fields:

```
"title"                    → Top-level field
"seo.metaTitle"            → Nested object field
"seo.metaDescription"      → Nested object field
"body[2].heading"          → Specific block field
"variants[0].description"  → Array item field
```

### Storage Requirements

- `_fieldMeta` is stored in the same storage adapter as the document
- For SQLite: JSON column on the documents table
- For Filesystem/JSON: `_fieldMeta` property in the document JSON file
- `_fieldMeta` is **excluded** from public Content API responses (GET endpoints)
- `_fieldMeta` is **included** in admin API responses and schema introspection

---

## 2. Auto-Lock Behavior

### On Content CRUD Operations

In the content CRUD layer, intercept **update** operations:

```
When a document field is updated:

1. Compare old value vs new value for each field
2. For each changed field:
   a. Check who is making the change (context.actor: "user" | "ai" | "import")
   b. If actor === "user" AND field has _fieldMeta.aiGenerated === true:
      → Set aiLock: true
      → Set aiLockReason: "user-edit"
      → Set aiLockAt: now()
      → Set lastEditedBy: "user"
   c. If actor === "user" AND field has no prior _fieldMeta:
      → Set lastEditedBy: "user"
      → (No lock needed — field was never AI-generated)
   d. If actor === "ai":
      → Check aiLock FIRST — if locked, REJECT the write for this field
      → If not locked: set lastEditedBy: "ai", aiGenerated: true,
        aiGeneratedAt: now(), aiModel: context.model
   e. If actor === "import":
      → Set aiLock: true
      → Set aiLockReason: "import"
      → Set lastEditedBy: "import"
```

### Key Rule

**The actor context must be passed through every content write operation.** The content CRUD layer needs to know whether a write comes from a user (admin dashboard, API with user auth), an AI agent, or an import. This is not optional — without actor context, auto-lock cannot function.

Suggested implementation: add `actor` to the write context object that already flows through the CRUD layer.

```typescript
interface WriteContext {
  actor: 'user' | 'ai' | 'import';
  userId?: string;
  aiModel?: string;
  aiPromptHash?: string;
}
```

---

## 3. Lock Checking API

### Internal API (for AI Orchestrator)

```typescript
// Check if a specific field is locked
function isFieldLocked(documentId: string, fieldPath: string): boolean;

// Get all locked fields for a document
function getLockedFields(documentId: string): string[];

// Filter a set of fields, returning only unlocked ones
function filterUnlockedFields(documentId: string, fieldPaths: string[]): string[];

// Get full field metadata for a document
function getFieldMeta(documentId: string): DocumentFieldMeta;
```

### REST API Endpoints (for Admin Dashboard)

```
GET  /api/content/:collection/:slug/_fieldMeta
     → Returns full _fieldMeta for a document

PUT  /api/content/:collection/:slug/_fieldMeta/:fieldPath/lock
     → Manually lock a field
     → Body: { reason?: "manual-lock" | "approved" }

PUT  /api/content/:collection/:slug/_fieldMeta/:fieldPath/unlock
     → Unlock a field (user action only)

PUT  /api/content/:collection/:slug/_fieldMeta/lock-all
     → Lock all AI-generated fields on a document

PUT  /api/content/:collection/:slug/_fieldMeta/unlock-all
     → Unlock all fields on a document
```

### Critical Constraint

**AI agents can never call the unlock endpoints.** This must be enforced at the API auth level — requests from AI actor context are rejected on unlock operations. Only user-authenticated requests can unlock fields.

---

## 4. AI Orchestrator Integration

The AI Orchestrator (in `@webhouse/cms-ai`) wraps all agent write operations in a lock-aware proxy.

### Execution Flow

```
Agent.execute(task, context):

1. Orchestrator receives task with target document + fields
2. For each target field:
   a. Call isFieldLocked(docId, fieldPath)
   b. If locked → add to skippedFields[], continue to next field
   c. If unlocked → pass to agent for processing
3. Agent processes only unlocked fields
4. Orchestrator writes results with actor: "ai" context
5. Return result including skippedFields report

Result shape:
{
  success: true,
  processed: ["seo.metaTitle", "seo.metaDescription", "tags"],
  skipped: [
    { field: "description", reason: "user-edit", lockedAt: "2026-03-10..." },
    { field: "title", reason: "approved", lockedAt: "2026-03-09..." }
  ],
  costs: { tokens: 1200, estimatedCost: 0.003 }
}
```

### Batch Operations

For batch operations across multiple documents (e.g., "optimize all product descriptions"):

```
Batch result shape:
{
  operation: "seo-optimize",
  collection: "products",
  total: 47,
  processed: 44,
  skipped: 3,
  skippedDetails: [
    { slug: "premium-widget", field: "description", reason: "user-edit" },
    { slug: "basic-plan", field: "seo.metaTitle", reason: "approved" },
    { slug: "starter-kit", field: "description", reason: "manual-lock" }
  ]
}
```

---

## 5. Schema Configuration

Fields can declare default AI Lock behavior in `cms.config.ts`:

```typescript
// In collection field definitions:
{
  name: 'description',
  type: 'richtext',
  ai: {
    generate: true,
    tone: 'persuasive',
  },
  aiLock: {
    autoLockOnEdit: true,       // Default: true — lock when user edits AI content
    lockable: true,             // Default: true — field can be manually locked
    requireApproval: false,     // If true: AI content stays "pending" until approved
  },
}
```

### Default Behavior

If no `aiLock` config is specified on a field, defaults are:

```typescript
{
  autoLockOnEdit: true,
  lockable: true,
  requireApproval: false,
}
```

Fields with `ai.generate: false` or no `ai` config still support manual locking — a user can lock any field, not just AI-generated ones.

---

## 6. Implementation Order

Since the core CMS is already being built, integrate in this order:

```
Step 1: Add _fieldMeta to document storage schema
        → Add JSON column / property to documents
        → Migrate existing documents to have empty _fieldMeta: {}

Step 2: Add WriteContext with actor to content CRUD layer
        → Every write operation must carry actor context
        → Update all existing write calls to include actor

Step 3: Implement auto-lock in content update handler
        → Diff old vs new values
        → Apply lock rules based on actor + field state

Step 4: Implement lock checking functions (isFieldLocked, etc.)
        → Internal API for AI orchestrator
        → REST endpoints for admin dashboard

Step 5: Wire lock checking into AI orchestrator
        → Wrap agent execute/stream in lock-aware proxy
        → Include skipped fields in all AI operation results

Step 6: (Phase 3) Admin dashboard UI
        → Lock/unlock icons per field
        → Batch lock/unlock controls
        → Skipped fields reports for batch operations
        → "View AI version" for locked fields
```

Steps 1–5 are foundation work (Phase 1–2). Step 6 is admin UI (Phase 3).

---

## 7. Test Cases

Minimum test coverage for AI Lock:

```
Core lock mechanics:
├── User edits AI-generated field → field auto-locks
├── User edits non-AI field → no lock applied
├── User manually locks unlocked field → locks with "manual-lock"
├── User unlocks locked field → unlocks
├── AI attempts write to locked field → write rejected, field unchanged
├── AI writes to unlocked field → succeeds, sets aiGenerated metadata
├── Import sets lock with "import" reason

Lock enforcement:
├── AI agent cannot call unlock endpoint → 403
├── Batch AI operation skips locked fields → returns skipped report
├── Lock survives document read/write cycle (persistence)
├── Lock works with nested field paths (seo.metaTitle)
├── Lock works with array field paths (body[2].heading)

Edge cases:
├── User edits field, AI tries to write same field in same request → lock wins
├── Document with no _fieldMeta → treated as all unlocked
├── Field deleted and recreated → lock state resets
├── Concurrent user edit + AI batch → user edit locks, AI skips
```

---

*This patch adds AI Lock as a foundational feature. It touches the content storage layer, CRUD operations, AI orchestrator, and API surface. All changes are additive — no existing functionality needs to be removed or rewritten, but the WriteContext addition may require updating existing write call sites.*
