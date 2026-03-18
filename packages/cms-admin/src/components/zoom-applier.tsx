"use client";

import { useEffect } from "react";

export function ZoomApplier() {
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { user?: { zoom?: number } | null }) => {
        const zoom = d.user?.zoom ?? 100;
        // Apply zoom on <html> element — behaves like native browser zoom
        document.documentElement.style.zoom = zoom === 100 ? "" : `${zoom / 100}`;
      })
      .catch(() => {});

    // Listen for zoom changes from Account Preferences
    function onZoomChange(e: Event) {
      const zoom = (e as CustomEvent<number>).detail ?? 100;
      document.documentElement.style.zoom = zoom === 100 ? "" : `${zoom / 100}`;
    }
    window.addEventListener("cms:zoom-changed", onZoomChange);
    return () => window.removeEventListener("cms:zoom-changed", onZoomChange);
  }, []);

  return null;
}
