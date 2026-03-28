# F07 — CMS Mobile — COCpit

> Mobile-first content orchestration and curation app built with React Native / Expo.

## Problem

The CMS admin is a desktop web app. Reviewing AI-generated content, approving curation queue items, and monitoring agent activity on mobile requires using the full desktop UI in a mobile browser, which is not optimized for quick interactions.

## Solution

A dedicated mobile app ("COCpit" — Content Orchestration & Curation) built with Expo/React Native. Focused on quick review workflows: approve/reject/edit AI content from push notifications, view agent summaries, and monitor site health.

## Technical Design

### App Structure

```
packages/cms-mobile/
  app/
    (tabs)/
      index.tsx          # Dashboard — daily summary
      curation.tsx       # Curation queue — swipe approve/reject
      agents.tsx         # Agent status + recent runs
      settings.tsx       # Connection settings
    document/[id].tsx    # Quick edit view
  components/
    CurationCard.tsx     # Swipeable content card
    AgentStatusBadge.tsx
    MetricTile.tsx
  lib/
    api.ts               # API client for CMS admin
    push.ts              # Push notification registration
    sync.ts              # Offline queue + sync
  app.json               # Expo config
  eas.json               # EAS Build config
```

### API Client

```typescript
// packages/cms-mobile/lib/api.ts
export class CmsApiClient {
  constructor(private baseUrl: string, private token: string) {}

  async getCurationQueue(): Promise<CurationItem[]>;
  async approveCuration(id: string): Promise<void>;
  async rejectCuration(id: string): Promise<void>;
  async getAgentRuns(limit?: number): Promise<AgentRun[]>;
  async getDashboardSummary(): Promise<DashboardSummary>;
  async getDocument(collection: string, slug: string): Promise<Document>;
  async updateDocument(collection: string, slug: string, data: Partial<DocumentInput>): Promise<Document>;
}
```

### Push Notifications

```typescript
// packages/cms-admin/src/app/api/admin/push/route.ts
// Register device token, send push when:
// - New curation item arrives
// - Agent run completes with errors
// - Scheduled publish happens

// Use expo-notifications + Expo Push API
```

### Offline Support

- SQLite local cache (via `expo-sqlite`) for curation queue
- Optimistic approve/reject, sync when online
- Queue pending edits and replay on reconnect

## Impact Analysis

### Files affected
- `packages/cms-mobile/` — entirely new Expo/React Native package
- `packages/cms-admin/src/app/api/admin/push/route.ts` — new push notification endpoint
- `packages/cms-admin/src/lib/curation.ts` — expose curation data for mobile API

### Blast radius
- New push notification endpoint adds a public-facing API surface
- Curation data access must respect same auth as admin UI

### Breaking changes
- None

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Mobile app builds for iOS and Android
- [ ] API client can fetch curation queue
- [ ] Push notification delivery works
- [ ] Offline queue syncs on reconnect

## Implementation Steps

1. Scaffold Expo app: `npx create-expo-app packages/cms-mobile --template tabs`
2. Create API client in `packages/cms-mobile/lib/api.ts`
3. Build Dashboard tab with daily summary (content created, agents run, errors)
4. Build Curation tab with swipeable cards (approve/reject/edit)
5. Build Agents tab showing recent runs and next scheduled
6. Add push notification registration via `expo-notifications`
7. Add push endpoint to CMS admin API at `/api/admin/push/register`
8. Implement offline queue with `expo-sqlite`
9. Add biometric auth for app launch
10. Configure EAS Build for iOS and Android


> **NOTE — F107 Chat Integration:** When this feature introduces new API routes, tools, or admin actions, ensure they are also exposed as tool-use functions in F107 (Chat with Your Site). The chat interface must be able to perform any action the traditional admin UI can. See `docs/features/F107-chat-with-your-site.md`.

## Dependencies

- F15 (Agent Scheduler) — for agent status data
- Existing curation system in `packages/cms-admin/src/lib/curation.ts`

## Effort Estimate

**Large** — 8-10 days

---

> **Testing (F99):** This feature MUST include tests using the [F99 Test Infrastructure](F99-e2e-testing-suite.md).
> - **Unit tests** → `packages/cms-admin/src/lib/__tests__/{feature}.test.ts` or `packages/cms/src/__tests__/{feature}.test.ts`
> - **API tests** → `packages/cms-admin/tests/api/{feature}.test.ts`
> - **E2E tests** → `packages/cms-admin/e2e/suites/{nn}-{feature}.spec.ts`
> - Use shared fixtures: `auth.ts` (JWT login), `mock-llm.ts` (intercept AI), `test-data.ts` (seed/cleanup)
> - Tests are written BEFORE implementation. All tests must pass before merge.

> **i18n (F48):** This feature produces or manages user-facing content. All generated text,
> AI prompts, and UI output MUST respect the site's `defaultLocale` and `locales` settings.
> Use `getLocale()` for runtime locale resolution. See [F48 i18n](F48-i18n.md) for details.
