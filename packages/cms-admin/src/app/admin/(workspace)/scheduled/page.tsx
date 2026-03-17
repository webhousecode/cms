import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { ScheduledCalendar } from "./calendar-client";

export default async function ScheduledPage() {
  const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);

  const allDocs = await Promise.all(
    config.collections.map(async (col) => {
      const { documents } = await cms.content.findMany(col.name, {});
      return { col, documents };
    }),
  );

  type Event = {
    id: string;
    type: "publish" | "unpublish";
    date: string;
    title: string;
    subtitle: string;
    href: string;
  };

  const events: Event[] = [];
  for (const { col, documents } of allDocs) {
    for (const doc of documents) {
      const publishAt = (doc as any).publishAt as string | undefined;
      const unpublishAt = (doc as any).unpublishAt as string | undefined;
      if (publishAt) {
        events.push({
          id: `pub-${col.name}-${doc.slug}`,
          type: "publish",
          date: publishAt,
          title: String(doc.data?.title ?? doc.data?.name ?? doc.slug),
          subtitle: col.label ?? col.name,
          href: `/admin/${col.name}/${doc.slug}`,
        });
      }
      if (unpublishAt) {
        events.push({
          id: `unpub-${col.name}-${doc.slug}`,
          type: "unpublish",
          date: unpublishAt,
          title: String(doc.data?.title ?? doc.data?.name ?? doc.slug),
          subtitle: col.label ?? col.name,
          href: `/admin/${col.name}/${doc.slug}`,
        });
      }
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date));

  return <ScheduledCalendar events={events} />;
}
