/**
 * F92 — Minimal service worker for PWA installability.
 *
 * The CMS admin needs live API access, so we don't cache anything.
 * This SW exists purely to satisfy the PWA install prompt requirement.
 */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Pass all fetch requests through (no caching, no offline).
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
