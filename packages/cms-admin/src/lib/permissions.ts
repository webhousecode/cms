/**
 * Permission-based access control.
 *
 * The CMS has three built-in roles (admin, editor, viewer). Instead of
 * scattering role checks across route handlers, we define PERMISSIONS
 * as capability strings and map roles to permission sets. Route handlers
 * call `requirePermission("deploy.trigger")` — they don't know about
 * roles. Roles are just bundles of permissions.
 *
 * Why this matters:
 *   - Adding a role = add one mapping, touch zero routes
 *   - Per-user overrides (F55) = extend hasPermission(), touch zero routes
 *   - Per-collection scoping (F55) = "content.posts.publish", same resolver
 *   - Custom roles (F55) = new mapping object, same infrastructure
 *
 * The rule: editor works WITH the system as configured. Admin changes
 * HOW the system is configured.
 */

import { NextResponse } from "next/server";
import { type UserRole } from "./auth";
import { getSiteRole } from "./require-role";

export const PERMISSIONS = {
  // Content
  "content.read": "View documents",
  "content.create": "Create documents",
  "content.edit": "Edit documents",
  "content.publish": "Publish / unpublish",
  "content.delete": "Trash documents",
  "content.trash.empty": "Empty entire trash",

  // Media
  "media.read": "View media library",
  "media.upload": "Upload files",
  "media.delete": "Delete files",

  // Deploy
  "deploy.trigger": "Deploy / build sites",

  // Curation
  "curation.review": "Approve / reject in queue",

  // Forms
  "forms.read": "View form inbox",
  "forms.manage": "Create / edit form definitions",

  // AI / Chat
  "chat.use": "Use chat interface",
  "agents.run": "Run agents manually",
  "agents.manage": "Create / edit agents + workflows",

  // Infrastructure (admin only)
  "settings.edit": "Change site settings",
  "backup.manage": "Create / restore backups",
  "beam.transfer": "Beam sites",
  "site.clone": "Clone sites",
  "webhooks.manage": "Configure webhooks",
  "tokens.manage": "Create / revoke API tokens",
  "import.execute": "Run CSV / WP import",
  "users.manage": "Invite / remove users",
} as const;

export type Permission = keyof typeof PERMISSIONS;

/**
 * Role → permission mappings. Wildcards supported:
 *   "*"         = everything
 *   "content.*" = all content.* permissions
 */
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: ["*"],
  editor: [
    "content.read",
    "content.create",
    "content.edit",
    "content.publish",
    "content.delete",
    // content.trash.empty deliberately excluded — irreversible bulk action
    "media.*",
    "deploy.trigger",
    "curation.*",
    "forms.read",
    "chat.use",
    "agents.run",
  ],
  viewer: [
    "content.read",
    "media.read",
    "forms.read",
  ],
};

/**
 * Check if a set of granted permission strings covers a requested permission.
 * Supports wildcards: "*" matches everything, "content.*" matches "content.create".
 */
export function hasPermission(granted: string[], requested: string): boolean {
  if (granted.includes("*")) return true;
  if (granted.includes(requested)) return true;

  // Check wildcards: "content.*" should match "content.create"
  const parts = requested.split(".");
  for (let i = parts.length - 1; i > 0; i--) {
    const wildcard = parts.slice(0, i).join(".") + ".*";
    if (granted.includes(wildcard)) return true;
  }
  return false;
}

/**
 * Resolve the full permission list for a role.
 * Expands wildcards against the PERMISSIONS registry.
 */
export function resolvePermissions(role: UserRole): string[] {
  const granted = ROLE_PERMISSIONS[role] ?? [];
  if (granted.includes("*")) return Object.keys(PERMISSIONS);
  const resolved: string[] = [];
  for (const perm of Object.keys(PERMISSIONS)) {
    if (hasPermission(granted, perm)) resolved.push(perm);
  }
  return resolved;
}

/**
 * Route guard. Returns a 403 Response if the current user lacks the
 * requested permission, or null if access is granted.
 *
 * Usage:
 *   const denied = await requirePermission("settings.edit");
 *   if (denied) return denied;
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
