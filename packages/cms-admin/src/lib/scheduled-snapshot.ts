/**
 * Writes a snapshot of all scheduled events (publishAt/unpublishAt) to
 * _data/scheduled-events.json. Used by the calendar.ics feed which runs
 * without cookies or CMS instance access.
 */
import { getAdminCms, getAdminConfig } from "./cms";
import { getActiveSitePaths } from "./site-paths";
import fs from "fs/promises";
import path from "path";

interface ScheduledEvent {
  id: string;
  type: "publish" | "unpublish";
  date: string;
  title: string;
  subtitle: string;
  href: string;
}

export async function updateScheduledSnapshot(): Promise<void> {
  try {
    const [cms, config, { dataDir }] = await Promise.all([
      getAdminCms(),
      getAdminConfig(),
      getActiveSitePaths(),
    ]);

    const events: ScheduledEvent[] = [];

    const allDocs = await Promise.all(
      config.collections.map(async (col) => {
        const { documents } = await cms.content.findMany(col.name, {});
        return { col, documents };
      }),
    );

    for (const { col, documents } of allDocs) {
      for (const doc of documents) {
        const publishAt = (doc as any).publishAt as string | undefined;
        const unpublishAt = (doc as any).unpublishAt as string | undefined;
        const title = String(doc.data?.title ?? doc.data?.name ?? doc.slug);
        const base = {
          title,
          subtitle: col.label ?? col.name,
          href: `/admin/${col.name}/${doc.slug}`,
        };
        if (publishAt) {
          events.push({ id: `pub-${col.name}-${doc.slug}`, type: "publish", date: publishAt, ...base });
        }
        if (unpublishAt) {
          events.push({ id: `unpub-${col.name}-${doc.slug}`, type: "unpublish", date: unpublishAt, ...base });
        }
      }
    }

    events.sort((a, b) => a.date.localeCompare(b.date));

    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(path.join(dataDir, "scheduled-events.json"), JSON.stringify(events, null, 2));
  } catch {
    // Non-fatal — snapshot is a convenience, not critical
  }
}
