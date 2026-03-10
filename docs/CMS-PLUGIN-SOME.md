# @webhouse/cms-plugin-some — Social Media Plugin

## Architecture & Development Plan

**Version:** 0.1.0-draft
**Status:** Plugin Architecture Specification
**Package:** `@webhouse/cms-plugin-some`
**Dependency:** `@webhouse/cms` ^0.1.0, `@webhouse/cms-ai` ^0.1.0
**Platforms:** Facebook, Instagram, LinkedIn, Google Business Profile

---

## 1. Plugin Overview

### 1.1 What This Plugin Does

The social media plugin extends `@webhouse/cms` with a **Social Media Bank** — an AI-powered content pool that generates, formats, and stages social media posts for human review and approval. It follows the same philosophy as the rest of the CMS: AI does the heavy lifting, humans stay in control.

The plugin does **not** auto-post to Meta or LinkedIn without approval. This is a deliberate choice, not a limitation. See §1.3 for the rationale.

### 1.2 Design Principles

- **Human-in-the-loop by default** — AI generates, humans approve. One click to copy. No surprises in the feed.
- **Content-first, not distribution-first** — Posts are derived from existing CMS content (articles, treatments, products, FAQs). The AI knows the site; it doesn't hallucinate topics.
- **Platform-aware formatting** — One source post generates platform-specific variants. Facebook, Instagram, and LinkedIn each have different optimal tone, length, and structure.
- **AI Lock compatible** — Posts that a human has edited manually are locked from AI rewrites, following the same `_fieldMeta` contract as the rest of the CMS (see `@webhouse/cms` §4.7).
- **Full automation where it's safe** — Google Business Profile updates are fully automated. Meta and LinkedIn require human approval due to platform policy constraints and brand risk.
- **RAG-aware** — If a RAG/AI guide is running on the same site, the plugin can request post suggestions directly through the CMS Content API (`actor: 'ai'`). The guide knows the customer's universe; the plugin leverages that knowledge.

### 1.3 Why Not Full Automation for Meta and LinkedIn?

Two reasons — one technical, one strategic:

**Technical:** Meta Graph API requires a verified Business App approval process. Meta aggressively throttles and changes API terms without notice. LinkedIn's Creator API is restricted to verified content partners. Maintaining these integrations for small clients is disproportionately expensive relative to the value.

**Strategic:** For personal brands like Sanne Andersen (the reference client), authenticity is the product. An auto-posted AI-generated post that lands at the wrong moment, in the wrong tone, or about a topic that's since become sensitive can damage years of trust-building. The five minutes it takes Sanne to review, copy, and post is not friction — it's brand protection.

**Google Business Profile is the exception:** The GBP API is straightforward, fully owned by Google (no third-party approval process), and regular updates have direct SEO impact on Google Maps and local search rankings. This is the one channel where full automation makes sense and carries minimal brand risk.

---

## 2. Core Architecture

### 2.1 System Overview

```
┌──────────────────────────────────────────────────────────────┐
│                  @webhouse/cms-plugin-some                    │
│                                                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐  │
│  │  Social Media   │  │    Platform     │  │    Google    │  │
│  │  Bank           │  │    Formatter    │  │    Business  │  │
│  │                 │  │                 │  │    Profile   │  │
│  │  - Post drafts  │  │  - FB variant   │  │              │  │
│  │  - AI generator │  │  - IG variant   │  │  - Auto-post │  │
│  │  - Review queue │  │  - LI variant   │  │  - Scheduled │  │
│  │  - Approval     │  │  - Hashtag bank │  │  - Updates   │  │
│  └────────┬────────┘  └────────┬────────┘  └──────┬───────┘  │
│           │                    │                   │          │
│  ┌────────▼────────────────────▼───────────────────▼───────┐  │
│  │                    CMS Content API                       │  │
│  │  actor: 'ai'  →  WriteContext  →  _fieldMeta tracking   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    AI SoMe Agent                          │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │  │
│  │  │  Post        │  │  Hashtag     │  │  Image        │  │  │
│  │  │  Generator   │  │  Curator     │  │  Suggester    │  │  │
│  │  └──────────────┘  └──────────────┘  └───────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 Hook Integration with CMS Core

The plugin registers itself through the CMS plugin system (Phase 3.5 in `CMS-ENGINE.md`):

```
Plugin Registration:

Hooks:
├── content.afterCreate     → Trigger post suggestions when new content is published
├── content.afterUpdate     → Re-suggest posts if source content changes significantly
├── build.afterRender       → Refresh GBP post queue after each build
└── ai.afterGenerate        → Auto-suggest SoMe variants after AI content generation

Collections Registered:
├── someBank                → Post drafts (all platforms, all states)
├── someHashtags            → Curated hashtag sets per niche/topic
└── gbpUpdates              → Google Business Profile update queue

API Routes Registered:
├── POST   /api/some/generate          → Generate post suggestions from source content
├── GET    /api/some/bank              → List post drafts (filterable by platform/status)
├── PUT    /api/some/bank/:id/approve  → Mark post as approved (ready to copy)
├── PUT    /api/some/bank/:id/reject   → Reject and optionally regenerate
├── POST   /api/some/gbp/publish       → Publish to Google Business Profile (auto)
└── GET    /api/some/gbp/queue         → View pending GBP update queue
```

---

## 3. Content Model

### 3.1 Social Media Bank Collection (`someBank`)

```
Collection: "someBank"

Fields:
├── sourceDocumentId (relation → any collection, optional)
│   // The CMS document this post was derived from
│   // null = manually created or AI-generated from topic alone
├── sourceType (enum: article | product | treatment | faq | seasonal | manual)
├── topic (text — summary of what the post is about)
│
├── status (enum: draft | approved | copied | archived)
│   // draft    = AI-generated, awaiting human review
│   // approved = human has reviewed and approved
│   // copied   = human has copied to clipboard / posted externally
│   // archived = rejected or expired
│
├── scheduledFor (date, optional)
│   // Suggested posting date — informational only, not auto-posted
│
├── platforms (object)
│   ├── facebook (object)
│   │   ├── text (richtext — typically 150–300 words)
│   │   ├── tone (enum: storytelling | informational | promotional)
│   │   └── status (enum: pending | approved | copied)
│   │
│   ├── instagram (object)
│   │   ├── text (text — concise, max 2200 chars, emoji-optimised)
│   │   ├── hashtags (text[] — from hashtag bank)
│   │   ├── hashtagBlock (text — formatted hashtag block, ready to paste)
│   │   └── status (enum: pending | approved | copied)
│   │
│   └── linkedin (object)
│       ├── text (richtext — professional tone, typically 100–200 words)
│       ├── angle (enum: expertise | insight | behind-the-scenes | event)
│       └── status (enum: pending | approved | copied)
│
├── imageId (relation → media library, optional)
│   // Suggested image from the site's own media library
│
├── generatedBy (enum: ai | human | rag-agent)
├── aiModel (text — which model generated the post)
│
└── _fieldMeta (DocumentFieldMeta — standard AI Lock tracking)
    // Fields edited by humans are auto-locked, AI cannot overwrite them
```

### 3.2 Hashtag Bank Collection (`someHashtags`)

```
Collection: "someHashtags"

Fields:
├── name (text — descriptive name, e.g. "Zoneterapi — Aalborg")
├── platform (enum: instagram | all)
│   // Hashtags are primarily relevant for Instagram
├── category (enum: niche | location | treatment | seasonal | brand)
├── tags (text[] — the actual hashtags without #)
│   // e.g. ["zoneterapi", "zonetherapy", "reflexology", "healingaalborg"]
├── usageCount (number — auto-incremented when used)
├── lastUsedAt (date)
└── active (boolean — exclude from rotation if false)
```

### 3.3 Google Business Profile Updates (`gbpUpdates`)

```
Collection: "gbpUpdates"

Fields:
├── type (enum: post | offer | event | covid-update)
├── title (text — short headline, max 58 chars)
├── body (text — post text, max 1500 chars)
├── ctaType (enum: book | order | shop | learn-more | sign-up | call | none)
├── ctaUrl (text, optional)
│
├── imageId (relation → media library, optional)
│
├── offer (object, when type = offer)
│   ├── title (text)
│   ├── startDate (date)
│   ├── endDate (date)
│   └── couponCode (text, optional)
│
├── event (object, when type = event)
│   ├── title (text)
│   ├── startDate (date)
│   └── endDate (date)
│
├── status (enum: queued | published | failed | archived)
├── publishedAt (date, auto-set on success)
├── gbpPostId (text, returned by GBP API on success)
└── error (text, populated on failure for retry logic)
```

---

## 4. AI SoMe Agent

### 4.1 Post Generator

The SoMe Agent is an extension of the existing `@webhouse/cms-ai` architecture. It follows the same provider-agnostic pattern as `ContentAgent` and `SeoAgent`.

```
SomeAgent.generate(input) → SomePostResult

Input:
├── source: Document | string    // CMS document or free-form topic
├── platforms: Platform[]        // Which platforms to generate for
├── collection: CollectionConfig // Source collection schema (for field context)
├── siteContext: {               // Injected from cms.config.ts
│     brandVoice: string         // e.g. "warm, professional, evidence-based"
│     businessName: string
│     owner: string              // e.g. "Sanne Andersen"
│     niche: string              // e.g. "zoneterapi og TCM, Aalborg"
│     credentials: string        // e.g. "zoneterapeut, PhD, TCM-praktiker"
│   }
├── hashtags: HashtagSet[]       // From someHashtags collection
└── seasonalContext: string      // e.g. "marts 2026 — forår, påske"

Output:
├── facebook: { text, tone }
├── instagram: { text, hashtags, hashtagBlock }
├── linkedin: { text, angle }
├── imageId: string | null       // Suggested image from media library
└── usage: { inputTokens, outputTokens, estimatedCostUsd }
```

### 4.2 Platform-Specific Formatting Rules

The agent applies platform-specific rules automatically:

```
Facebook:
├── Length: 150–300 words (optimal engagement range)
├── Tone: conversational, personal, storytelling angle
├── Structure: hook → story/insight → soft CTA
├── Emojis: 1–3 maximum, used sparingly
├── Links: one link in post body is standard
└── Audience: existing clients + local community

Instagram:
├── Length: 3–5 lines visible + "more" fold, total max 2200 chars
├── Tone: warm, emoji-friendly, visual-first
├── Structure: hook line → short value content → hashtag block
├── Emojis: 5–10, used as visual anchors and line breaks
├── Hashtags: 20–28 tags in a separate block at the end
│   ├── 5–8 niche-specific (e.g. #zoneterapi)
│   ├── 5–8 treatment-specific (e.g. #reflexology)
│   ├── 3–5 location-specific (e.g. #aalborg #aalborgcity)
│   ├── 3–5 lifestyle/wellness (e.g. #naturligtsundhed)
│   └── 2–3 brand/owner tags (e.g. #sanneandersen)
└── Audience: potential new clients, wellness community

LinkedIn:
├── Length: 100–200 words
├── Tone: professional, evidence-based, expertise-forward
├── Structure: insight/observation → expertise angle → invitation to connect
├── Credentials: mention PhD or clinical background when relevant
├── Emojis: 0–2, only for structure (bullet points, section breaks)
├── Links: in comments rather than post body (better reach)
└── Audience: peers, referrers, health professionals, HR buyers
```

### 4.3 Seasonal Content Calendar

The agent can generate a rolling 2-week suggestion queue based on the calendar and the client's content:

```
Seasonal triggers (examples for Sanne's universe):
├── January  → stress, new year, reset, immune system
├── February → heart health, circulation, self-care
├── March    → spring energy, detox, seasonal transition
├── April    → Easter, renewal, outdoor wellbeing
├── May      → energy, outdoor, vitamin D
├── June     → summer preparation, travel, sun
├── August   → back-to-routine, stress prevention
├── September→ autumn immunity, sleep quality
├── October  → cold season, immune support
├── November → seasonal affective, energy, warmth
├── December → stress, gift ideas (treatments + gavekorter), year-end

Combined with:
├── New content published on site → auto-suggest post
├── Products/treatments → monthly rotation suggestion
├── FAQs → "did you know" posts
└── Testimonials (anonymised) → social proof posts
```

### 4.4 RAG Agent Integration

When a RAG/AI guide is running on the same site, the SoMe plugin can request suggestions through the standard CMS Content API — no special integration needed:

```
Flow: RAG agent → CMS Content API → Social Media Bank

1. RAG agent detects a relevant trigger
   (e.g. many users asking about sleep treatment this week)

2. RAG agent calls:
   POST /api/content/someBank
   {
     "status": "draft",
     "data": {
       "topic": "søvnforstyrrelser og zoneterapi",
       "sourceType": "rag-agent",
       "generatedBy": "rag-agent"
     }
   }
   with WriteContext { actor: 'ai', aiModel: 'claude-sonnet-4-6' }

3. SoMe plugin hook picks up the new draft and
   triggers SomeAgent.generate() to fill out all platform variants

4. Draft appears in Social Media Bank for human review
```

---

## 5. Google Business Profile — Full Automation

### 5.1 Why GBP is Different

Unlike Meta and LinkedIn, the GBP API:
- Requires only a Google Cloud service account — no partner approval process
- Is maintained by Google with stable API contracts
- Serves content directly into Google Search and Maps results
- Has direct, measurable SEO impact for local businesses

For a local practitioner like Sanne Andersen, appearing regularly in Google Maps with fresh content is more valuable per-post than most social media activity.

### 5.2 Auto-Post Flow

```
┌────────────────────────────────────────────────────────────┐
│              GBP Auto-Post Pipeline                         │
│                                                             │
│  Triggers (any of):                                         │
│  ├── New article published on site                          │
│  ├── New treatment or product added                         │
│  ├── Weekly scheduled run (configurable, default: Tuesday)  │
│  └── Manual trigger from admin dashboard                    │
│                                                             │
│  Pipeline:                                                  │
│  1. SomeAgent generates GBP post from source content        │
│     (shorter format: title + 150 words + CTA + image)       │
│                                                             │
│  2. Post added to gbpUpdates collection (status: queued)    │
│                                                             │
│  3. Auto-publish via Google My Business API                 │
│     POST mybusiness.googleapis.com/v4/{locationName}/posts  │
│                                                             │
│  4. On success: gbpUpdates.status → published               │
│     On failure: gbpUpdates.status → failed, error logged    │
│     Retry: max 3 attempts with exponential backoff          │
│                                                             │
│  5. CLI command available for manual trigger:               │
│     cms some gbp publish                                     │
└────────────────────────────────────────────────────────────┘
```

### 5.3 GBP Post Types Supported

```
Post types:
├── What's New (standard update)
│   └── Used for: articles, insights, seasonal content
│
├── Offer
│   └── Used for: gavekorter, kampagner, introductions
│   └── Requires: start date, end date (Stripe price data via shop plugin)
│
└── Event
    └── Used for: workshops, open house, courses
    └── Requires: event start + end datetime
```

---

## 6. CLI Commands

```
cms some generate                     → Generate a new batch of post suggestions
cms some generate --source <slug>     → Generate from specific CMS document
cms some generate --topic "<text>"    → Generate from free-form topic
cms some generate --weeks 2           → Generate 2-week rolling queue

cms some bank                         → List all post drafts
cms some bank --status draft          → Show only drafts awaiting review
cms some bank --platform instagram    → Filter by platform

cms some gbp publish                  → Publish queued GBP updates now
cms some gbp queue                    → Show pending GBP queue

cms some hashtags sync                → Re-sync hashtag bank from config
```

---

## 7. Configuration in `cms.config.ts`

```
The SoMe plugin is configured in cms.config.ts:

some:
├── brand:
│   ├── name (string — business name)
│   ├── owner (string — personal brand name, e.g. "Sanne Andersen")
│   ├── voice (string — brand voice description)
│   ├── niche (string — e.g. "zoneterapi og TCM, Aalborg")
│   └── credentials (string — qualifications to mention when relevant)
│
├── platforms:
│   ├── facebook:
│   │   └── enabled (boolean, default true)
│   ├── instagram:
│   │   ├── enabled (boolean, default true)
│   │   └── hashtagSets (string[] — which hashtag collections to draw from)
│   └── linkedin:
│       └── enabled (boolean, default true)
│
├── googleBusinessProfile:
│   ├── enabled (boolean, default false)
│   ├── locationId (string — from GBP: accounts/{accountId}/locations/{locationId})
│   ├── serviceAccountKey (from .env: GBP_SERVICE_ACCOUNT_JSON)
│   ├── autoPublish (boolean, default true — only GBP)
│   ├── schedule (cron string, default "0 9 * * 2" — Tuesday 09:00)
│   └── defaultCtaType (enum: book | learn-more | call, default "book")
│
├── generation:
│   ├── postsPerWeek (number, default 5)
│   ├── seasonalContext (boolean, default true)
│   ├── deriveFromNewContent (boolean, default true)
│   └── ragIntegration (boolean, default false)
│
└── hashtags:
    └── (defined per HashtagSet in someHashtags collection)
```

---

## 8. Development Phases

### Phase 1: Social Media Bank (MVP)

**Goal:** AI generates post drafts from existing site content. Human reviews, copies, posts manually.

```
Deliverables:
├── Plugin scaffold and CMS registration
│   ├── someBank collection
│   ├── someHashtags collection
│   └── content.afterCreate hook → auto-trigger generation on publish
│
├── AI SoMe Agent
│   ├── Post generation (Facebook, Instagram, LinkedIn)
│   ├── Platform-specific formatting rules
│   ├── Hashtag bank integration
│   └── Image suggestion from media library
│
├── CLI commands
│   ├── cms some generate
│   └── cms some bank
│
└── Tests
    ├── Post generation for each platform
    ├── Hashtag set rotation
    ├── AI Lock — human-edited posts not overwritten
    └── content.afterCreate hook triggers generation
```

**Milestone:** Publish a new blog post on the site → Social Media Bank automatically gets 3 post drafts (one per platform) → Sanne reviews in 5 minutes, copies to clipboard, posts manually.

### Phase 2: Google Business Profile Automation

**Goal:** GBP updates are fully automated. Zero manual steps.

```
Deliverables:
├── gbpUpdates collection
├── Google My Business API integration
│   ├── Service account auth
│   ├── Post creation (What's New, Offer, Event)
│   ├── Image attachment
│   └── Retry logic on failure
├── Scheduled auto-publish (configurable cron)
├── CLI: cms some gbp publish / queue
└── Tests
    ├── GBP API auth
    ├── Post creation for each type
    ├── Retry on transient failure
    └── Scheduled run integration
```

**Milestone:** New treatment added to site → GBP post generated and published automatically → Appears in Google Maps within minutes.

### Phase 3: Seasonal Calendar & RAG Integration

**Goal:** Proactive post suggestions based on calendar and RAG agent signals.

```
Deliverables:
├── Seasonal content calendar engine
│   ├── Month/season-aware post topic suggestions
│   ├── Rolling 2-week queue generation
│   └── Holiday and cultural event awareness (DK calendar)
│
├── RAG agent integration
│   ├── RAG agent can POST draft topics to someBank via Content API
│   ├── Plugin hooks pick up and expands to full platform variants
│   └── Trending topics from conversation data surface as suggestions
│
├── Post analytics hooks (read-only)
│   └── Track which posts were approved vs rejected
│       (improves future generation quality over time)
│
└── Tests
    ├── Seasonal trigger logic
    ├── RAG-initiated draft flow
    └── Analytics event tracking
```

**Milestone:** Plugin automatically suggests a March-themed post about spring energy and zoneterapi at the start of March — without any manual input. Sanne sees it in the bank, approves, copies.

### Phase 4: Admin Dashboard Integration

**Goal:** Visual Social Media Bank in the Admin UI.

```
Deliverables:
├── Social Media Bank view in Admin Dashboard
│   ├── Post cards with platform previews
│   ├── Approve / reject / regenerate actions
│   ├── "Copy to clipboard" button per platform
│   └── Status indicators (draft / approved / copied)
│
├── Hashtag bank manager
│   ├── Visual hashtag set editor
│   └── Usage analytics (which tags perform well)
│
├── GBP queue view
│   ├── Pending, published, failed posts
│   └── Manual publish trigger
│
└── Configuration UI
    ├── Brand voice editor
    └── Platform enable/disable toggles
```

**Milestone:** Non-developer can manage the entire Social Media Bank visually without touching CLI or config files.

---

## 9. Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Meta / LinkedIn posting | Not auto-posted | Platform policy constraints + brand risk for personal brands |
| GBP posting | Fully automated | Simple Google service account auth, direct SEO value, low brand risk |
| Post storage | CMS collections (someBank) | Leverages existing storage adapters, AI Lock, query API |
| Hashtag management | CMS collection (someHashtags) | Editable by non-developers, versioned, queryable |
| Scheduling | Cron via CLI / server | Simple, no external service dependency, configurable |
| RAG integration | Via standard Content API | No special coupling — RAG agent is just another `actor: 'ai'` caller |
| Image suggestions | Media library lookup | Uses existing media pipeline, no external image generation required |

---

## 10. Core Prerequisites

This plugin requires **no Core patches beyond what is already implemented** in `@webhouse/cms` 0.1.0. It uses:

- `ContentService.create()` and `update()` with `WriteContext { actor: 'ai' }`
- `_fieldMeta` AI Lock for protecting human-edited post drafts
- `POST /api/content/:collection` for RAG agent integration
- The hook system for `content.afterCreate` (requires Phase 3.5 Plugin API from `CMS-ENGINE.md`)

The GBP integration and the AI SoMe Agent can be built and tested in isolation using the existing REST API and `@webhouse/cms-ai` provider registry, before Phase 3.5's Plugin API is complete.

---

## 11. Open Questions

1. **Approval workflow** — Should "approved" posts be auto-copied to clipboard, or should there be a "staging area" where Sanne can schedule intended posting dates?
2. **Meta direct posting** — If Meta approves a Business App in the future, should we support optional auto-posting behind a feature flag?
3. **Post performance feedback** — Should Sanne be able to mark a post as "performed well" / "flopped" to improve future AI suggestions?
4. **Story format** — Facebook and Instagram Stories have different dimensions and formats from feed posts. Out of scope for now, or Phase 1?
5. **Reels / video** — Short-form video content is increasingly important on Instagram and LinkedIn. Should the plugin suggest video topics even if it can't generate the video itself?
6. **Thread format** — LinkedIn and X (if relevant) support multi-post threads for long-form content. Worth supporting as a post format?
7. **Client approval flow** — If WebHouse manages multiple clients, should there be a client-facing approval view (no admin access needed, just approve/reject)?

---

*Plugin specification by WebHouse ApS · cb@webhouse.dk*
*Builds on `@webhouse/cms` architecture — see `CMS-ENGINE.md` for Core roadmap*
