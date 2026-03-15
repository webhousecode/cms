import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { getMediaAdapter } from "@/lib/media";
import { NextResponse } from "next/server";

const RETENTION_DAYS = parseInt(process.env.TRASH_RETENTION_DAYS ?? "30");

export async function GET() {
  try {
    const [cms, config, media] = await Promise.all([getAdminCms(), getAdminConfig(), getMediaAdapter()]);
    const allTrashed: Array<{ collection: string; collectionLabel: string; doc: unknown }> = [];
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

    // Trashed documents
    for (const col of config.collections) {
      const { documents } = await cms.content.findMany(col.name, {});
      for (const doc of documents as any[]) {
        if (doc.status !== "trashed") continue;
        const trashedAt = doc.data?._trashedAt ? new Date(doc.data._trashedAt as string) : null;
        if (trashedAt && trashedAt < cutoff) {
          await cms.content.delete(col.name, doc.id).catch(() => {});
          continue;
        }
        allTrashed.push({ collection: col.name, collectionLabel: col.label ?? col.name, doc });
      }
    }

    // Trashed media files
    const trashedMedia = await media.listTrashed();
    for (const m of trashedMedia) {
      allTrashed.push({
        collection: "_media",
        collectionLabel: "Media",
        doc: {
          id: m.key,
          slug: m.key,
          status: "trashed",
          data: { title: m.name, _trashedAt: m.trashedAt },
          createdAt: m.trashedAt ?? new Date().toISOString(),
          updatedAt: m.trashedAt ?? new Date().toISOString(),
        },
      });
    }

    // Trashed interactives
    const ints = await media.listInteractives();
    for (const int of ints) {
      if (int.status !== "trashed") continue;
      allTrashed.push({
        collection: "_interactives",
        collectionLabel: "Interactives",
        doc: {
          id: int.id,
          slug: int.id,
          status: "trashed",
          data: { title: int.name, _trashedAt: int.updatedAt },
          createdAt: int.createdAt,
          updatedAt: int.updatedAt,
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
  try {
    const [cms, config, media] = await Promise.all([getAdminCms(), getAdminConfig(), getMediaAdapter()]);

    // Permanently delete trashed documents
    for (const col of config.collections) {
      const { documents } = await cms.content.findMany(col.name, {});
      for (const doc of documents as any[]) {
        if (doc.status === "trashed") {
          await cms.content.delete(col.name, doc.id).catch(() => {});
        }
      }
    }

    // Permanently delete trashed media files
    const trashedMedia = await media.listTrashed();
    for (const m of trashedMedia) {
      await media.deleteFile(m.folder, m.name).catch(() => {});
    }

    // Permanently delete trashed interactives
    const ints = await media.listInteractives();
    for (const int of ints) {
      if (int.status === "trashed") {
        await media.deleteInteractive(int.id).catch(() => {});
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
