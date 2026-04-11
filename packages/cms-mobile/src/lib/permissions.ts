/**
 * Permission check helper for mobile app.
 *
 * Permissions are fetched from /api/mobile/me at startup and cached.
 * Supports wildcards: "content.*" matches "content.create".
 * Admin role has ["*"] which matches everything.
 */

let _permissions: string[] = [];

export function setPermissions(perms: string[]) {
  _permissions = perms;
}

export function getPermissions(): string[] {
  return _permissions;
}

/** Check if the current user has a specific permission */
export function can(perm: string): boolean {
  if (_permissions.includes("*")) return true;
  if (_permissions.includes(perm)) return true;
  // Check wildcard: "content.*" matches "content.create"
  const parts = perm.split(".");
  for (let i = parts.length - 1; i > 0; i--) {
    const wildcard = parts.slice(0, i).join(".") + ".*";
    if (_permissions.includes(wildcard)) return true;
  }
  return false;
}
