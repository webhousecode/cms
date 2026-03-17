import { useState, useEffect } from "react";
import type { UserRole } from "@/lib/auth";

/**
 * Client-side hook to fetch the current user's site role.
 * Returns the role string (e.g. "admin", "editor", "viewer") or null while loading.
 *
 * IMPORTANT: defaults to null (loading state). Consumers should treat null as
 * "no access confirmed yet" and default to read-only until the role is known.
 */
export function useSiteRole(): UserRole | null {
  const [role, setRole] = useState<UserRole | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        setRole(data?.user?.siteRole ?? "viewer");
      })
      .catch(() => setRole("viewer"));
  }, []);

  return role;
}

/**
 * Returns true if the user should not be able to write.
 * Defaults to true (safe) while loading.
 */
export function useIsReadOnly(): boolean {
  const role = useSiteRole();
  return role === null || role === "viewer";
}
