/**
 * GET /api/cms/media/usage
 *
 * Scans all documents across all collections and returns a map of
 * media URL → list of documents that reference that URL.
 *
 * Response: Record<string, UsageRef[]>
 *   key = URL (local path or full URL), e.g. "/uploads/foo.png" or "http://localhost:3002/images/foo.png"
 *   value = array of { collection, slug, title }
 */

import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { getMediaAdapter } from "@/lib/media";
import { NextResponse } from "next/server";

export interface UsageRef {
  collection: string;
  slug: string;
  title: string;
}

export async function GET() {
  try {
    const [cms, config, media] = await Promise.all([getAdminCms(), getAdminConfig(), getMediaAdapter()]);

    // Get all known media URLs so we know what to look for
    const allMedia = await media.listMedia();
    const mediaUrls = new Set(allMedia.map((f) => f.url));

    // Also build a set of just the filename portions for fuzzy matching
    // e.g. "carousel-app1.png" from "/images/carousel-app1.png" or "http://localhost:3002/images/carousel-app1.png"
    const filenameToUrl = new Map<string, string>();
    for (const f of allMedia) {
      filenameToUrl.set(f.name, f.url);
      // Also map the path portion: "/images/carousel-app1.png"
      try {
        const u = new URL(f.url, "http://x");
        filenameToUrl.set(u.pathname, f.url);
      } catch { /* not a URL */ }
      // Also map relative path without leading slash
      if (f.url.startsWith("/")) {
        filenameToUrl.set(f.url, f.url);
      }
    }

    // Map from media URL → documents that reference it
    const usageMap: Record<string, UsageRef[]> = {};

    function addRef(url: string, ref: UsageRef) {
      if (!usageMap[url]) usageMap[url] = [];
      if (!usageMap[url].some((r) => r.collection === ref.collection && r.slug === ref.slug)) {
        usageMap[url].push(ref);
      }
    }

    // Build a combined regex from all known media filenames and paths
    // Also keep the legacy /uploads/ pattern for backward compatibility
    const uploadPattern = /\/uploads\/[^\s"')\]]+/g;
    const imagePattern = /\/images\/[^\s"')\]]+/g;
    const audioPattern = /\/audio\/[^\s"')\]]+/g;

    for (const col of config.collections) {
      const { documents } = await cms.content
        .findMany(col.name, {})
        .catch(() => ({ documents: [] }));

      for (const doc of documents) {
        const serialised = JSON.stringify(doc.data);

        const title =
          (doc.data["title"] as string) ??
          (doc.data["label"] as string) ??
          doc.slug;

        const ref: UsageRef = { collection: col.name, slug: doc.slug, title };

        // Find all media path references
        const allMatches = new Set<string>();
        for (const m of serialised.matchAll(uploadPattern)) allMatches.add(m[0]);
        for (const m of serialised.matchAll(imagePattern)) allMatches.add(m[0]);
        for (const m of serialised.matchAll(audioPattern)) allMatches.add(m[0]);

        for (const match of allMatches) {
          // Map the found path back to the media URL we return in listings
          const mediaUrl = filenameToUrl.get(match);
          if (mediaUrl) {
            addRef(mediaUrl, ref);
          } else if (mediaUrls.has(match)) {
            addRef(match, ref);
          } else {
            // Direct match — use as-is (for /uploads/ paths on local sites)
            addRef(match, ref);
          }
        }
      }
    }

    return NextResponse.json(usageMap);
  } catch (err) {
    console.error(err);
    return NextResponse.json({}, { status: 500 });
  }
}
