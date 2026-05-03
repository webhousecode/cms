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

// Pass all fetch requests through (no caching, no offline).
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

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
