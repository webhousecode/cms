/**
 * Service worker for PWA installability + Web Push notifications.
 *
 * F92: keeps PWA install prompt happy (install/activate/fetch handlers).
 * Web Push (this turn): adds `push` + `notificationclick` so admin users
 * get native OS notifications when their site finishes deploying.
 *
 * Push payload contract (sent by lib/push-send.ts):
 *   {
 *     title:    string,
 *     body:     string,
 *     url?:     string,   // open this when user clicks the notification
 *     data?:    object,   // forwarded as event.data
 *     icon?:    string,
 *     badge?:   string,
 *     tag?:     string,   // dedup window for same-key notifications
 *   }
 */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * DO NOT call event.respondWith() here.
 *
 * This handler used to be `event.respondWith(fetch(event.request))` — a
 * pass-through that adds nothing and takes over everything. Once a service
 * worker answers a request, the browser's own networking is out of the loop:
 * if that inner fetch() rejects (server restarting, network blip), the page
 * dies, and it keeps dying, because a service worker SURVIVES A HARD RELOAD.
 *
 * Measured 28 Aug 2026: a deploy restarted the single production machine for
 * ~50s. Christian's browser was stuck on a dead webhouse.app afterwards and ten
 * hard reloads did not help — while the same URLs answered 200 in under 200ms
 * for everyone else, including an authenticated request to the very page he was
 * on. The server was healthy the whole time; the worker in his tab was not.
 *
 * The file's own comment already said this caused "dead pages" — but the fix
 * only ever landed for DEV (pwa-register.tsx unregisters the worker when
 * NODE_ENV !== production). Production, where a deploy actually happens, kept
 * the hazard.
 *
 * An empty listener still satisfies the installability check that wanted a
 * fetch handler, without intercepting a single request: with no respondWith,
 * the browser handles the request itself, including retries and its own error
 * page. Nothing here should ever grow a respondWith without an offline cache
 * AND a fallback for the rejected case.
 */
self.addEventListener("fetch", () => {});

// ── Web Push ───────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Notification", body: event.data.text() };
  }
  const title = payload.title || "Webhouse CMS";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/icon-192.png",
    tag: payload.tag || undefined,
    data: { url: payload.url || "/admin", ...payload.data },
    // Re-show even if same tag already exists — useful for "build state" updates
    renotify: !!payload.tag,
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/admin";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus an existing tab on the same origin if there is one
      for (const client of clientList) {
        try {
          const u = new URL(client.url);
          if (u.origin === self.location.origin) {
            client.focus();
            // navigate it to the target if it supports it
            if ("navigate" in client) return client.navigate(target);
            return undefined;
          }
        } catch { /* skip malformed URLs */ }
      }
      // No tab open — pop a fresh one
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return undefined;
    }),
  );
});
