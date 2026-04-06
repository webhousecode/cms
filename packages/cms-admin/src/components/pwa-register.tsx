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
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* install prompt just won't show — non-critical */
      });
    }
  }, []);
  return null;
}
