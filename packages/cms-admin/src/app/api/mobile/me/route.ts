import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "crypto";
import os from "os";
import path from "path";
import { existsSync } from "fs";
import { getUserById } from "@/lib/auth";
import { getMobileSession } from "@/lib/mobile-auth";
import { loadRegistry } from "@/lib/site-registry";
import { readSiteConfigForSite } from "@/lib/site-config";
import { signPreviewToken } from "@/lib/preview-token";

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
 * Wrap a preview URL so the mobile app can always reach it.
 *
 * Problem: many dev servers (Ruby, .NET, Rust, etc.) only bind to localhost.
 * The phone can't reach localhost directly, only the cms-admin LAN IP.
 * Solution: ALL localhost preview URLs go through our preview-proxy which
 * runs on cms-admin and relays to the localhost server.
 *
 * For sites without previewUrl, start sirv on-demand for their dist/ dir.
 * External URLs (Vercel, Netlify) pass through unchanged.
 */
function derivePreviewUrl(
  site: { configPath: string; adapter: string; previewUrl?: string },
  reqUrl: URL,
): string | undefined {
  // Use LAN IP for the proxy base so the phone can reach it
  const lanHost = rewriteLocalhostUrl(`${reqUrl.protocol}//${reqUrl.host}`) ?? `${reqUrl.protocol}//${reqUrl.host}`;
  const proxyBase = `${lanHost}/api/mobile/preview-proxy`;

  if (site.previewUrl) {
    // External URLs (Vercel, Netlify, etc.) — phone can reach them directly
    if (!isLocalhostUrl(site.previewUrl)) return site.previewUrl;

    // Localhost URLs — must proxy through cms-admin with signed token
    const param = site.previewUrl;
    const token = signPreviewToken(param);
    return `${proxyBase}?upstream=${encodeURIComponent(param)}&tok=${token}`;
  }

  // No previewUrl — try sirv from dist/
  if (site.adapter !== "filesystem" || !site.configPath) return undefined;
  const projectDir = path.dirname(path.resolve(site.configPath));
  const distDir = path.join(projectDir, "dist");
  if (!existsSync(distDir)) return undefined;

  const token = signPreviewToken(distDir);
  return `${proxyBase}?dir=${encodeURIComponent(distDir)}&tok=${token}`;
}

function isLocalhostUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|$)/.test(url);
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
    // Resolve live URLs from site configs in parallel (same logic as site-health)
    const sitePromises: Promise<void>[] = [];

    for (const org of registry.orgs) {
      for (const site of org.sites) {
        const entry = {
          orgId: org.id,
          orgName: org.name,
          siteId: site.id,
          siteName: site.name,
          role: (user.role ?? "admin") as "owner" | "admin" | "editor" | "viewer",
          adapter: site.adapter as "filesystem" | "github",
          previewUrl: derivePreviewUrl(site, reqUrl),
          liveUrl: undefined as string | undefined,
        };
        sites.push(entry);

        // Resolve live URL from deploy config
        sitePromises.push(
          readSiteConfigForSite(org.id, site.id)
            .then((cfg) => {
              if (!cfg) return;
              if (cfg.deployCustomDomain) {
                entry.liveUrl = `https://${cfg.deployCustomDomain}`;
              } else if (cfg.deployProductionUrl) {
                entry.liveUrl = cfg.deployProductionUrl;
              }
            })
            .catch(() => {}),
        );
      }
    }

    await Promise.all(sitePromises);
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
