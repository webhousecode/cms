/**
 * Server-only permission guard.
 *
 * Re-exports all shared definitions from permissions-shared.ts (safe for
 * both server and client), then adds the server-only `requirePermission()`
 * which depends on next/headers via getSiteRole().
 *
 * Route handlers import from here. Client components import from
 * permissions-shared.ts (via hooks/use-permissions.ts).
 */

// Re-export everything client-safe
export {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission,
  resolvePermissions,
  type Permission,
} from "./permissions-shared";

import { NextResponse } from "next/server";
import { getSiteRole } from "./require-role";
import { ROLE_PERMISSIONS, hasPermission } from "./permissions-shared";

/**
 * Server-only route guard. Returns 403 if the current user lacks the
 * requested permission, or null if access is granted.
 */
export async function requirePermission(permission: string): Promise<Response | null> {
  const role = await getSiteRole();
  if (!role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const granted = ROLE_PERMISSIONS[role] ?? [];
  if (hasPermission(granted, permission)) return null;
  return NextResponse.json(
    { error: "Forbidden", permission, role },
    { status: 403 },
  );
}
