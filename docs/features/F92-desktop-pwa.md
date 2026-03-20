# F92 — Desktop PWA

> Install webhouse.app CMS admin as a desktop app on Mac/Windows/Linux — standalone window, dock icon, no browser chrome.

## Problem

The CMS admin runs in a browser tab mixed with 20 other tabs. It doesn't feel like a dedicated tool — it feels like a website. On Mac, there's no dedicated dock icon, no Cmd+Tab to "webhouse.app", and the browser address bar wastes vertical space on a tool you use all day.

Chrome and Edge support "Install as app" for PWAs, creating a standalone window with its own dock/taskbar presence. But webhouse.app has no `manifest.json`, no PWA icons, and no service worker — so the install option never appears.

Note: F33 (PWA Support) is for **customer-facing sites** built with the CMS. This feature is for the **CMS admin itself**.

## Solution

Add a web app manifest, PWA-sized icons (from existing webhouse.app SVG), and a minimal service worker to `packages/cms-admin`. This triggers Chrome/Edge's "Install app" prompt. The result: a standalone desktop window with the webhouse.app icon in the dock, no browser chrome, and a proper app experience. Desktop-first — no mobile optimizations needed.

## Technical Design

### 1. Web App Manifest

```json
// packages/cms-admin/public/manifest.json
{
  "name": "webhouse.app — AI-native content engine",
  "short_name": "webhouse.app",
  "description": "Content management admin UI",
  "start_url": "/admin",
  "display": "standalone",
  "background_color": "#0D0D0D",
  "theme_color": "#0D0D0D",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "screenshots": [],
  "categories": ["productivity", "utilities"],
  "orientation": "any",
  "scope": "/",
  "id": "webhouse-cms-admin"
}
```

Key choices:
- `display: "standalone"` — no browser chrome, own window
- `background_color: "#0D0D0D"` — matches dark theme, no white flash on launch
- `start_url: "/admin"` — opens directly to dashboard, not landing page
- `theme_color: "#0D0D0D"` — title bar color on Windows/ChromeOS
- `id: "webhouse-cms-admin"` — stable identity across URL changes

### 2. PWA Icons

Generate from existing `public/webhouse.app-dark-icon.svg` using Sharp:

```typescript
// scripts/generate-pwa-icons.ts

import sharp from "sharp";
import path from "path";

const SOURCE = "packages/cms-admin/public/webhouse.app-dark-icon.svg";
const OUT = "packages/cms-admin/public/icons";

const sizes = [192, 512];

for (const size of sizes) {
  // Standard icon (dark background, centered logo)
  await sharp(SOURCE)
    .resize(size, size, { fit: "contain", background: "#0D0D0D" })
    .png()
    .toFile(path.join(OUT, `icon-${size}.png`));

  // Maskable icon (with safe zone padding — 80% of area)
  const padding = Math.round(size * 0.1);
  await sharp(SOURCE)
    .resize(size - padding * 2, size - padding * 2, { fit: "contain", background: "#0D0D0D" })
    .extend({ top: padding, bottom: padding, left: padding, right: padding, background: "#0D0D0D" })
    .png()
    .toFile(path.join(OUT, `icon-maskable-${size}.png`));
}
```

Also generate an Apple Touch Icon for good measure:

```
/icons/apple-touch-icon.png  — 180×180
```

### 3. Layout Metadata

```typescript
// packages/cms-admin/src/app/layout.tsx

export const metadata: Metadata = {
  title: "webhouse.app",
  description: "AI-native content engine",
  icons: {
    icon: "/favicon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  themeColor: "#0D0D0D",
  appleWebApp: {
    capable: true,
    title: "webhouse.app",
    statusBarStyle: "black-translucent",
  },
};
```

### 4. Service Worker (Minimal)

A PWA needs a service worker to be installable. We don't need offline caching for the admin (it's a live tool that needs API access), but we need a registered SW for Chrome to show the install prompt.

```typescript
// packages/cms-admin/public/sw.js

// Minimal service worker — required for PWA install prompt.
// No offline caching (admin needs live API access).

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Pass all fetch requests through (no caching)
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
```

Register in the app:

```typescript
// packages/cms-admin/src/components/pwa-register.tsx
"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
```

Add to layout:

```tsx
// In RootLayout body
<PwaRegister />
```

### 5. What the User Experiences

**Before (browser tab):**
- webhouse.app is one of 20 tabs
- Browser address bar takes space
- Cmd+Tab shows "Chrome", not "webhouse.app"
- No dock icon

**After (desktop PWA):**
- Standalone window, no browser chrome
- webhouse.app icon in Mac dock / Windows taskbar
- Cmd+Tab shows "webhouse.app" with icon
- Dark background (#0D0D0D) — no white flash on launch
- Opens directly to /admin dashboard
- Install via Chrome menu → "Install webhouse.app" or Edge → "Install this site as an app"

### 6. What We Deliberately Skip

- **Offline caching** — the admin needs live API access, offline makes no sense
- **Push notifications** — handled by F33 (for sites) or F64 (toast system)
- **Mobile optimization** — this is desktop-first, mobile admin is F07 (COCpit native app)
- **@serwist/next** — overkill for a minimal SW, plain JS file is sufficient
- **Install prompt UI** — browser handles this natively, no custom prompt needed

## Impact Analysis

### Files affected
- `packages/cms-admin/public/manifest.json` — **new** file
- `packages/cms-admin/public/icons/` — **new** directory with 5 PNG icons
- `packages/cms-admin/public/sw.js` — **new** minimal service worker
- `packages/cms-admin/src/app/layout.tsx` — **modified** (add manifest, themeColor, appleWebApp metadata)
- `packages/cms-admin/src/components/pwa-register.tsx` — **new** client component
- `scripts/generate-pwa-icons.ts` — **new** icon generation script

### Downstream dependents

`layout.tsx` is the root layout, imported by Next.js framework (not by other source files):
- No source-level downstream dependents — it's the app root
- Metadata changes affect `<head>` of every page — must verify no conflicts with existing `<meta>` tags

### Blast radius
- Service worker registration affects all pages — a broken SW could intercept requests. Mitigated: our SW is a pure pass-through, no caching
- `manifest.json` must not conflict with any existing route — checked, none exists
- `themeColor` meta tag affects browser chrome color — desired effect
- Adding `<PwaRegister />` to layout adds one `useEffect` on mount — negligible performance

### Breaking changes
- None — purely additive (new files + metadata extension)

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] `manifest.json` accessible at `/manifest.json`
- [ ] Icons render at `/icons/icon-192.png` and `/icons/icon-512.png`
- [ ] Chrome shows "Install webhouse.app" in address bar / menu
- [ ] Installed PWA opens as standalone window with correct icon
- [ ] Dark background on launch (no white flash)
- [ ] Cmd+Tab shows "webhouse.app" with icon on Mac
- [ ] All admin functionality works identically in PWA mode
- [ ] Service worker registers without errors in console
- [ ] Existing browser-tab usage unaffected

## Implementation Steps

1. Run `scripts/generate-pwa-icons.ts` — create 192, 512, maskable-512, apple-touch-icon PNGs from SVG
2. Create `packages/cms-admin/public/manifest.json`
3. Create `packages/cms-admin/public/sw.js` (minimal pass-through)
4. Create `packages/cms-admin/src/components/pwa-register.tsx`
5. Update `packages/cms-admin/src/app/layout.tsx` — add manifest link, themeColor, appleWebApp, PwaRegister
6. Test: open in Chrome → verify install prompt → install → verify standalone window
7. Test on macOS (Chrome + Edge), Windows (Edge), Linux (Chrome)

## Dependencies

- `sharp` — already a project dependency (for icon generation script)
- No runtime dependencies — manifest is static JSON, SW is plain JS

## Effort Estimate

**Small** — 0.5-1 day

This is mostly static files: a JSON manifest, a 10-line service worker, generated PNG icons, and 5 lines of metadata in layout.tsx. The icon generation script is the only "code" and it runs once.
