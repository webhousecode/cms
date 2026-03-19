# F69 — Social Media Plugin

> AI-powered Social Media Bank that generates platform-specific post drafts from CMS content, with human-in-the-loop approval for Meta/LinkedIn and full automation for Google Business Profile.

## Problem

Site owners publish content in the CMS but then manually write social media posts for each platform — a tedious, repetitive task that often gets skipped. Each platform (Facebook, Instagram, LinkedIn) has different optimal tone, length, hashtag conventions, and audience expectations. Google Business Profile updates have direct SEO impact but are rarely kept fresh. There is no connection between CMS content and social media output.

## Solution

A plugin package `@webhouse/cms-plugin-some` that adds a Social Media Bank — an AI-generated content pool of platform-specific post drafts derived from existing CMS content. The AI SoMe Agent in `@webhouse/cms-ai` generates drafts following platform-specific formatting rules. Humans review, approve, and copy-paste to post manually (for Meta/LinkedIn). Google Business Profile is the one exception: fully automated posting via the GBP API due to its simple auth model, direct SEO value, and low brand risk.

The plugin integrates with CMS hooks so that publishing a new article automatically triggers post draft generation. RAG agent integration surfaces trending conversation topics as post suggestions. A hashtag bank with rotation and usage tracking keeps Instagram posts optimized.

## Technical Design

### 1. Package Structure

```
packages/cms-plugin-some/
  ├── package.json              # @webhouse/cms-plugin-some
  ├── tsup.config.ts
  ├── src/
  │   ├── index.ts              # Plugin registration entry point
  │   ├── plugin.ts             # CmsPlugin implementation
  │   ├── collections/
  │   │   ├── some-bank.ts      # someBank collection schema
  │   │   ├── some-hashtags.ts  # someHashtags collection schema
  │   │   └── gbp-updates.ts   # gbpUpdates collection schema
  │   ├── agent/
  │   │   ├── some-agent.ts     # AI SoMe Agent — post generation
  │   │   ├── post-generator.ts # Platform-specific text generation
  │   │   ├── hashtag-curator.ts # Hashtag selection + rotation
  │   │   ├── image-suggester.ts # Media library image matching
  │   │   └── seasonal.ts       # Seasonal content calendar engine
  │   ├── platforms/
  │   │   ├── facebook.ts       # FB formatting rules
  │   │   ├── instagram.ts      # IG formatting rules + hashtag block
  │   │   ├── linkedin.ts       # LI formatting rules
  │   │   └── gbp.ts            # Google Business Profile API client
  │   ├── api/
  │   │   ├── generate.ts       # POST /api/some/generate
  │   │   ├── bank.ts           # GET /api/some/bank
  │   │   ├── approve.ts        # PUT /api/some/bank/:id/approve
  │   │   ├── reject.ts         # PUT /api/some/bank/:id/reject
  │   │   ├── gbp-publish.ts    # POST /api/some/gbp/publish
  │   │   └── gbp-queue.ts      # GET /api/some/gbp/queue
  │   └── types.ts
  └── tests/
      ├── post-generator.test.ts
      ├── hashtag-curator.test.ts
      ├── gbp.test.ts
      └── seasonal.test.ts
```

### 2. Plugin Registration

```typescript
// packages/cms-plugin-some/src/plugin.ts
import type { CmsPlugin } from '@webhouse/cms';

export const somePlugin: CmsPlugin = {
  name: '@webhouse/cms-plugin-some',
  displayName: 'Social Media',
  version: '0.1.0',

  collections: ['someBank', 'someHashtags', 'gbpUpdates'],

  hooks: {
    'content.afterCreate': async (ctx) => {
      // Auto-suggest social media posts when new content published
      if (ctx.collection !== 'someBank' && ctx.collection !== 'someHashtags') {
        await triggerPostGeneration(ctx.collection, ctx.slug);
      }
    },
    'content.afterUpdate': async (ctx) => {
      // Re-suggest posts if source content changes significantly
    },
    'build.afterRender': async (ctx) => {
      // Refresh GBP post queue after each build
    },
    'ai.afterGenerate': async (ctx) => {
      // Auto-suggest SoMe variants after AI content generation
    },
  },

  routes: [
    { method: 'POST', path: '/api/some/generate',            handler: generateHandler },
    { method: 'GET',  path: '/api/some/bank',                 handler: bankListHandler },
    { method: 'PUT',  path: '/api/some/bank/:id/approve',     handler: approveHandler },
    { method: 'PUT',  path: '/api/some/bank/:id/reject',      handler: rejectHandler },
    { method: 'POST', path: '/api/some/gbp/publish',          handler: gbpPublishHandler },
    { method: 'GET',  path: '/api/some/gbp/queue',            handler: gbpQueueHandler },
  ],
};
```

### 3. Social Media Bank Collection

```typescript
// packages/cms-plugin-some/src/collections/some-bank.ts
export const someBankCollection = {
  name: 'someBank',
  label: 'Social Media Bank',
  fields: {
    sourceDocumentId: { type: 'text' },           // Relation to source CMS document
    sourceType:       { type: 'select', options: ['article', 'product', 'treatment', 'faq', 'seasonal', 'manual'] },
    topic:            { type: 'text' },
    status:           { type: 'select', options: ['draft', 'approved', 'copied', 'archived'], default: 'draft' },
    scheduledFor:     { type: 'date' },            // Suggested posting date (informational)
    platforms: {
      type: 'object',
      fields: {
        facebook: {
          type: 'object',
          fields: {
            text:   { type: 'richtext' },          // 150-300 words, storytelling
            tone:   { type: 'select', options: ['storytelling', 'informational', 'promotional'] },
            status: { type: 'select', options: ['pending', 'approved', 'copied'] },
          },
        },
        instagram: {
          type: 'object',
          fields: {
            text:         { type: 'text' },        // Max 2200 chars, emoji-friendly
            hashtags:     { type: 'tags' },         // 20-28 hashtags from bank
            hashtagBlock: { type: 'text' },         // Ready-to-paste hashtag block
            status:       { type: 'select', options: ['pending', 'approved', 'copied'] },
          },
        },
        linkedin: {
          type: 'object',
          fields: {
            text:   { type: 'richtext' },          // 100-200 words, professional
            angle:  { type: 'select', options: ['expertise', 'insight', 'behind-the-scenes', 'event'] },
            status: { type: 'select', options: ['pending', 'approved', 'copied'] },
          },
        },
      },
    },
    imageId:     { type: 'media' },                // Suggested image from media library
    generatedBy: { type: 'select', options: ['ai', 'human', 'rag-agent'] },
    aiModel:     { type: 'text' },
  },
};
```

### 4. Hashtag Bank Collection

```typescript
// packages/cms-plugin-some/src/collections/some-hashtags.ts
export const someHashtagsCollection = {
  name: 'someHashtags',
  label: 'Hashtag Bank',
  fields: {
    name:       { type: 'text', required: true },   // e.g. "Zoneterapi - Aalborg"
    platform:   { type: 'select', options: ['instagram', 'all'], default: 'instagram' },
    category:   { type: 'select', options: ['niche', 'location', 'treatment', 'seasonal', 'brand'] },
    tags:       { type: 'tags' },                    // Hashtags without #
    usageCount: { type: 'number', default: 0 },
    lastUsedAt: { type: 'date' },
    active:     { type: 'boolean', default: true },
  },
};
```

### 5. Google Business Profile Collection

```typescript
// packages/cms-plugin-some/src/collections/gbp-updates.ts
export const gbpUpdatesCollection = {
  name: 'gbpUpdates',
  label: 'GBP Updates',
  fields: {
    type:        { type: 'select', options: ['post', 'offer', 'event'], required: true },
    title:       { type: 'text', maxLength: 58 },
    body:        { type: 'text', maxLength: 1500 },
    ctaType:     { type: 'select', options: ['book', 'order', 'shop', 'learn-more', 'sign-up', 'call', 'none'] },
    ctaUrl:      { type: 'text' },
    imageId:     { type: 'media' },
    // Offer-specific
    offerTitle:     { type: 'text' },
    offerStartDate: { type: 'date' },
    offerEndDate:   { type: 'date' },
    couponCode:     { type: 'text' },
    // Event-specific
    eventTitle:     { type: 'text' },
    eventStartDate: { type: 'date' },
    eventEndDate:   { type: 'date' },
    // Status
    status:      { type: 'select', options: ['queued', 'published', 'failed', 'archived'], default: 'queued' },
    publishedAt: { type: 'date' },
    gbpPostId:   { type: 'text' },
    error:       { type: 'text' },
  },
};
```

### 6. AI SoMe Agent

```typescript
// packages/cms-plugin-some/src/agent/some-agent.ts
// Extends @webhouse/cms-ai provider-agnostic agent architecture

interface SomeAgentInput {
  source: Document | string;          // CMS document or free-form topic
  platforms: ('facebook' | 'instagram' | 'linkedin')[];
  collection: CollectionConfig;
  siteContext: {
    brandVoice: string;               // e.g. "warm, professional, evidence-based"
    businessName: string;
    owner: string;
    niche: string;
    credentials: string;
  };
  hashtags: HashtagSet[];             // From someHashtags collection
  seasonalContext: string;            // e.g. "marts 2026 - forar, paske"
}

interface SomePostResult {
  facebook:  { text: string; tone: string } | null;
  instagram: { text: string; hashtags: string[]; hashtagBlock: string } | null;
  linkedin:  { text: string; angle: string } | null;
  imageId:   string | null;
  usage:     { inputTokens: number; outputTokens: number; estimatedCostUsd: number };
}
```

### 7. Platform-Specific Formatting Rules

| Platform | Length | Tone | Emoji | Hashtags | Structure |
|----------|--------|------|-------|----------|-----------|
| Facebook | 150-300 words | Conversational, storytelling | 1-3 max | None in post | Hook -> story -> soft CTA |
| Instagram | Max 2200 chars | Warm, emoji-friendly | 5-10 as visual anchors | 20-28 in separate block (5-8 niche + 5-8 treatment + 3-5 location + 3-5 lifestyle + 2-3 brand) | Hook line -> value content -> hashtag block |
| LinkedIn | 100-200 words | Professional, evidence-based | 0-2 for structure only | None (links in comments) | Insight -> expertise angle -> invitation to connect |

### 8. Seasonal Content Calendar

Rolling 2-week suggestion queue based on month/season + existing CMS content:

```typescript
// packages/cms-plugin-some/src/agent/seasonal.ts
const seasonalTriggers: Record<number, string[]> = {
  1:  ['stress', 'new year', 'reset', 'immune system'],
  2:  ['heart health', 'circulation', 'self-care'],
  3:  ['spring energy', 'detox', 'seasonal transition'],
  4:  ['easter', 'renewal', 'outdoor wellbeing'],
  5:  ['energy', 'outdoor', 'vitamin D'],
  6:  ['summer preparation', 'travel', 'sun'],
  7:  ['vacation', 'relaxation', 'self-care summer'],
  8:  ['back-to-routine', 'stress prevention'],
  9:  ['autumn immunity', 'sleep quality'],
  10: ['cold season', 'immune support'],
  11: ['seasonal affective', 'energy', 'warmth'],
  12: ['stress', 'gift ideas', 'year-end reflection'],
};
```

Combined with: new content published, product/treatment rotation, FAQ "did you know" posts, anonymized testimonials for social proof.

### 9. RAG Agent Integration

No special coupling needed. The RAG agent POSTs draft topics to the `someBank` collection via the standard CMS Content API with `WriteContext { actor: 'ai' }`:

```
RAG detects trending topic (e.g. many users asking about sleep this week)
  -> POST /api/content/someBank { status: 'draft', topic: '...', sourceType: 'rag-agent' }
  -> content.afterCreate hook triggers SomeAgent.generate() for platform variants
  -> Draft appears in Social Media Bank for human review
```

### 10. GBP Auto-Post Pipeline

```
Trigger (new article / weekly cron / manual)
  -> SomeAgent generates GBP post (title + 150 words + CTA + image)
  -> Saved to gbpUpdates collection (status: queued)
  -> POST mybusiness.googleapis.com/v4/{locationName}/posts
  -> On success: status -> published, gbpPostId saved
  -> On failure: status -> failed, error logged, retry max 3x with exponential backoff
```

Auth: Google Cloud service account. Config: `GBP_SERVICE_ACCOUNT_JSON` env var.

### 11. CLI Commands

```
cms some generate                     # Generate post suggestions from recent content
cms some generate --source <slug>     # Generate from specific document
cms some generate --topic "<text>"    # Generate from free-form topic
cms some generate --weeks 2           # Generate rolling 2-week queue

cms some bank                         # List all post drafts
cms some bank --status draft          # Show only drafts awaiting review
cms some bank --platform instagram    # Filter by platform

cms some gbp publish                  # Publish queued GBP updates now
cms some gbp queue                    # Show pending GBP queue

cms some hashtags sync                # Re-sync hashtag bank from config
```

### 12. cms.config.ts Integration

```typescript
import { somePlugin } from '@webhouse/cms-plugin-some';

export default defineConfig({
  plugins: [
    somePlugin({
      brand: {
        name: 'Sanne Andersen',
        owner: 'Sanne Andersen',
        voice: 'warm, professional, evidence-based',
        niche: 'zoneterapi og TCM, Aalborg',
        credentials: 'zoneterapeut, PhD, TCM-praktiker',
      },
      platforms: {
        facebook:  { enabled: true },
        instagram: { enabled: true, hashtagSets: ['niche', 'location', 'treatment'] },
        linkedin:  { enabled: true },
      },
      googleBusinessProfile: {
        enabled: true,
        locationId: process.env.GBP_LOCATION_ID!,
        serviceAccountKey: process.env.GBP_SERVICE_ACCOUNT_JSON!,
        autoPublish: true,
        schedule: '0 9 * * 2',  // Tuesday 09:00
        defaultCtaType: 'book',
      },
      generation: {
        postsPerWeek: 5,
        seasonalContext: true,
        deriveFromNewContent: true,
        ragIntegration: false,
      },
    }),
  ],
});
```

## Impact Analysis

### Files affected
- `packages/cms-plugin-some/` — entirely new package
- Depends on F46 (Plugin System) for registration
- Depends on F15 (Agent Scheduler) for scheduled generation

### Blast radius
- None to existing code — standalone plugin package
- GBP API integration requires Google Cloud service account

### Breaking changes
- None — plugin is opt-in

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] AI generates platform-specific post drafts
- [ ] Hashtag rotation avoids repeated tags
- [ ] GBP post publishes via API
- [ ] Content hook triggers generation on new article publish

## Implementation Steps

### Phase 1 — Social Media Bank MVP (days 1-3)
1. Scaffold `packages/cms-plugin-some` with package.json, tsup.config.ts, tsconfig.json
2. Implement plugin registration (`CmsPlugin` interface from F46)
3. Define collections: someBank, someHashtags
4. Build AI SoMe Agent with platform-specific formatting rules (FB, IG, LI)
5. Implement hashtag bank integration with rotation and usage tracking
6. Implement image suggestion from media library
7. Register `content.afterCreate` hook to auto-trigger generation on publish
8. Build CLI commands: `cms some generate`, `cms some bank`

### Phase 2 — Google Business Profile Automation (days 4-6)
9. Define gbpUpdates collection
10. Implement Google My Business API client (service account auth)
11. Build GBP post creation for all types (What's New, Offer, Event)
12. Implement auto-publish with configurable cron schedule
13. Add retry logic (max 3 attempts, exponential backoff)
14. Build CLI: `cms some gbp publish`, `cms some gbp queue`

### Phase 3 — Seasonal Calendar + RAG Integration (days 6-8)
15. Implement seasonal content calendar engine with month-aware topic suggestions
16. Build rolling 2-week queue generation
17. Implement RAG agent integration via standard Content API
18. Add approval/rejection analytics tracking (approved vs rejected ratio)

### Phase 4 — Admin Dashboard UI (days 8-10)
19. Social Media Bank view in cms-admin: post cards with platform previews
20. Approve / reject / regenerate actions with one-click copy-to-clipboard
21. Hashtag bank manager with visual editor and usage analytics
22. GBP queue view (pending, published, failed)
23. Brand voice and platform toggle configuration UI

## Dependencies

- **F46 — Plugin System** — required for `cms.registerPlugin()`, hooks, route registration
- **F15 — Agent Scheduler** — required for scheduled GBP publishing and periodic post generation
- **@webhouse/cms-ai** — SoMe Agent extends the existing AI agent architecture

## Effort Estimate

**Large** — 8-10 days

- Phase 1 (SoMe Bank MVP): 3 days
- Phase 2 (GBP automation): 3 days
- Phase 3 (seasonal + RAG): 2 days
- Phase 4 (admin dashboard): 2 days
