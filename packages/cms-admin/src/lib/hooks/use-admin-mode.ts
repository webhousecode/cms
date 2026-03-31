"use client";

import { useState, useCallback, useEffect } from "react";

export type AdminMode = "traditional" | "chat";

const STORAGE_KEY = "cms-admin-mode";

export function useAdminMode() {
  const [mode, setMode] = useState<AdminMode>("traditional");

  // Hydrate from localStorage after mount (URL ?mode=admin overrides)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlMode = params.get("mode");
    if (urlMode === "admin") {
      setMode("traditional");
      return;
    }
    const stored = localStorage.getItem(STORAGE_KEY) as AdminMode | null;
    if (stored === "chat") setMode("chat");

    // Listen for external mode changes (e.g. from command palette)
    function onModeChange(e: Event) {
      const detail = (e as CustomEvent).detail as AdminMode;
      if (detail === "chat" || detail === "traditional") {
        localStorage.setItem(STORAGE_KEY, detail);
        setMode(detail);
      }
    }
    window.addEventListener("cms:set-admin-mode", onModeChange);
    return () => window.removeEventListener("cms:set-admin-mode", onModeChange);
  }, []);

  const toggle = useCallback(() => {
    setMode((prev) => {
      const next = prev === "traditional" ? "chat" : "traditional";
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const setModeAndStore = useCallback((next: AdminMode) => {
    localStorage.setItem(STORAGE_KEY, next);
    setMode(next);
  }, []);

  return { mode, toggle, setMode: setModeAndStore };
}
