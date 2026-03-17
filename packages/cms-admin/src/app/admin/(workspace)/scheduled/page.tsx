import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { readSiteConfig, generateCalendarToken } from "@/lib/site-config";
import { getSessionWithSiteRole } from "@/lib/require-role";
import { cookies } from "next/headers";
import { ScheduledCalendar } from "./calendar-client";

function getExcerpt(data: Record<string, unknown>): string | undefined {
  // Try excerpt, description, then first line of content/body
  for (const key of ["excerpt", "description", "summary"]) {
    if (typeof data[key] === "string" && data[key]) return (data[key] as string).slice(0, 120);
  }
  for (const key of ["content", "body"]) {
    if (typeof data[key] === "string" && data[key]) {
      const text = (data[key] as string)
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/\*\*?(.*?)\*\*?/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/<[^>]+>/g, "")
        .trim();
      const firstLine = text.split("\n").find((l) => l.trim().length > 10);
      if (firstLine) return firstLine.trim().slice(0, 120);
    }
  }
  // Fallback: tags or category
  if (Array.isArray(data.tags) && data.tags.length > 0) return `Tags: ${(data.tags as string[]).join(", ")}`;
  if (typeof data.category === "string") return `Category: ${data.category}`;
  return undefined;
}

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
    excerpt?: string;
  };

  const events: Event[] = [];
  for (const { col, documents } of allDocs) {
    for (const doc of documents) {
      const publishAt = (doc as any).publishAt as string | undefined;
      const unpublishAt = (doc as any).unpublishAt as string | undefined;
      // Extract excerpt: first text field content, stripped of markdown
      const excerpt = getExcerpt(doc.data);
      const base = {
        title: String(doc.data?.title ?? doc.data?.name ?? doc.slug),
        subtitle: col.label ?? col.name,
        href: `/admin/${col.name}/${doc.slug}`,
        excerpt,
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

  // Generate per-user calendar feed token with site context
  const [siteConfig, session, cookieStore] = await Promise.all([readSiteConfig(), getSessionWithSiteRole(), cookies()]);
  const calendarToken = session ? generateCalendarToken(siteConfig.calendarSecret, session.userId) : "";
  const orgId = cookieStore.get("cms-active-org")?.value ?? "";
  const siteId = cookieStore.get("cms-active-site")?.value ?? "";

  return <ScheduledCalendar events={events} calendarToken={calendarToken} orgId={orgId} siteId={siteId} />;
}
