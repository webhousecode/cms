"use client";

import { useState, useCallback, useEffect } from "react";

export type AdminMode = "traditional" | "chat";

const STORAGE_KEY = "cms-admin-mode";

export function useAdminMode() {
  const [mode, setMode] = useState<AdminMode>("traditional");

  // Hydrate from localStorage after mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as AdminMode | null;
    if (stored === "chat") setMode("chat");
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
