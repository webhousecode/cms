# F14 — Newsletter Engine

> AI-powered newsletter generation from published content with ESP integration.

## Problem

There is no way to generate and send newsletters from the CMS. Users who want to share content via email must manually curate articles, compose the newsletter in an external tool, and manage subscribers separately.

## Solution

A newsletter engine that lets editors select published articles, uses AI to compose a newsletter in the site's brand voice, and sends via an Email Service Provider (Resend, SendGrid, or AWS SES). Includes subscriber management and scheduling.

## Technical Design

### Data Models

```typescript
// packages/cms-admin/src/lib/newsletter/types.ts

export interface Newsletter {
  id: string;
  subject: string;
  preheader?: string;
  articles: Array<{ collection: string; slug: string }>;  // selected content
  body: string;                // HTML body (AI-generated or manually edited)
  status: 'draft' | 'scheduled' | 'sending' | 'sent';
  scheduledAt?: string;
  sentAt?: string;
  recipientCount?: number;
  openRate?: number;
  clickRate?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Subscriber {
  id: string;
  email: string;
  name?: string;
  status: 'active' | 'unsubscribed' | 'bounced';
  subscribedAt: string;
  unsubscribedAt?: string;
  source: 'manual' | 'form' | 'import';
}

export interface NewsletterConfig {
  provider: 'resend' | 'sendgrid' | 'ses';
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  unsubscribeUrl: string;     // link to unsubscribe page
}
```

### AI Composition

```typescript
// packages/cms-ai/src/agents/newsletter.ts

export class NewsletterAgent {
  async compose(
    articles: Document[],
    options: {
      tone?: string;
      brandVoice?: string;
      maxLength?: number;
      template?: 'digest' | 'spotlight' | 'roundup';
    }
  ): Promise<{ subject: string; preheader: string; body: string }>;
}
```

### ESP Adapters

```typescript
// packages/cms-admin/src/lib/newsletter/senders/

export interface EmailSender {
  send(options: {
    to: string[];
    from: string;
    subject: string;
    html: string;
    headers?: Record<string, string>;
  }): Promise<{ messageId: string; accepted: number; rejected: number }>;
}

// resend.ts — uses Resend API
// sendgrid.ts — uses SendGrid API
// ses.ts — uses AWS SES SDK
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/newsletters` | List newsletters |
| `POST` | `/api/admin/newsletters` | Create newsletter |
| `PUT` | `/api/admin/newsletters/[id]` | Update newsletter |
| `POST` | `/api/admin/newsletters/[id]/compose` | AI compose from selected articles |
| `POST` | `/api/admin/newsletters/[id]/send` | Send newsletter |
| `POST` | `/api/admin/newsletters/[id]/send-test` | Send test to single email |
| `GET` | `/api/admin/subscribers` | List subscribers |
| `POST` | `/api/admin/subscribers` | Add subscriber |
| `POST` | `/api/admin/subscribers/import` | Bulk import from CSV |
| `GET` | `/api/newsletter/unsubscribe?token=...` | Public unsubscribe |

### Storage

- Newsletters: `<dataDir>/newsletters/`
- Subscribers: `<dataDir>/subscribers.json`

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/newsletter/types.ts` — new newsletter types
- `packages/cms-admin/src/lib/newsletter/senders/` — ESP adapters (Resend, SendGrid, SES)
- `packages/cms-ai/src/agents/newsletter.ts` — new newsletter AI agent
- `packages/cms-admin/src/app/api/admin/newsletters/` — new API routes
- `packages/cms-admin/src/app/admin/newsletters/page.tsx` — new editor page
- `packages/cms-admin/src/app/admin/subscribers/page.tsx` — new subscriber management

### Blast radius
- Email sending capability is new — test with actual ESPs to avoid deliverability issues
- Subscriber data is PII — requires proper handling

### Breaking changes
- None

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Newsletter AI composition produces valid HTML email
- [ ] Test email sends correctly via configured ESP
- [ ] Subscriber import from CSV works
- [ ] Unsubscribe endpoint removes subscriber

## Implementation Steps

1. Create `packages/cms-admin/src/lib/newsletter/types.ts`
2. Create ESP adapters: `resend.ts`, `sendgrid.ts`, `ses.ts`
3. Create `packages/cms-ai/src/agents/newsletter.ts` for AI composition
4. Create API routes for newsletter CRUD and sending
5. Build newsletter editor page at `packages/cms-admin/src/app/admin/newsletters/page.tsx`
6. Build article picker component (select from published content)
7. Add "AI Compose" button that generates newsletter from selected articles
8. Build subscriber management page at `packages/cms-admin/src/app/admin/subscribers/page.tsx`
9. Implement public unsubscribe endpoint
10. Add newsletter scheduling via the existing scheduler system
11. Build HTML email template with inline CSS

## Dependencies

- F29 (Transactional Email) — shares ESP adapter code but can be built independently
- AI provider for composition

## Effort Estimate

**Large** — 5-7 days
