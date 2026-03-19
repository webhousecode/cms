# F30 — Form Engine

> Simple form builder with submission handling, notification, and spam protection.

## Problem

Sites built with the CMS have no way to handle form submissions (contact forms, sign-up forms, feedback forms). Users must integrate third-party form services or build custom API routes.

## Solution

A form engine that lets users define forms in config or admin UI, stores submissions as CMS documents, sends email notifications, includes spam protection (honeypot + rate limiting), and supports webhook forwarding and an embeddable widget.

## Technical Design

### Form Configuration

```typescript
// packages/cms/src/schema/types.ts — extend CmsConfig

export interface FormConfig {
  name: string;              // unique identifier, e.g. 'contact'
  label: string;
  fields: FormFieldConfig[];
  successMessage?: string;
  redirectUrl?: string;
  notifications: {
    email?: string[];        // email addresses to notify
    webhook?: string;        // URL to forward submission to
  };
  spam: {
    honeypot?: boolean;      // default: true
    rateLimit?: number;      // max submissions per IP per hour, default: 5
  };
}

export interface FormFieldConfig {
  name: string;
  type: 'text' | 'email' | 'textarea' | 'select' | 'checkbox' | 'number' | 'phone';
  label: string;
  required?: boolean;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;  // for select
  validation?: {
    pattern?: string;        // regex
    minLength?: number;
    maxLength?: number;
  };
}

// In CmsConfig:
forms?: FormConfig[];
```

### Submission Storage

Submissions are stored as documents in a `_submissions` collection:

```typescript
export interface FormSubmission {
  id: string;
  form: string;              // form name
  data: Record<string, unknown>;
  status: 'new' | 'read' | 'archived';
  ip?: string;               // for rate limiting (not stored long-term)
  userAgent?: string;
  createdAt: string;
  readAt?: string;
}
```

Stored at `<dataDir>/submissions/<form-name>/`.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/forms/[name]` | Submit form (public, rate-limited) |
| `GET` | `/api/admin/forms` | List forms |
| `GET` | `/api/admin/forms/[name]/submissions` | List submissions |
| `PUT` | `/api/admin/forms/[name]/submissions/[id]` | Mark as read/archived |
| `DELETE` | `/api/admin/forms/[name]/submissions/[id]` | Delete submission |
| `GET` | `/api/forms/[name]/schema` | Get form schema (for widget) |

### Embeddable Widget

```typescript
// packages/cms-form/src/widget.ts

// <script src="https://webhouse.app/form-widget.js" data-form="contact" data-site-id="xxx"></script>
// Renders a styled form, handles submission, shows success/error
```

### Spam Protection

```typescript
// packages/cms-admin/src/lib/forms/spam.ts

export class SpamProtection {
  /** Check honeypot field (hidden field that bots fill) */
  checkHoneypot(data: Record<string, unknown>): boolean;

  /** Rate limit by IP */
  checkRateLimit(ip: string, form: string): boolean;
}
```

### Admin UI

- Forms list at `/admin/forms`
- Submission inbox per form with read/unread status
- New submission count badge in sidebar
- Form config editor (visual field builder)

## Impact Analysis

### Files affected
- `packages/cms/src/schema/types.ts` — add `FormConfig` to `CmsConfig`
- `packages/cms-admin/src/lib/forms/service.ts` — new form service
- `packages/cms-admin/src/lib/forms/spam.ts` — new spam protection
- `packages/cms-admin/src/app/api/forms/[name]/route.ts` — new public submission endpoint
- `packages/cms-admin/src/app/admin/forms/page.tsx` — new forms list page
- `packages/cms-admin/src/app/admin/forms/[name]/page.tsx` — new submission inbox
- `packages/cms-form/` — new embeddable widget package

### Blast radius
- Public submission endpoint requires rate limiting and input validation
- `CmsConfig` type extension must be optional

### Breaking changes
- None — `forms` config is optional

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Form submission creates entry in submissions store
- [ ] Honeypot blocks bot submissions
- [ ] Rate limiting works per IP
- [ ] Email notification sent on submission (when configured)

## Implementation Steps

1. Add `FormConfig` and `FormFieldConfig` to `packages/cms/src/schema/types.ts`
2. Create `packages/cms-admin/src/lib/forms/service.ts` with submission CRUD
3. Create `packages/cms-admin/src/lib/forms/spam.ts` with honeypot and rate limiting
4. Create public submission endpoint at `/api/forms/[name]/route.ts`
5. Send email notification on submission (using F29 if available, otherwise console log)
6. Implement webhook forwarding (POST submission data to configured URL)
7. Create admin forms list page at `packages/cms-admin/src/app/admin/forms/page.tsx`
8. Create submission inbox page at `packages/cms-admin/src/app/admin/forms/[name]/page.tsx`
9. Build visual form field editor component
10. Create embeddable form widget in `packages/cms-form/`
11. Add submission count badge to admin sidebar

## Dependencies

- F29 (Transactional Email) — optional, for email notifications

## Effort Estimate

**Medium** — 4-5 days
