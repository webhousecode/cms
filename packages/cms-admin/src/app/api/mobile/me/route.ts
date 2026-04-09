import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "crypto";
import os from "os";
import path from "path";
import { existsSync } from "fs";
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

function resolveAvatarUrl(user: { email: string; githubUsername?: string }): string {
  if (user.githubUsername) {
    return `https://github.com/${user.githubUsername}.png?size=128`;
  }
  const hash = createHash("md5").update(user.email.toLowerCase().trim()).digest("hex");
  return `https://www.gravatar.com/avatar/${hash}?s=128&d=404`;
}

/**
 * For filesystem-adapter sites without previewUrl, check if dist/ exists.
 * If so, return a preview URL that goes through our preview-proxy endpoint
 * which starts sirv on-demand (avoids slow startup during /me response).
 */
function derivePreviewUrl(
  site: { configPath: string; adapter: string; previewUrl?: string },
  reqUrl: URL,
): string | undefined {
  if (site.previewUrl) return site.previewUrl;
  if (site.adapter !== "filesystem" || !site.configPath) return undefined;

  const projectDir = path.dirname(path.resolve(site.configPath));
  const distDir = path.join(projectDir, "dist");
  if (!existsSync(distDir)) return undefined;

  // Return a proxy URL that starts sirv on-demand
  return `${reqUrl.protocol}//${reqUrl.host}/api/mobile/preview-proxy?dir=${encodeURIComponent(distDir)}`;
}

/**
 * GET /api/mobile/me
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

  const registry = await loadRegistry();
  const reqUrl = new URL(req.url);
  const sites: Array<{
    orgId: string;
    orgName: string;
    siteId: string;
    siteName: string;
    role: "owner" | "admin" | "editor" | "viewer";
    previewUrl?: string;
    liveUrl?: string;
  }> = [];

  if (registry) {
    for (const org of registry.orgs) {
      for (const site of org.sites) {
        sites.push({
          orgId: org.id,
          orgName: org.name,
          siteId: site.id,
          siteName: site.name,
          role: user.role ?? "admin",
          previewUrl: rewriteLocalhostUrl(derivePreviewUrl(site, reqUrl)),
          liveUrl: rewriteLocalhostUrl(
            site.revalidateUrl?.replace(/\/api\/revalidate$/, ""),
          ),
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
