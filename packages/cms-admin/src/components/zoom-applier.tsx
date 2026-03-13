"use client";

import { useEffect } from "react";

export function ZoomApplier() {
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { user?: { zoom?: number } | null }) => {
        const zoom = d.user?.zoom ?? 100;
        document.body.style.zoom = zoom === 100 ? "" : `${zoom}%`;
      })
      .catch(() => {});
  }, []);

  return null;
}
