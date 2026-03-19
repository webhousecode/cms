# F29 — Transactional Email

> Send emails from the CMS via AWS SES, Resend, or SendGrid with template support.

## Problem

The CMS cannot send emails. Invite emails (F01), form submission notifications (F30), and event-triggered emails all require an email sending capability. There is no email template system.

## Solution

A transactional email service with ESP adapter abstraction, an email template editor in admin, event-triggered sending, and send history with delivery tracking.

## Technical Design

### Email Service

```typescript
// packages/cms-admin/src/lib/email/service.ts

export interface EmailConfig {
  provider: 'resend' | 'sendgrid' | 'ses';
  resend?: { apiKey: string };
  sendgrid?: { apiKey: string };
  ses?: { region: string; accessKeyId: string; secretAccessKey: string };
  from: { email: string; name: string };
  replyTo?: string;
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;              // plain text fallback
  replyTo?: string;
  tags?: Record<string, string>;
}

export interface SendResult {
  messageId: string;
  status: 'sent' | 'failed';
  error?: string;
  timestamp: string;
}

export class EmailService {
  constructor(private config: EmailConfig) {}

  async send(message: EmailMessage): Promise<SendResult>;
  async sendTemplate(templateId: string, data: Record<string, unknown>, to: string | string[]): Promise<SendResult>;
}
```

### ESP Adapters

```typescript
// packages/cms-admin/src/lib/email/adapters/

export interface EmailAdapter {
  send(message: EmailMessage): Promise<SendResult>;
}

// resend.ts — uses Resend SDK: `new Resend(apiKey)`
// sendgrid.ts — uses @sendgrid/mail
// ses.ts — uses @aws-sdk/client-ses
```

### Email Templates

```typescript
// packages/cms-admin/src/lib/email/templates.ts

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;            // supports {{variables}}
  html: string;               // HTML with {{variables}}
  variables: string[];        // expected variable names
  createdAt: string;
  updatedAt: string;
}
```

Stored at `<dataDir>/email-templates/`.

### Event Triggers

```typescript
// packages/cms-admin/src/lib/email/triggers.ts

export interface EmailTrigger {
  id: string;
  event: string;             // e.g. 'content.published', 'form.submitted'
  templateId: string;
  recipients: string[];       // email addresses or 'admin' placeholder
  enabled: boolean;
}
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/email/templates` | List templates |
| `POST` | `/api/admin/email/templates` | Create template |
| `PUT` | `/api/admin/email/templates/[id]` | Update template |
| `POST` | `/api/admin/email/send-test` | Send test email |
| `GET` | `/api/admin/email/history` | Send history |
| `GET` | `/api/admin/email/triggers` | List triggers |
| `POST` | `/api/admin/email/triggers` | Create trigger |

### Send History

```typescript
export interface SendHistoryEntry {
  id: string;
  templateId?: string;
  to: string[];
  subject: string;
  status: 'sent' | 'failed';
  messageId?: string;
  error?: string;
  sentAt: string;
}
```

Stored at `<dataDir>/email-history.jsonl`.

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/email/service.ts` — new email service
- `packages/cms-admin/src/lib/email/adapters/resend.ts` — new Resend adapter
- `packages/cms-admin/src/lib/email/adapters/sendgrid.ts` — new SendGrid adapter
- `packages/cms-admin/src/lib/email/adapters/ses.ts` — new SES adapter
- `packages/cms-admin/src/lib/email/templates.ts` — new template system
- `packages/cms-admin/src/app/api/admin/email/` — new API routes
- `packages/cms-admin/src/app/admin/settings/email/page.tsx` — new settings page

### Blast radius
- Email service is a foundation for F01 (invites), F14 (newsletters), F30 (forms) — API must be stable
- ESP credentials are sensitive — must be stored securely

### Breaking changes
- None

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Test email sends via each configured ESP
- [ ] Template variable interpolation works
- [ ] Send history logged correctly
- [ ] Event triggers fire on configured events

## Implementation Steps

1. Create `packages/cms-admin/src/lib/email/service.ts` with ESP abstraction
2. Implement Resend adapter (`npm install resend`)
3. Implement SendGrid adapter (`npm install @sendgrid/mail`)
4. Implement SES adapter (`npm install @aws-sdk/client-ses`)
5. Create template system with variable interpolation
6. Create API routes at `packages/cms-admin/src/app/api/admin/email/`
7. Build template editor at `packages/cms-admin/src/app/admin/settings/email/page.tsx`
8. Build email config page (provider selection, credentials, from address)
9. Implement event trigger system
10. Build send history page
11. Add "Send Test" button for templates

## Dependencies

- None — standalone system used by F01, F14, F30

## Effort Estimate

**Medium** — 3-4 days
