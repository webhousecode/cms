/**
 * Short URL system for cross-org/site deep links.
 *
 * Notification embeds (Discord, email) link to /admin paths but the recipient's
 * CMS admin may have multiple orgs and sites — clicking a raw /admin/curation
 * link would land them in whichever org/site they last had active. This module
 * stores `{orgId, siteId, path}` tuples behind a short ID; the resolver route
 * (`/admin/goto/[id]`) sets the active-org/site cookies and then redirects to
 * the path, so the user always lands in the correct workspace.
 *
 * Storage: `_admin/goto-links.json` next to the registry — global across the
 * whole CMS admin instance, not per-site.
 */
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { getAdminDataDir } from "@/lib/site-registry";

export interface GotoLink {
  id: string;
  orgId: string;
  siteId: string;
  /** Admin path including any query string, e.g. "/admin/curation?tab=approved" */
  path: string;
  /** Optional human-readable label for log/debug. */
  label?: string;
  createdAt: string;
}

const FILE = "goto-links.json";
const MAX_ENTRIES = 1000;

function shortId(): string {
  // 10 base36 chars from a UUID — collision-safe enough for ~1k entries cap
  return randomUUID().replace(/-/g, "").slice(0, 10);
}

async function load(): Promise<GotoLink[]> {
  try {
    const raw = await fs.readFile(path.join(getAdminDataDir(), FILE), "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function save(links: GotoLink[]): Promise<void> {
  const dir = getAdminDataDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, FILE), JSON.stringify(links, null, 2) + "\n", "utf-8");
}

export async function createGotoLink(input: {
  orgId: string;
  siteId: string;
  path: string;
  label?: string;
}): Promise<string> {
  const links = await load();
  const id = shortId();
  links.push({
    id,
    orgId: input.orgId,
    siteId: input.siteId,
    path: input.path,
    ...(input.label ? { label: input.label } : {}),
    createdAt: new Date().toISOString(),
  });
  // Cap by removing oldest entries (FIFO)
  while (links.length > MAX_ENTRIES) links.shift();
  await save(links);
  return id;
}

export async function resolveGotoLink(id: string): Promise<GotoLink | null> {
  const links = await load();
  return links.find((l) => l.id === id) ?? null;
}

/**
 * Build a full deep link URL for use in webhook embeds, emails, chat messages
 * etc. — anywhere a notification needs to land the recipient in the correct
 * org+site workspace before navigating to a specific admin path.
 *
 * If `orgId` and `siteId` are both available, the result is a wrapped
 * `/admin/goto/<id>` URL that restores the workspace via cookies first.
 * If either is missing, falls back to a raw `${base}${path}` so callers
 * always get a usable link.
 *
 * Use this whenever you build a clickable link that points into /admin and
 * the recipient might be in a different workspace than the source.
 */
export async function buildAdminDeepLink(input: {
  base: string;             // e.g. "http://localhost:3010"
  path: string;             // e.g. "/admin/curation?tab=approved"
  orgId?: string | null;
  siteId?: string | null;
  label?: string;
}): Promise<string> {
  const base = input.base.replace(/\/$/, "");
  if (!input.orgId || !input.siteId) {
    return `${base}${input.path}`;
  }
  try {
    const id = await createGotoLink({
      orgId: input.orgId,
      siteId: input.siteId,
      path: input.path,
      ...(input.label ? { label: input.label } : {}),
    });
    return `${base}/admin/goto/${id}`;
  } catch {
    return `${base}${input.path}`;
  }
}
