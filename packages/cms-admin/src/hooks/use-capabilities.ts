"use client";

/**
 * F153 — client capability hook (UX gating only; server is the real boundary).
 *
 * Reads the active tenant's capabilities from the shared header-data context
 * (NOT a fresh fetch — per the "use shared context" hard rule). Returns a
 * `canUse(key)` function for hiding nav/buttons that the tenant doesn't have.
 */
import { useMemo } from "react";
import { useHeaderData } from "@/lib/header-data-context";
import { resolveCapabilities, hasCapability } from "@/lib/capabilities-shared";

export function useCapabilities() {
  const { siteConfig } = useHeaderData();
  const stored = (siteConfig as { capabilities?: Record<string, boolean> } | undefined)?.capabilities;
  const resolved = useMemo(() => resolveCapabilities(stored), [stored]);
  return useMemo(() => (key: string) => hasCapability(resolved, key), [resolved]);
}
