/**
 * F94 — useFavorites hook.
 *
 * Client hook for reading/writing favorites. Uses localStorage for
 * instant access and syncs with the server via /api/admin/user-state.
 *
 * Dispatches a "cms:favorites-changed" event so other components
 * (sidebar, command palette) can react without re-fetching.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import type { Favorite } from "@/lib/user-state";

const STORAGE_KEY = "cms-favorites";
const EVENT_NAME = "cms:favorites-changed";

export function useFavorites() {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Initial load: localStorage (fast) → server (authoritative)
  useEffect(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) setFavorites(JSON.parse(cached));
    } catch { /* ignore */ }

    fetch("/api/admin/user-state")
      .then((r) => (r.ok ? r.json() : null))
      .then((state) => {
        if (state?.favorites) {
          setFavorites(state.favorites);
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.favorites)); } catch { /* ignore */ }
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));

    // Listen for changes from other components
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<Favorite[]>).detail;
      if (Array.isArray(detail)) setFavorites(detail);
    };
    window.addEventListener(EVENT_NAME, onChange);
    return () => window.removeEventListener(EVENT_NAME, onChange);
  }, []);

  const isFavorite = useCallback(
    (path: string) => favorites.some((f) => f.path === path),
    [favorites],
  );

  const persist = useCallback((updated: Favorite[]) => {
    setFavorites(updated);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: updated }));
    fetch("/api/admin/user-state", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorites: updated }),
    }).catch(() => {});
  }, []);

  const toggle = useCallback(
    (item: Omit<Favorite, "id" | "addedAt">) => {
      const exists = favorites.find((f) => f.path === item.path);
      if (exists) {
        persist(favorites.filter((f) => f.path !== item.path));
      } else {
        persist([
          ...favorites,
          {
            ...item,
            id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
            addedAt: new Date().toISOString(),
          },
        ]);
      }
    },
    [favorites, persist],
  );

  const remove = useCallback(
    (path: string) => {
      persist(favorites.filter((f) => f.path !== path));
    },
    [favorites, persist],
  );

  return { favorites, loaded, isFavorite, toggle, remove };
}
