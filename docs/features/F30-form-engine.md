# F30 — Form Engine

> CMS-native form builder and submission handler. Define forms in config, render them at build time, collect submissions in the admin inbox, notify via email + webhook. Zero third-party dependencies. Works OOTB on every deploy target.

## Problem

Sites built with the CMS have no way to handle form submissions. Contact forms, signup forms, feedback forms — all require integrating a third-party service (Formspree, Netlify Forms, Getform) or building custom API routes. That adds cost, vendor lock-in, and data you don't own.

The fundamental challenge: the CMS generates **static** sites. A static HTML page has no server to POST to. The submission endpoint must live somewhere that's always running.

## Solution

**The CMS admin itself is the form backend.** It's always running (Fly.io, Docker, localhost), already has authentication, storage, and email infrastructure. Forms POST cross-origin from the static site directly to the admin API. Submissions are stored as JSON files in `_data/submissions/<form>/`. The admin UI has an inbox with unread badges, read/archive/delete, CSV export.

### What CMS delivers OOTB (dev touches nothing)

- Form definition in `cms.config.ts` → `forms: [{ name, label, fields, notifications, spam }]`
- `cms build` generates `<form>` HTML with action pointing at admin, honeypot field, CORS headers
- Public `POST /api/forms/[name]` endpoint with schema validation, honeypot, IP rate limit
- Submissions stored as `_data/submissions/<form>/<id>.json` with status lifecycle (new → read → archived)
- Email notification on submission (Resend/SES via F29, or SMTP fallback)
- Webhook forwarding (Discord, Slack, Zapier, custom URL)
- Admin inbox: `/admin/forms` with per-form list, unread badge in sidebar, CSV export
- Embeddable widget script for non-CMS pages

### What dev does (only for advanced use cases)

- Custom CSS styling of the generated `<form>`
- Client-side validation beyond what HTML5 `required`/`pattern`/`type` provides
- Turnstile/reCAPTCHA integration (optional — dev adds script, CMS validates token server-side)
- Next.js sites: proxy form submission via their own API route if they prefer

### What's NOT in scope

- Payment forms (Stripe/Lemonsqueezy direct)
- Multi-step form wizards (CMS gives flat forms; wizards are app logic)
- File uploads via forms (media library upload is separate — possible v2 extension)
- Visual drag-and-drop form builder (v2 — start with config-based)

## Technical Design

### 1. Form Configuration

```typescript
// packages/cms/src/schema/types.ts — extend CmsConfig

export interface FormConfig {
  name: string;                // unique id, e.g. "contact"
  label: string;               // displayed in admin, e.g. "Contact Form"
  fields: FormFieldConfig[];
  successMessage?: string;     // shown after submit, default "Thank you!"
  successRedirect?: string;    // redirect URL after submit (overrides message)
  notifications?: {
    email?: string[];          // addresses to notify
    webhook?: string;          // URL to forward full submission to
  };
  spam?: {
    honeypot?: boolean;        // default: true
    rateLimit?: number;        // max submissions per IP per hour, default: 5
  };
}

export interface FormFieldConfig {
  name: string;
  type: "text" | "email" | "textarea" | "select" | "checkbox" | "number" | "phone" | "url" | "date" | "hidden";
  label: string;
  required?: boolean;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;  // for select
  defaultValue?: string;       // for hidden fields (e.g. page slug)
  validation?: {
    pattern?: string;          // regex
    minLength?: number;
    maxLength?: number;
  };
}

// In CmsConfig:
export interface CmsConfig {
  // ...existing fields
  forms?: FormConfig[];
}
```

### 2. Submission Storage

```typescript
// packages/cms-admin/src/lib/forms/types.ts

export interface FormSubmission {
  id: string;
  form: string;                // form name
  data: Record<string, unknown>;
  status: "new" | "read" | "archived";
  ip?: string;                 // hashed for privacy, used for rate limiting
  userAgent?: string;
  createdAt: string;
  readAt?: string;
}
```

Stored at `<dataDir>/submissions/<form-name>/<id>.json`. One file per submission. Same directory convention as revisions — the dataDir is per-site.

### 3. Form Service

```typescript
// packages/cms-admin/src/lib/forms/service.ts

export class FormService {
  constructor(private dataDir: string) {}

  /** List all submissions for a form, newest first. */
  async list(formName: string, opts?: { status?: string }): Promise<FormSubmission[]>;

  /** Get a single submission. */
  async get(formName: string, id: string): Promise<FormSubmission | null>;

  /** Create a new submission (called by public endpoint). */
  async create(formName: string, data: Record<string, unknown>, meta: { ip?: string; userAgent?: string }): Promise<FormSubmission>;

  /** Mark as read / archived. */
  async updateStatus(formName: string, id: string, status: "read" | "archived"): Promise<void>;

  /** Delete a submission. */
  async delete(formName: string, id: string): Promise<void>;

  /** Count unread submissions across all forms (for sidebar badge). */
  async unreadCounts(): Promise<Record<string, number>>;

  /** Export all submissions for a form as CSV. */
  async exportCsv(formName: string): Promise<string>;
}
```

### 4. Spam Protection

```typescript
// packages/cms-admin/src/lib/forms/spam.ts

/** Check honeypot field (hidden field that bots fill). */
export function checkHoneypot(body: Record<string, unknown>): boolean;

/** IP rate limiter — in-memory Map with TTL sweep, same pattern as qr-sessions. */
export function checkRateLimit(ip: string, formName: string, maxPerHour: number): boolean;

/** Optional: validate Cloudflare Turnstile token. */
export async function validateTurnstile(token: string, secret: string): Promise<boolean>;
```

### 5. API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/forms/[name]` | Public (CORS + rate-limited) | Submit form |
| `GET` | `/api/admin/forms` | Auth required | List forms + unread counts |
| `GET` | `/api/admin/forms/[name]/submissions` | Auth required | List submissions |
| `GET` | `/api/admin/forms/[name]/submissions/[id]` | Auth required | Get single submission |
| `PATCH` | `/api/admin/forms/[name]/submissions/[id]` | Auth required (editor+) | Update status |
| `DELETE` | `/api/admin/forms/[name]/submissions/[id]` | Auth required (editor+) | Delete submission |
| `GET` | `/api/admin/forms/[name]/export` | Auth required | CSV export |
| `GET` | `/api/forms/[name]/schema` | Public | Form schema (for widget) |

The public `POST /api/forms/[name]` endpoint:

1. CORS: allow origin from site's `previewSiteUrl` + any configured `corsOrigins`
2. Parse body (form-urlencoded or JSON)
3. Reject if honeypot field is filled
4. Reject if IP rate limit exceeded
5. Validate fields against form schema
6. Hash IP (sha256 + truncate to 8 chars — enough for rate limiting, not trackable)
7. Save to `_data/submissions/<name>/<id>.json`
8. Fire email notification (async, don't block response)
9. Fire webhook (async)
10. Fire `form.submitted` webhook event (F35 integration)
11. Return 200 + `{ ok: true, message: successMessage }`
12. Or redirect to `successRedirect` if configured and request is form-urlencoded

### 6. Build Integration

`cms build` generates a `<form>` for each configured form and places it in the output directory at `forms/<name>/index.html` (or injects into a page template if the site's build.ts requests it).

The generated form includes:
- Semantic HTML: `<form action="https://admin.url/api/forms/contact" method="POST">`
- All fields with correct HTML5 types, `required`, `pattern`, `placeholder`
- Honeypot field: `<div style="position:absolute;left:-9999px"><input name="_hp_email" tabindex="-1" autocomplete="off"></div>`
- Minimal JS for async submit + success/error message (no framework, ~1KB, optional — form works without JS via native form POST + redirect)
- CSRF isn't needed (public endpoint, rate-limited, no auth cookies)

### 7. Admin UI

**Sidebar placement:** Below Interactives, above the separator.

```
📄 Posts
📄 Pages
🧩 Interactives
📬 Forms (3)          ← badge = total unread across all forms
⚙️ Site Settings
```

**`/admin/forms` page:**

List of all configured forms with:
- Form name + label
- Unread / total count
- Last submission date
- Click → opens submission inbox

**`/admin/forms/[name]` page:**

Inbox-style list:
- Each row: date, key field values (first 2-3 text fields as preview), status dot (blue = new, grey = read)
- Click row → expands/opens detail panel with all fields
- Bulk actions: mark read, archive, delete
- CSV export button
- Status filter: new / read / archived / all

### 8. Embeddable Widget

A standalone script for embedding forms on pages not generated by the CMS:

```html
<script src="https://admin.example.com/api/forms/contact/widget.js"></script>
<div id="webhouse-form-contact"></div>
```

The script fetches the form schema from `/api/forms/contact/schema`, renders a styled form, handles submission via fetch, shows success/error inline. ~5KB uncompressed, zero dependencies.

### 9. Webhook Event Integration (F35)

Fires a `form.submitted` event through the existing webhook system:

```json
{
  "event": "form.submitted",
  "form": "contact",
  "timestamp": "...",
  "data": {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "message": "..."
  }
}
```

Discord embed shows form name + first few fields. Email notification uses the same Resend/SES transport as F29.

## Impact Analysis

### Files created (new)
- `packages/cms-admin/src/lib/forms/types.ts` — FormSubmission type
- `packages/cms-admin/src/lib/forms/service.ts` — FormService class
- `packages/cms-admin/src/lib/forms/spam.ts` — honeypot + rate limiter
- `packages/cms-admin/src/lib/forms/notify.ts` — email + webhook notification
- `packages/cms-admin/src/lib/__tests__/forms.test.ts` — unit tests
- `packages/cms-admin/src/app/api/forms/[name]/route.ts` — public submission endpoint
- `packages/cms-admin/src/app/api/forms/[name]/schema/route.ts` — public schema endpoint
- `packages/cms-admin/src/app/api/forms/[name]/widget.js/route.ts` — embeddable widget
- `packages/cms-admin/src/app/api/admin/forms/route.ts` — admin list + unread counts
- `packages/cms-admin/src/app/api/admin/forms/[name]/submissions/route.ts` — submission CRUD
- `packages/cms-admin/src/app/api/admin/forms/[name]/submissions/[id]/route.ts` — single submission
- `packages/cms-admin/src/app/api/admin/forms/[name]/export/route.ts` — CSV export
- `packages/cms-admin/src/app/admin/(workspace)/forms/page.tsx` — forms list page
- `packages/cms-admin/src/app/admin/(workspace)/forms/[name]/page.tsx` — submission inbox
- `packages/cms-admin/src/components/forms/submission-list.tsx` — inbox UI
- `packages/cms-admin/src/components/forms/submission-detail.tsx` — detail panel

### Files modified
- `packages/cms/src/schema/types.ts` — add `FormConfig`, `FormFieldConfig`, `forms?` to `CmsConfig`
- `packages/cms/src/schema/validate.ts` — add form validation rules
- `packages/cms-admin/src/components/sidebar.tsx` — add Forms menu item + badge
- `packages/cms-admin/src/lib/webhook-events.ts` — add `form.submitted` event type
- `packages/cms-admin/src/middleware.ts` — CORS for `/api/forms/*` public endpoints

### Downstream dependents for modified files

**`packages/cms/src/schema/types.ts`** is imported by 15 files:
- `packages/cms/src/index.ts` — re-export, add `FormConfig` + `FormFieldConfig`
- `packages/cms/src/schema/validate.ts` — add form schema validation
- `packages/cms/src/schema/define.ts` — unaffected (collections only)
- `packages/cms/src/schema/to-json-schema.ts` — unaffected
- `packages/cms/src/schema/introspect.ts` — unaffected
- `packages/cms/src/build/resolve.ts` — unaffected
- `packages/cms/src/build/pipeline.ts` — unaffected
- `packages/cms/src/content/service.ts` — unaffected
- `packages/cms/src/i18n/helpers.ts` — unaffected
- `packages/cms/src/api/server.ts` — unaffected
- `packages/cms/src/api/routes/manifest.ts` — unaffected
- `packages/cms/src/api/routes/schema.ts` — unaffected
- `packages/cms/src/next/llms.ts` — unaffected
- `packages/cms/src/__tests__/to-json-schema.test.ts` — unaffected

**`packages/cms-admin/src/components/sidebar.tsx`** has no downstream dependents (leaf component).

**`packages/cms-admin/src/lib/webhook-events.ts`** is imported by:
- `packages/cms-admin/src/lib/agent-runner.ts` — unaffected
- `packages/cms-admin/src/app/api/admin/webhooks/test/route.ts` — unaffected
- Multiple API routes that fire existing events — unaffected

**`packages/cms-admin/src/middleware.ts`** has no downstream dependents (Next.js entry point).

### Blast radius
- **CORS:** The public `/api/forms/*` endpoints need CORS. Adding CORS middleware for these paths specifically — must NOT accidentally loosen CORS on authenticated admin routes.
- **Type extension:** `CmsConfig.forms` is optional — backwards compatible. No existing config breaks.
- **CollectionKind:** `"form"` already exists in F127 — no new kind needed.
- **Storage:** Submissions use `_data/submissions/` (new directory) — no collision with existing `_data/` content.
- **Rate limiter:** In-memory Map, same pattern as QR sessions. Single-instance only. Same limitation.

### Breaking changes
None. `forms` on CmsConfig is optional.

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Form submission creates JSON file in `_data/submissions/<form>/`
- [ ] Honeypot blocks bot submissions
- [ ] Rate limiting works per IP (>5/hour → 429)
- [ ] Schema validation rejects missing required fields
- [ ] Email notification sent on submission (when configured)
- [ ] Webhook forwarded on submission (when configured)
- [ ] `form.submitted` event fires through F35 webhook system
- [ ] Admin inbox shows unread count, mark read, archive, delete
- [ ] CSV export includes all submissions
- [ ] CORS allows configured origins, rejects others
- [ ] Existing email/password login unaffected
- [ ] Existing collection CRUD unaffected
- [ ] Sidebar badge updates on new submission

## Implementation Steps

1. Add `FormConfig` + `FormFieldConfig` to `packages/cms/src/schema/types.ts`, re-export from index
2. Create `packages/cms-admin/src/lib/forms/types.ts` — `FormSubmission` interface
3. Create `packages/cms-admin/src/lib/forms/spam.ts` — honeypot + rate limiter
4. Create `packages/cms-admin/src/lib/forms/service.ts` — FormService with full CRUD
5. Create `packages/cms-admin/src/lib/forms/notify.ts` — email + webhook dispatch
6. Write tests: `packages/cms-admin/src/lib/__tests__/forms.test.ts`
7. Create public submission endpoint: `POST /api/forms/[name]`
8. Create public schema endpoint: `GET /api/forms/[name]/schema`
9. Add CORS middleware for `/api/forms/*` paths
10. Add `form.submitted` to webhook-events.ts
11. Create admin endpoints: list forms, submissions CRUD, CSV export
12. Add Forms menu item + unread badge to sidebar
13. Build `/admin/forms` page — form list with counts
14. Build `/admin/forms/[name]` page — submission inbox with detail panel
15. Create embeddable widget script endpoint
16. Add F107 chat tools: list_forms, list_submissions, get_submission
17. Docs: guide page on docs.webhouse.app
18. Dogfood: add contact form to webhouse-site

## Dependencies

- F35 (Webhooks) — Done. For `form.submitted` event dispatch.
- F29 (Transactional Email) — Optional. For email notifications. Falls back to console.log if not configured.
- F127 (Collection Purpose Metadata) — Done. `kind: "form"` already defined.

## Effort Estimate

**Medium** — 5 days

- Day 1: Schema types + FormService + spam protection + tests
- Day 2: Public submission endpoint + CORS + schema endpoint + webhook event
- Day 3: Admin inbox UI (list + detail + badge) + email/webhook notifications
- Day 4: CSV export + embeddable widget + chat tools
- Day 5: Docs + dogfood on webhouse-site contact form + polish

---

> **Testing (F99):** This feature MUST include tests using the [F99 Test Infrastructure](F99-e2e-testing-suite.md).
> - **Unit tests** → `packages/cms-admin/src/lib/__tests__/forms.test.ts`
> - **API tests** → `packages/cms-admin/tests/api/forms.test.ts`
> - Tests are written BEFORE implementation. All tests must pass before merge.

> **NOTE — F107 Chat Integration:** When this feature introduces new API routes, tools, or admin actions, ensure they are also exposed as tool-use functions in F107 (Chat with Your Site). The chat interface must be able to perform any action the traditional admin UI can. See `docs/features/F107-chat-with-your-site.md`.
