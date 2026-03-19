# F33 — PWA Support

> Progressive Web App capabilities for CMS-powered sites.

## Problem

Sites built with @webhouse/cms are standard web apps with no offline support, no install prompt, and no push notifications. Users expect app-like experiences on mobile.

## Solution

Add PWA capabilities: service worker generation, offline content caching, app manifest generation from CMS config, push notifications via web push, and install prompt. Built with `@serwist/next` (based on experience from fysiodk-aalborg-sport).

## Technical Design

### PWA Configuration

```typescript
// packages/cms/src/schema/types.ts — extend CmsConfig

export interface PwaConfig {
  enabled: boolean;
  name: string;              // app name
  shortName: string;
  description?: string;
  themeColor: string;        // e.g. '#F7BB2E'
  backgroundColor: string;   // e.g. '#0D0D0D'
  display: 'standalone' | 'fullscreen' | 'minimal-ui';
  icons?: Array<{ src: string; sizes: string; type: string }>;
  offlineStrategy: 'cache-first' | 'network-first' | 'stale-while-revalidate';
  cachePaths?: string[];     // additional paths to precache
  pushNotifications?: boolean;
}

// In CmsConfig:
pwa?: PwaConfig;
```

### Manifest Generator

```typescript
// packages/cms/src/build/manifest.ts

export function generateWebManifest(config: CmsConfig): Record<string, unknown> {
  // Generates manifest.json from CmsConfig.pwa + site metadata
  // Icons: auto-generate from a source icon using sharp
  return {
    name: config.pwa?.name,
    short_name: config.pwa?.shortName,
    start_url: '/',
    display: config.pwa?.display ?? 'standalone',
    theme_color: config.pwa?.themeColor,
    background_color: config.pwa?.backgroundColor,
    icons: config.pwa?.icons ?? [
      { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
```

### Service Worker (Serwist)

```typescript
// Generated in Next.js project via @serwist/next

// packages/cms/src/template/sw.ts — template for generated service worker

import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
```

### Push Notifications

```typescript
// packages/cms-admin/src/lib/web-push.ts

import webpush from 'web-push';

export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userId?: string;
  subscribedAt: string;
}

export class WebPushService {
  async subscribe(subscription: PushSubscription): Promise<void>;
  async send(title: string, body: string, options?: {
    url?: string;
    icon?: string;
    badge?: string;
  }): Promise<void>;
  async sendToAll(title: string, body: string): Promise<number>;
}
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/manifest.json` | Web app manifest |
| `POST` | `/api/push/subscribe` | Register push subscription |
| `POST` | `/api/admin/push/send` | Send push notification |

## Impact Analysis

### Files affected
- `packages/cms/src/schema/types.ts` — add `PwaConfig` to `CmsConfig`
- `packages/cms/src/build/manifest.ts` — new web manifest generator
- `packages/cms/src/template/sw.ts` — new service worker template
- `packages/cms-admin/src/lib/web-push.ts` — new push notification service
- `packages/cms-admin/package.json` — add `@serwist/next`, `web-push` dependencies

### Blast radius
- Service worker registration affects all site pages — misconfiguration can break navigation
- `CmsConfig` type extension must be optional

### Breaking changes
- None — `pwa` config is optional

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Web manifest generated with correct icons
- [ ] Service worker registers and caches pages
- [ ] Push notification subscription works
- [ ] Offline fallback page renders

## Implementation Steps

1. Add `PwaConfig` to `CmsConfig` in `packages/cms/src/schema/types.ts`
2. Create `packages/cms/src/build/manifest.ts` for manifest generation
3. Create service worker template using `@serwist/next`
4. Add icon generation from source icon using `sharp` (192x192, 512x512, maskable)
5. Create `packages/cms-admin/src/lib/web-push.ts` using `web-push` npm package
6. Generate VAPID keys during setup (`web-push generate-vapid-keys`)
7. Create push subscription API endpoint
8. Create push notification sending endpoint (admin only)
9. Add PWA config section to site settings
10. Add offline fallback page template
11. Integrate with F13 (Notification Channels) for push notification triggers

## Dependencies

- `@serwist/next` — service worker library
- `web-push` — push notification library
- `sharp` — icon generation

## Effort Estimate

**Medium** — 3-4 days
