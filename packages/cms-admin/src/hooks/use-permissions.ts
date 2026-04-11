"use client";

/**
 * Client-side permission hook.
 *
 * Fetches the current user's role once, resolves it to permissions via the
 * same ROLE_PERMISSIONS map the server uses, and returns a `can(perm)` fn.
 *
 * Usage:
 *   const can = usePermissions();
 *   {can("deploy.trigger") && <DeployButton />}
 *   {can("agents.manage") && <AgentConfigLink />}
 */

import { useState, useEffect, useCallback } from "react";
import { ROLE_PERMISSIONS, hasPermission } from "@/lib/permissions-shared";

export function usePermissions() {
  const [granted, setGranted] = useState<string[]>(["*"]); // default to admin until loaded (avoids flash of hidden UI for admins)

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { user?: { siteRole?: string } }) => {
        const role = d.user?.siteRole ?? "admin";
        const perms = ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS] ?? [];
        setGranted(perms);
      })
      .catch(() => {});
  }, []);

  const can = useCallback(
    (permission: string) => hasPermission(granted, permission),
    [granted],
  );

  return can;
}
