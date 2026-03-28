import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { getMediaAdapter } from "@/lib/media";
import { NextResponse } from "next/server";
import { denyViewers } from "@/lib/require-role";

const RETENTION_DAYS = parseInt(process.env.TRASH_RETENTION_DAYS ?? "30");

export async function GET() {
  try {
    const [cms, config, media] = await Promise.all([getAdminCms(), getAdminConfig(), getMediaAdapter()]);
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

    // Fetch ALL sources in parallel — massive speedup for GitHub-backed sites
    const [collectionResults, trashedMedia, ints] = await Promise.all([
      Promise.all(config.collections.map(async (col) => {
        const { documents } = await cms.content.findMany(col.name, {});
        return { col, documents: documents as any[] };
      })),
      media.listTrashed(),
      media.listInteractives(),
    ]);

    const allTrashed: Array<{ collection: string; collectionLabel: string; doc: unknown }> = [];

    // Process trashed documents
    for (const { col, documents } of collectionResults) {
      for (const doc of documents) {
        if (doc.status !== "trashed") continue;
        const trashedAt = doc.data?._trashedAt ? new Date(doc.data._trashedAt as string) : null;
        if (trashedAt && trashedAt < cutoff) {
          cms.content.delete(col.name, doc.id).catch(() => {}); // fire-and-forget cleanup
          continue;
        }
        allTrashed.push({ collection: col.name, collectionLabel: col.label ?? col.name, doc });
      }
    }

    // Trashed media files
    for (const m of trashedMedia) {
      allTrashed.push({
        collection: "_media",
        collectionLabel: "Media",
        doc: {
          id: m.key, slug: m.key, status: "trashed",
          data: { title: m.name, _trashedAt: m.trashedAt },
          createdAt: m.trashedAt ?? new Date().toISOString(),
          updatedAt: m.trashedAt ?? new Date().toISOString(),
        },
      });
    }

    // Trashed interactives
    for (const int of ints) {
      if (int.status !== "trashed") continue;
      allTrashed.push({
        collection: "_interactives",
        collectionLabel: "Interactives",
        doc: {
          id: int.id, slug: int.id, status: "trashed",
          data: { title: int.name, _trashedAt: int.updatedAt },
          createdAt: int.createdAt, updatedAt: int.updatedAt,
        },
      });
    }

    return NextResponse.json(allTrashed);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE() {
  const denied = await denyViewers(); if (denied) return denied;
  try {
    const [cms, config, media] = await Promise.all([getAdminCms(), getAdminConfig(), getMediaAdapter()]);

    // Fetch all sources in parallel
    const [collectionResults, trashedMedia, ints] = await Promise.all([
      Promise.all(config.collections.map(async (col) => {
        const { documents } = await cms.content.findMany(col.name, {});
        return { col, documents: documents as any[] };
      })),
      media.listTrashed(),
      media.listInteractives(),
    ]);

    let deleted = 0;

    // Delete trashed documents (parallel is safe — each is a separate file)
    const docDeletes: Promise<unknown>[] = [];
    for (const { col, documents } of collectionResults) {
      for (const doc of documents) {
        if (doc.status === "trashed") {
          docDeletes.push(cms.content.delete(col.name, doc.id).catch(() => {}));
          deleted++;
        }
      }
    }
    await Promise.all(docDeletes);

    // Delete trashed media SEQUENTIALLY (shared media-meta.json — race condition if parallel)
    for (const m of trashedMedia) {
      await media.deleteFile(m.folder, m.name).catch(() => {});
      deleted++;
    }

    // Delete trashed interactives SEQUENTIALLY (shared interactives.json)
    for (const int of ints) {
      if (int.status === "trashed") {
        await media.deleteInteractive(int.id).catch(() => {});
        deleted++;
      }
    }

    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
