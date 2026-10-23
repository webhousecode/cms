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

/**
 * Permission → catalog key of its label (F211.2). Render with t(PERMISSIONS[p]);
 * the English text lives in i18n/messages/en/system.json.
 */
export const PERMISSIONS = {
  "content.read": "system.permissions.contentRead",
  "content.create": "system.permissions.contentCreate",
  "content.edit": "system.permissions.contentEdit",
  "content.publish": "system.permissions.contentPublish",
  // F189 — podcasten. TRE og ikke én, fordi de tre handlinger har vidt
  // forskellig vægt. `podcast.record` er sin egen med vilje: en redaktør der må
  // rette en tekst, er ikke automatisk en der må bruge ~$1,48 af ejerens penge
  // pr. tryk — og var de samme tilladelse, kunne forskellen ikke udtrykkes.
  "podcast.read": "system.permissions.podcastRead",
  "podcast.edit": "system.permissions.podcastEdit",
  "podcast.record": "system.permissions.podcastRecord",
  "content.delete": "system.permissions.contentDelete",
  "content.trash.empty": "system.permissions.contentTrashEmpty",
  /**
   * Trash and old versions — the record of how the published thing came to be.
   *
   * Christian, 28 Aug 2026: «ja, læser må ikke se slettet indhold og gamle
   * versioner.» Third visibility question that day, third identical answer —
   * which components named as ONE rule about the DATA rather than three about
   * features: a reader may read what is PUBLISHED, never the protocol behind
   * it. A submission, a deletion and an overwritten draft are all traces of how
   * the published thing was made, and none of them is written for that reader.
   *
   * Deliberately NOT folded into `content.read`: a viewer needs that for the
   * one job they have. This is the narrower thing they must not have.
   */
  "content.history": "system.permissions.contentHistory",
  "media.read": "system.permissions.mediaRead",
  "media.upload": "system.permissions.mediaUpload",
  "media.delete": "system.permissions.mediaDelete",
  "deploy.trigger": "system.permissions.deployTrigger",
  "curation.review": "system.permissions.curationReview",
  "forms.read": "system.permissions.formsRead",
  "forms.manage": "system.permissions.formsManage",
  /**
   * F188 — visitors' AI conversations.
   *
   * TWO permissions, and the split is the point. `conversations.read` is the
   * inbox: an editor needs it for the same reason they need `forms.read`.
   * `conversations.write` is the RECORDING route, which the site's own token
   * uses — no human role carries it except admin. An editor may read what
   * visitors said; an editor has no business writing conversations into the
   * record, because a conversation is supposed to be a transcript.
   *
   * A viewer gets NEITHER. Same settled rule as form submissions: a reader may
   * read what is PUBLISHED, never the protocol behind it — and a chat log is
   * other people's words about their own business.
   */
  "conversations.read": "system.permissions.conversationsRead",
  "conversations.write": "system.permissions.conversationsWrite",
  /**
   * Erasing one conversation before the 90-day sweep reaches it — what an
   * erasure request needs. Its own permission, and admin-only, for the same
   * reason `content.delete` is separate from `content.edit`: removing a record
   * of what a visitor said is a different act from reading it, and it cannot
   * be undone.
   */
  "conversations.delete": "system.permissions.conversationsDelete",
  "chat.use": "system.permissions.chatUse",
  "agents.run": "system.permissions.agentsRun",
  "agents.manage": "system.permissions.agentsManage",
  "settings.edit": "system.permissions.settingsEdit",
  // The trusted-domain list decides which foreign pages may save content and
  // post forms to this site — it is a security boundary, not a content
  // setting. Deliberately NOT in ROLE_PERMISSIONS.editor: an editor may change
  // what the site says, not who is allowed to talk to it.
  "site.domains": "system.permissions.siteDomains",
  "capabilities.manage": "system.permissions.capabilitiesManage",
  "backup.manage": "system.permissions.backupManage",
  "beam.transfer": "system.permissions.beamTransfer",
  "site.clone": "system.permissions.siteClone",
  "webhooks.manage": "system.permissions.webhooksManage",
  "tokens.manage": "system.permissions.tokensManage",
  "import.execute": "system.permissions.importExecute",
  "users.manage": "system.permissions.usersManage",
  "logs.view": "system.permissions.logsView",
  "logs.export": "system.permissions.logsExport",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: ["*"],
  editor: [
    "content.read",
    "content.create",
    "content.edit",
    "content.publish",
    "podcast.read",
    "podcast.edit",
    "content.delete",
    "content.history",
    "media.*",
    "deploy.trigger",
    "curation.*",
    "forms.read",
    "conversations.read",
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
