"use client";

import { useEffect } from "react";

/**
 * F92 — PWA service worker registration.
 *
 * Registers a minimal pass-through service worker so Chrome/Edge
 * show the "Install app" prompt. No caching, no offline support.
 */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // In dev mode: unregister any existing SW to prevent fetch interception
      // issues. The SW's event.respondWith(fetch()) wrapper breaks when the
      // dev server is slow or recompiling, causing dead pages.
      if (process.env.NODE_ENV !== "production") {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          for (const reg of regs) reg.unregister();
        });
        return;
      }
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* install prompt just won't show — non-critical */
      });
    }
  }, []);
  return null;
}
