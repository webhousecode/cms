"use client";

/**
 * Client-side permission hook.
 *
 * Fetches the current user's resolved permissions from /api/auth/me and
 * returns a `can(perm)` function for UI gating.
 *
 * SECURITY: defaults to [] (deny all) until the fetch completes. This
 * means admin-only UI flickers in briefly on first load for admins, but
 * it's the secure default — the alternative (defaulting to ["*"]) would
 * show admin UI to editors until the fetch resolves.
 */

import { useState, useEffect, useCallback } from "react";
import { hasPermission } from "@/lib/permissions-shared";

export function usePermissions() {
  const [granted, setGranted] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { user?: { permissions?: string[] } }) => {
        setGranted(d.user?.permissions ?? []);
      })
      .catch(() => {});
  }, []);

  const can = useCallback(
    (permission: string) => hasPermission(granted, permission),
    [granted],
  );

  return can;
}
