# F14 — Newsletter Engine

> AI-powered newsletter generation from published CMS content — auto-assembly, React Email rendering, subscriber management, scheduling with Calendar integration, and click analytics.

## Problem

The CMS creates great content but has no way to distribute it via email. Users who want newsletters must:

1. Manually pick articles and copy-paste into Mailchimp/Beehiiv
2. Maintain subscribers in a separate platform (losing data ownership)
3. Pay platform taxes (Substack takes 10%, Beehiiv $99/mo at scale)
4. Keep two design systems in sync (site + email)
5. No connection between CMS content graph and newsletter content

A CMS-native newsletter engine eliminates all of this. The killer feature: **"Generate this week's newsletter from published articles"** — only possible when the AI has direct access to the content graph.

## Solution

Full newsletter system inside the CMS admin: AI-powered auto-assembly from published content, React Email rendering for cross-client compatibility, Resend/AWS SES for sending, subscriber management with GDPR compliance, click tracking with UTM auto-injection, scheduling integrated with the Calendar (F47), and a newsletter archive that's just regular CMS pages with full SEO benefit.

## Why CMS-Native Beats Standalone

| CMS-native (this) | Standalone (Substack/Beehiiv) |
|---|---|
| Content reuse — articles already exist, newsletter is a *view* | Copy-paste content between platforms |
| Single source of truth — one content model, multiple outputs | Content drift between site and email |
| AI assembly — "generate from published articles" | No CMS integration |
| Consistent design — inherits site brand automatically | Separate design system |
| Data ownership — subscribers in your database | Locked into platform |
| No platform tax — only ESP fees ($0.10-$0.90/1K) | 10% revenue cut or $99/mo |
| Newsletter archive = SEO pages | Separate subdomain, no SEO |
| MCP/API access for automation | Closed platform |

## Technical Design

### 1. Newsletter Content Model

```typescript
// packages/cms-admin/src/lib/newsletter/types.ts

export interface Newsletter {
  id: string;
  subject: string;
  preheader?: string;                  // preview text shown in inbox
  subjectVariants?: string[];          // AI-generated A/B test variants

  // Content assembly
  intro: string;                       // AI-generated or hand-written intro
  articles: NewsletterArticle[];       // selected CMS content
  outro?: string;                      // closing text, CTA
  customBlocks?: NewsletterBlock[];    // additional content blocks

  // Rendering
  templateId: string;                  // React Email template
  renderedHtml?: string;               // cached rendered output

  // Lifecycle
  status: "draft" | "scheduled" | "sending" | "sent" | "failed";
  scheduledAt?: string;                // integrates with Calendar (F47)
  sentAt?: string;
  createdAt: string;
  updatedAt: string;

  // Analytics
  recipientCount?: number;
  stats?: NewsletterStats;
}

export interface NewsletterArticle {
  collection: string;
  slug: string;
  title: string;
  excerpt?: string;                    // AI-generated summary for email
  imageUrl?: string;
  url: string;                         // full URL with UTM params
}

export interface NewsletterBlock {
  type: "text" | "image" | "cta" | "divider" | "quote";
  content: string;
  style?: Record<string, string>;
}

export interface NewsletterStats {
  delivered: number;
  opened: number;                      // unreliable (Apple Mail inflates)
  clicked: number;                     // primary reliable metric
  unsubscribed: number;
  bounced: number;
  topLinks: Array<{ url: string; clicks: number }>;
}
```

### 2. Subscriber Management (GDPR-Compliant)

```typescript
// packages/cms-admin/src/lib/newsletter/subscribers.ts

export interface Subscriber {
  id: string;
  email: string;
  name?: string;
  status: "pending" | "active" | "unsubscribed" | "bounced" | "complained";
  tags?: string[];                     // for segmentation

  // GDPR compliance
  subscribedAt: string;
  confirmedAt?: string;                // double opt-in confirmation timestamp
  consentSource: string;               // form URL or "import" or "manual"
  consentIp?: string;                  // IP at time of consent
  unsubscribedAt?: string;

  // Engagement
  lastOpenedAt?: string;
  lastClickedAt?: string;
  sendCount: number;
}

// Storage: _data/subscribers.json (filesystem) or Supabase table (GitHub adapter)
```

**Double opt-in flow:**
1. User submits email via signup form
2. CMS sends confirmation email with signed JWT link
3. User clicks link → `confirmedAt` set, status → "active"
4. GDPR consent proof stored: timestamp, IP, source URL

**Required email headers (Gmail/Yahoo mandate since Feb 2024):**
```
List-Unsubscribe: <https://site.com/api/newsletter/unsubscribe?token=...>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

### 3. React Email Rendering

Use React Email to build email templates that render to cross-client compatible HTML:

```typescript
// packages/cms-admin/src/lib/newsletter/templates/digest.tsx

import { Html, Head, Body, Container, Section, Row, Column,
         Heading, Text, Link, Img, Hr, Preview } from "@react-email/components";

export function DigestTemplate({ newsletter }: { newsletter: Newsletter }) {
  return (
    <Html>
      <Head />
      <Preview>{newsletter.preheader ?? newsletter.subject}</Preview>
      <Body style={{ backgroundColor: "#f6f6f6", fontFamily: "system-ui, sans-serif" }}>
        <Container style={{ maxWidth: "600px", margin: "0 auto" }}>
          {/* Logo header */}
          <Section style={{ padding: "32px 24px 0" }}>
            <Img src={`${siteUrl}/logo.png`} width="140" alt={siteName} />
          </Section>

          {/* AI-generated intro */}
          <Section style={{ padding: "24px" }}>
            <Text style={{ fontSize: "16px", lineHeight: "1.6", color: "#333" }}>
              {newsletter.intro}
            </Text>
          </Section>

          {/* Article cards */}
          {newsletter.articles.map((article) => (
            <Section key={article.slug} style={{ padding: "16px 24px" }}>
              {article.imageUrl && (
                <Img src={article.imageUrl} width="552" style={{ borderRadius: "8px" }} />
              )}
              <Heading as="h2" style={{ fontSize: "20px", margin: "16px 0 8px" }}>
                <Link href={article.url}>{article.title}</Link>
              </Heading>
              <Text style={{ fontSize: "14px", color: "#666", lineHeight: "1.5" }}>
                {article.excerpt}
              </Text>
              <Link href={article.url} style={{ fontSize: "14px", color: "#F7BB2E" }}>
                Read more →
              </Link>
            </Section>
          ))}

          {/* Footer with unsubscribe */}
          <Hr />
          <Section style={{ padding: "16px 24px", textAlign: "center" }}>
            <Text style={{ fontSize: "12px", color: "#999" }}>
              You received this because you subscribed at {siteName}.
              <Link href="{{unsubscribeUrl}}">Unsubscribe</Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
```

**Template types:**
- `digest` — Multiple articles with summaries (weekly roundup)
- `spotlight` — Single article feature with full excerpt
- `announcement` — Plain text with CTA button (product launch, event)
- `custom` — Freeform blocks (text, images, CTAs, dividers)

### 4. AI Newsletter Agent

```typescript
// packages/cms-ai/src/agents/newsletter.ts

export class NewsletterAgent {
  /**
   * Auto-assemble newsletter from recent published articles.
   * Picks the most relevant articles, writes intro + summaries, suggests subject lines.
   */
  async autoAssemble(options: {
    since?: string;           // articles published since this date
    maxArticles?: number;     // default: 5
    tone?: string;            // from brand voice
    template?: string;        // digest | spotlight | announcement
  }): Promise<{
    subject: string;
    subjectVariants: string[];  // 3-5 alternatives for A/B
    preheader: string;
    intro: string;
    articles: NewsletterArticle[];  // with AI-generated excerpts
    outro: string;
  }>;

  /**
   * Generate subject line variants and predict engagement.
   */
  async generateSubjectLines(newsletter: Newsletter): Promise<{
    variants: Array<{ text: string; predictedOpenRate: string }>;
  }>;

  /**
   * Check newsletter for spam triggers before sending.
   */
  async spamCheck(html: string): Promise<{
    score: number;          // 0-10, lower is better
    issues: string[];       // "ALL CAPS in subject", "Too many exclamation marks", etc.
    suggestions: string[];
  }>;

  /**
   * Generate article excerpt optimized for email (120-160 chars).
   */
  async summarizeForEmail(article: Document): Promise<string>;
}
```

### 5. Click Tracking & UTM

All links in the newsletter are rewritten to go through a tracking endpoint:

```
Original:  https://mysite.com/blog/my-post
Rewritten: https://mysite.com/api/newsletter/click?nid={newsletterId}&url={encoded}&sid={subscriberId}
```

The endpoint logs the click, then redirects 302 to the original URL with UTM params:

```
https://mysite.com/blog/my-post?utm_source=newsletter&utm_medium=email&utm_campaign={newsletterId}
```

Open tracking via 1x1 transparent pixel (unreliable but conventional):

```html
<img src="https://mysite.com/api/newsletter/open?nid={id}&sid={subId}" width="1" height="1" />
```

### 6. ESP Integration

```typescript
// packages/cms-admin/src/lib/newsletter/senders/index.ts

export interface EmailSender {
  send(options: {
    to: string;
    from: string;
    replyTo?: string;
    subject: string;
    html: string;
    headers?: Record<string, string>;
    tags?: string[];
  }): Promise<{ messageId: string }>;

  sendBatch(options: {
    messages: Array<{ to: string; html: string }>;  // personalized per subscriber
    from: string;
    subject: string;
    headers?: Record<string, string>;
  }): Promise<{ sent: number; failed: number }>;
}
```

**Default: Resend** — same team as React Email, 3K/mo free, modern webhooks.
**Power user: AWS SES** — $0.10/1K sends, requires own bounce handling.

ESP config in Site Settings → Newsletter tab.

### 7. Calendar Integration (F47)

Scheduled newsletters appear in the Calendar page alongside scheduled publishes:

```typescript
// Calendar shows:
// - Scheduled document publishes (existing)
// - Scheduled unpublishes (existing)
// - Scheduled newsletter sends (new)
```

Newsletter calendar entries link directly to the newsletter editor.

### 8. Newsletter Archive

Every sent newsletter is automatically saved as a CMS page accessible at `/newsletter/{id}`. This gives full SEO benefit — newsletter content is indexable, shareable, and discoverable.

### 9. API Routes

```
# Newsletter CRUD
GET    /api/admin/newsletters              → list all newsletters
POST   /api/admin/newsletters              → create newsletter
GET    /api/admin/newsletters/[id]         → get newsletter detail
PUT    /api/admin/newsletters/[id]         → update newsletter
DELETE /api/admin/newsletters/[id]         → delete newsletter

# AI operations
POST   /api/admin/newsletters/auto-assemble  → AI picks articles + writes content
POST   /api/admin/newsletters/[id]/compose   → AI writes intro/summaries for selected articles
POST   /api/admin/newsletters/[id]/subjects  → AI generates subject line variants
POST   /api/admin/newsletters/[id]/spam-check → AI checks for spam triggers

# Sending
POST   /api/admin/newsletters/[id]/send      → send to all active subscribers
POST   /api/admin/newsletters/[id]/send-test → send test to single email
POST   /api/admin/newsletters/[id]/schedule  → schedule send (integrates with Calendar)

# Subscribers
GET    /api/admin/subscribers                → list subscribers
POST   /api/admin/subscribers                → add subscriber
POST   /api/admin/subscribers/import         → bulk import CSV
DELETE /api/admin/subscribers/[id]           → delete subscriber (GDPR Art. 17)
GET    /api/admin/subscribers/export         → export all (GDPR Art. 15)

# Public endpoints (no auth)
POST   /api/newsletter/subscribe             → signup form submission
GET    /api/newsletter/confirm?token=...     → double opt-in confirmation
GET    /api/newsletter/unsubscribe?token=... → one-click unsubscribe
POST   /api/newsletter/unsubscribe           → List-Unsubscribe-Post (RFC 8058)
GET    /api/newsletter/click?nid=...&url=... → click tracking redirect
GET    /api/newsletter/open?nid=...&sid=...  → open tracking pixel
```

### 10. Admin UI

New sidebar item: **Newsletter** (under Content group)

**Newsletter list page** (`/admin/newsletter`):
- List of all newsletters with status badges (draft/scheduled/sent)
- "New newsletter" and "Auto-assemble" buttons
- Stats columns: recipients, opens, clicks

**Newsletter editor** (`/admin/newsletter/[id]`):
- Subject line input with "AI Suggest" button (generates 5 variants)
- Article picker: grid of published articles, click to add
- AI-generated intro (editable richtext)
- Live email preview (rendered React Email in iframe)
- "Send test" to your own email
- "Schedule" date/time picker (shows in Calendar)
- "Send now" with confirmation
- Spam check results panel

**Subscriber page** (`/admin/newsletter/subscribers`):
- Subscriber table with search/filter
- Import CSV / Export CSV buttons
- Status filters: active, pending, unsubscribed, bounced
- Subscriber count + growth chart

### 11. Signup Form Component

Embeddable form for sites built with the CMS:

```tsx
// Framework adapter export
import { NewsletterSignup } from "@webhouse/cms/components";

// Or standalone HTML snippet for any site
<form action="https://site.com/api/newsletter/subscribe" method="POST">
  <input type="email" name="email" required placeholder="your@email.com" />
  <button type="submit">Subscribe</button>
  <input type="hidden" name="source" value="homepage-footer" />
</form>
```

### 12. Storage

```
_data/
  newsletters/
    {id}.json                  # newsletter content + metadata
  subscribers.json             # subscriber list
  newsletter-stats/
    {id}.json                  # per-newsletter analytics
  newsletter-config.json       # ESP config, from/reply-to, template settings
```

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/newsletter/` — new directory (types, senders, templates, tracking)
- `packages/cms-ai/src/agents/newsletter.ts` — new AI agent
- `packages/cms-admin/src/app/api/admin/newsletters/` — new API routes
- `packages/cms-admin/src/app/api/newsletter/` — new public endpoints (subscribe, unsubscribe, click, open)
- `packages/cms-admin/src/app/admin/(workspace)/newsletter/` — new admin pages
- `packages/cms-admin/src/components/sidebar.tsx` — add Newsletter item
- `packages/cms-admin/src/app/admin/(workspace)/scheduled/page.tsx` — Calendar shows newsletter sends
- `packages/cms-admin/package.json` — add `@react-email/components`, `resend`

### Downstream dependents
- `sidebar.tsx` (new menu item) — no breaking changes, additive
- `scheduled/page.tsx` (Calendar integration) — extend existing calendar data source, no breaking change
- `_data/` directory — new files only, no existing files modified

### Blast radius
- New public endpoints (`/api/newsletter/*`) are unauthenticated — rate limiting critical
- Subscriber data is PII — GDPR compliance mandatory
- ESP API keys stored in config — must be encrypted/in .env
- Click tracking rewrites all links — must preserve original URL exactly

### Breaking changes
- None — entirely new system, no existing interfaces modified

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] React Email template renders in Gmail, Outlook, Apple Mail
- [ ] AI auto-assembly picks correct articles from date range
- [ ] Double opt-in flow: signup → email → confirm → active
- [ ] One-click unsubscribe (RFC 8058) works in Gmail
- [ ] Click tracking logs correctly and redirects to original URL
- [ ] UTM params auto-injected on all links
- [ ] Test send delivers to real inbox (not spam)
- [ ] Spam check catches ALL CAPS subject, excessive punctuation
- [ ] Calendar shows scheduled newsletter sends
- [ ] Newsletter archive page renders at /newsletter/{id}
- [ ] CSV import/export works with 1000+ subscribers
- [ ] GDPR export includes all subscriber data

## Implementation Steps

### Phase 1 — Core Engine (days 1-3)
1. Create `packages/cms-admin/src/lib/newsletter/types.ts`
2. Create subscriber management: CRUD, double opt-in, unsubscribe
3. Create ESP adapter: Resend (default) + AWS SES (power user)
4. Create React Email templates: digest, spotlight, announcement
5. Create newsletter CRUD API routes
6. Create public endpoints: subscribe, confirm, unsubscribe

### Phase 2 — AI + Tracking (days 3-5)
7. Create `packages/cms-ai/src/agents/newsletter.ts` — auto-assembly, subject lines, spam check
8. Implement click tracking (link rewrite → redirect endpoint)
9. Implement open tracking (1x1 pixel)
10. Add UTM auto-injection to all newsletter links
11. Create analytics storage + dashboard data

### Phase 3 — Admin UI (days 5-7)
12. Build newsletter list page with status badges
13. Build newsletter editor: article picker, subject AI, preview
14. Build subscriber management page: table, import/export, filters
15. Add "Auto-assemble" button: AI picks articles + writes everything
16. Add spam check results panel
17. Add sidebar menu item

### Phase 4 — Integration (days 7-8)
18. Calendar integration: scheduled sends show alongside publishes
19. Newsletter archive: auto-generate CMS page for each sent newsletter
20. Signup form component for site embedding
21. Scheduler integration: auto-send at scheduled time


> **NOTE — F107 Chat Integration:** When this feature introduces new API routes, tools, or admin actions, ensure they are also exposed as tool-use functions in F107 (Chat with Your Site). The chat interface must be able to perform any action the traditional admin UI can. See `docs/features/F107-chat-with-your-site.md`.

## Dependencies

- React Email (`@react-email/components`) — email template rendering
- Resend (`resend`) — default ESP
- F47 (Content Scheduling) — Done. Calendar integration for scheduled sends
- F15 (Agent Scheduler) — for automated send at scheduled time
- AI provider — for auto-assembly, subject lines, spam check

## Effort Estimate

**Large** — 8-10 days

- Days 1-3: Core engine (subscribers, ESP, templates, CRUD)
- Days 3-5: AI agent + click/open tracking + UTM
- Days 5-7: Admin UI (editor, subscriber page, article picker)
- Days 7-8: Calendar integration, archive pages, signup form
- Days 9-10: Testing across email clients, GDPR audit, polish

---

> **Testing (F99):** This feature MUST include tests using the [F99 Test Infrastructure](F99-e2e-testing-suite.md).
> - **Unit tests** → `packages/cms-admin/src/lib/__tests__/{feature}.test.ts` or `packages/cms/src/__tests__/{feature}.test.ts`
> - **API tests** → `packages/cms-admin/tests/api/{feature}.test.ts`
> - **E2E tests** → `packages/cms-admin/e2e/suites/{nn}-{feature}.spec.ts`
> - Use shared fixtures: `auth.ts` (JWT login), `mock-llm.ts` (intercept AI), `test-data.ts` (seed/cleanup)
> - Tests are written BEFORE implementation. All tests must pass before merge.
