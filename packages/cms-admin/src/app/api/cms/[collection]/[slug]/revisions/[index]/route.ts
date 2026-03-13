import { NextResponse } from "next/server";
import { getAdminCms } from "@/lib/cms";
import { listRevisions, saveRevision } from "@/lib/revisions";

type Ctx = { params: Promise<{ collection: string; slug: string; index: string }> };

/**
 * POST /api/cms/{collection}/{slug}/revisions/{index}/restore
 * Restores the document to the revision at position {index}.
 */
export async function POST(_req: Request, { params }: Ctx) {
  try {
    const { collection, slug, index } = await params;
    const idx = parseInt(index, 10);
    const revisions = await listRevisions(collection, slug);
    const revision = revisions[idx];
    if (!revision) return NextResponse.json({ error: "Revision not found" }, { status: 404 });

    const cms = await getAdminCms();
    const doc = await cms.content.findBySlug(collection, slug);
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    // Save current state as a revision before restoring
    await saveRevision(collection, doc).catch(() => { /* non-fatal */ });

    await cms.content.update(collection, doc.id, {
      data: revision.data,
      status: revision.status as "draft" | "published",
    });

    const updated = await cms.content.findBySlug(collection, slug);
    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
