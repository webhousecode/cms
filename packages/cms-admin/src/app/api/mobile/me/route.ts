import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "crypto";
import os from "os";
import { getUserById } from "@/lib/auth";
import { getMobileSession } from "@/lib/mobile-auth";
import { loadRegistry } from "@/lib/site-registry";

function findLanHost(): string | null {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const i of list ?? []) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return null;
}

/** Rewrite localhost URLs to LAN IP so mobile devices can reach them. */
function rewriteLocalhostUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  if (!/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|$)/.test(url)) return url;
  const lan = process.env.CMS_LAN_HOST || findLanHost();
  if (!lan) return url;
  return url.replace(/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/, `/${lan}`);
}

/**
 * Resolve an avatar URL for the user.
 * Mirrors /api/auth/me: prefer GitHub avatar for linked users, otherwise
 * Gravatar with `d=404` so the client can fall back to initials cleanly.
 */
function resolveAvatarUrl(user: { email: string; githubUsername?: string }): string {
  if (user.githubUsername) {
    return `https://github.com/${user.githubUsername}.png?size=128`;
  }
  const hash = createHash("md5").update(user.email.toLowerCase().trim()).digest("hex");
  return `https://www.gravatar.com/avatar/${hash}?s=128&d=404`;
}

/**
 * GET /api/mobile/me
 *
 * Returns the current user, the orgs/sites they have access to, and a few
 * quick counters (curation queue, today's drafts). This is the data the
 * webhouse.app mobile Home screen renders.
 *
 * Auth: Bearer JWT in Authorization header.
 *
 * Phase 1: counters are hard-coded zeros — they get real values in Phase 3
 * (curation) and Phase 4 (dashboard).
 */
export async function GET(req: NextRequest) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = await getUserById(session.id);
  if (!user) {
    return NextResponse.json({ error: "User no longer exists" }, { status: 404 });
  }

  // Discover orgs/sites the user can access. In Phase 1 every authenticated
  // user sees the full registry — per-user access control will be added in
  // a later phase when we wire up team membership.
  const registry = await loadRegistry();
  const sites: Array<{
    orgId: string;
    orgName: string;
    siteId: string;
    siteName: string;
    role: "owner" | "admin" | "editor" | "viewer";
    previewUrl?: string;
  }> = [];

  if (registry) {
    for (const org of registry.orgs) {
      for (const site of org.sites) {
        sites.push({
          orgId: org.id,
          orgName: org.name,
          siteId: site.id,
          siteName: site.name,
          // Phase 1: derive role from the user record's global role
          role: user.role ?? "admin",
          previewUrl: rewriteLocalhostUrl(site.previewUrl),
        });
      }
    }
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: resolveAvatarUrl(user),
    },
    sites,
    lastActiveOrg: user.lastActiveOrg,
    lastActiveSite: user.lastActiveSite,
    counters: {
      curationPending: 0,
      draftsToday: 0,
    },
    serverVersion: process.env.CMS_VERSION ?? "dev",
  });
}
