/**
 * GET /api/cms/media/usage
 *
 * Scans all documents across all collections and returns a map of
 * upload URL → list of documents that reference that URL.
 *
 * Response: Record<string, UsageRef[]>
 *   key = URL path, e.g. "/uploads/1234-foo.png"
 *   value = array of { collection, slug, title }
 */

import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { NextResponse } from "next/server";

export interface UsageRef {
  collection: string;
  slug: string;
  title: string;
}

export async function GET() {
  try {
    const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);

    // Map from upload URL → documents that reference it
    const usageMap: Record<string, UsageRef[]> = {};

    function addRef(url: string, ref: UsageRef) {
      if (!usageMap[url]) usageMap[url] = [];
      // Avoid duplicates (same doc can reference same image multiple times)
      if (!usageMap[url].some((r) => r.collection === ref.collection && r.slug === ref.slug)) {
        usageMap[url].push(ref);
      }
    }

    // Regex that finds all /uploads/... URLs in a serialised JSON string
    const uploadPattern = /\/uploads\/[^\s"')\]]+/g;

    for (const col of config.collections) {
      const { documents } = await cms.content
        .findMany(col.name, {})
        .catch(() => ({ documents: [] }));

      for (const doc of documents) {
        const serialised = JSON.stringify(doc.data);
        const matches = serialised.match(uploadPattern);
        if (!matches) continue;

        const title =
          (doc.data["title"] as string) ??
          (doc.data["label"] as string) ??
          doc.slug;

        const ref: UsageRef = { collection: col.name, slug: doc.slug, title };

        for (const url of new Set(matches)) {
          addRef(url, ref);
        }
      }
    }

    return NextResponse.json(usageMap);
  } catch (err) {
    console.error(err);
    return NextResponse.json({}, { status: 500 });
  }
}
