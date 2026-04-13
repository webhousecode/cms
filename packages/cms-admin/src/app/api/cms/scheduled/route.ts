import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { getSiteRole } from "@/lib/require-role";
import { NextResponse } from "next/server";

export async function GET() {
  const role = await getSiteRole();
  if (!role) return NextResponse.json({ error: "No access" }, { status: 403 });

  try {
    const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
    const items: {
      collection: string;
      collectionLabel: string;
      slug: string;
      title: string;
      status: string;
      publishAt?: string;
      unpublishAt?: string;
    }[] = [];

    await Promise.all(
      config.collections.map(async (col) => {
        const { documents } = await cms.content.findMany(col.name, {});
        for (const doc of documents) {
          const publishAt = doc.publishAt;
          const unpublishAt = doc.unpublishAt;
          if (!publishAt && !unpublishAt) continue;
          items.push({
            collection: col.name,
            collectionLabel: col.label ?? col.name,
            slug: doc.slug,
            title: String(doc.data?.title ?? doc.data?.name ?? doc.slug),
            status: doc.status,
            publishAt,
            unpublishAt,
          });
        }
      }),
    );

    // Sort by earliest scheduled date
    items.sort((a, b) => {
      const aDate = a.publishAt ?? a.unpublishAt ?? "";
      const bDate = b.publishAt ?? b.unpublishAt ?? "";
      return aDate.localeCompare(bDate);
    });

    return NextResponse.json(items);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
