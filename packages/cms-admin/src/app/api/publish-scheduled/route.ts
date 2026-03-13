import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { NextResponse } from "next/server";

/**
 * POST /api/publish-scheduled
 *
 * Checks all collections for draft documents with a `publishAt` field
 * whose value is a past ISO datetime, and publishes them.
 *
 * Returns { published: [{ collection, slug }] }
 */
export async function POST() {
  try {
    const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
    const now = new Date();
    const published: Array<{ collection: string; slug: string }> = [];

    for (const col of config.collections) {
      const { documents } = await cms.content.findMany(col.name, {});
      for (const doc of documents) {
        if (doc.status !== "draft") continue;
        const publishAt = doc.data?.publishAt as string | undefined;
        if (!publishAt) continue;
        const at = new Date(publishAt);
        if (isNaN(at.getTime()) || at > now) continue;
        await cms.content.update(col.name, doc.id, { status: "published" });
        published.push({ collection: col.name, slug: doc.slug });
      }
    }

    return NextResponse.json({ published, checkedAt: now.toISOString() });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
