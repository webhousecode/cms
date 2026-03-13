import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { NextResponse } from "next/server";

const RETENTION_DAYS = parseInt(process.env.TRASH_RETENTION_DAYS ?? "30");

export async function GET() {
  try {
    const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
    const allTrashed: Array<{ collection: string; collectionLabel: string; doc: unknown }> = [];
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

    for (const col of config.collections) {
      const { documents } = await cms.content.findMany(col.name, {});
      for (const doc of documents as any[]) {
        if (doc.status !== "trashed") continue;
        // Auto-purge expired items
        const trashedAt = doc.data?._trashedAt ? new Date(doc.data._trashedAt as string) : null;
        if (trashedAt && trashedAt < cutoff) {
          await cms.content.delete(col.name, doc.id).catch(() => {});
          continue;
        }
        allTrashed.push({ collection: col.name, collectionLabel: col.label ?? col.name, doc });
      }
    }

    return NextResponse.json(allTrashed);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
    for (const col of config.collections) {
      const { documents } = await cms.content.findMany(col.name, {});
      for (const doc of documents as any[]) {
        if (doc.status === "trashed") {
          await cms.content.delete(col.name, doc.id).catch(() => {});
        }
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
