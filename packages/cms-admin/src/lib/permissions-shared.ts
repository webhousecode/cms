/**
 * Permission definitions + role mappings + resolution logic.
 *
 * This file is deliberately server/client safe — no next/headers, no
 * require-role, no cookies. It can be imported from:
 *   - Server route handlers (via permissions.ts which re-exports + adds requirePermission)
 *   - Client components (via hooks/use-permissions.ts)
 *
 * The server-only `requirePermission()` guard lives in permissions.ts.
 */

import type { UserRole } from "./auth";

export const PERMISSIONS = {
  "content.read": "View documents",
  "content.create": "Create documents",
  "content.edit": "Edit documents",
  "content.publish": "Publish / unpublish",
  "content.delete": "Trash documents",
  "content.trash.empty": "Empty entire trash",
  "media.read": "View media library",
  "media.upload": "Upload files",
  "media.delete": "Delete files",
  "deploy.trigger": "Deploy / build sites",
  "curation.review": "Approve / reject in queue",
  "forms.read": "View form inbox",
  "forms.manage": "Create / edit form definitions",
  "chat.use": "Use chat interface",
  "agents.run": "Run agents manually",
  "agents.manage": "Create / edit agents + workflows",
  "settings.edit": "Change site settings",
  // The trusted-domain list decides which foreign pages may save content and
  // post forms to this site — it is a security boundary, not a content
  // setting. Deliberately NOT in ROLE_PERMISSIONS.editor: an editor may change
  // what the site says, not who is allowed to talk to it.
  "site.domains": "Manage the site's trusted domains",
  "capabilities.manage": "Manage feature capabilities (per-tenant toggles)",
  "backup.manage": "Create / restore backups",
  "beam.transfer": "Beam sites",
  "site.clone": "Clone sites",
  "webhooks.manage": "Configure webhooks",
  "tokens.manage": "Create / revoke API tokens",
  "import.execute": "Run CSV / WP import",
  "users.manage": "Invite / remove users",
  "logs.view": "View event log (audit trail)",
  "logs.export": "Export event log (GDPR data)",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: ["*"],
  editor: [
    "content.read",
    "content.create",
    "content.edit",
    "content.publish",
    "content.delete",
    "media.*",
    "deploy.trigger",
    "curation.*",
    "forms.read",
    "chat.use",
    "agents.run",
  ],
  // A viewer may not read visitors' form submissions. Christian, 28 Aug 2026:
  // «Ja til at læser ikke må se formular-indsendelser.» A form submission is a
  // member of the public writing to the site — on a clinic's site it is often a
  // client — and "viewer" is the role you hand someone you have not yet made a
  // decision about. Registered in the Decision Register: if you are here
  // because a viewer cannot open the form inbox, that is the CHOICE, not a gap.
  viewer: [
    "content.read",
    "media.read",
  ],
};

export function hasPermission(granted: string[], requested: string): boolean {
  if (granted.includes("*")) return true;
  if (granted.includes(requested)) return true;
  const parts = requested.split(".");
  for (let i = parts.length - 1; i > 0; i--) {
    const wildcard = parts.slice(0, i).join(".") + ".*";
    if (granted.includes(wildcard)) return true;
  }
  return false;
}

export function resolvePermissions(role: UserRole): string[] {
  const granted = ROLE_PERMISSIONS[role] ?? [];
  if (granted.includes("*")) return Object.keys(PERMISSIONS);
  const resolved: string[] = [];
  for (const perm of Object.keys(PERMISSIONS)) {
    if (hasPermission(granted, perm)) resolved.push(perm);
  }
  return resolved;
}
