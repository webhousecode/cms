import { useState, useEffect } from "react";
import type { UserRole } from "@/lib/auth";

/**
 * Client-side hook to fetch the current user's site role.
 * Returns the role string (e.g. "admin", "editor", "viewer") or null while loading.
 */
export function useSiteRole(): UserRole | null {
  const [role, setRole] = useState<UserRole | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data?.user?.siteRole) setRole(data.user.siteRole);
      })
      .catch(() => {});
  }, []);

  return role;
}
