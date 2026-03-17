import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { validateCalendarToken } from "@/lib/site-config";
import { NextResponse } from "next/server";

/**
 * GET /api/cms/scheduled/calendar.ics?token=<per-user-hmac>
 * Returns an iCalendar feed of all scheduled publish/unpublish events.
 * Subscribe in Apple Calendar, Google Calendar, etc.
 */
export async function GET(request: Request) {
  // Validate per-user token
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token || !(await validateCalendarToken(token))) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
    const baseUrl = new URL(request.url).origin;

    const events: string[] = [];

    await Promise.all(
      config.collections.map(async (col) => {
        const { documents } = await cms.content.findMany(col.name, {});
        for (const doc of documents) {
          const publishAt = (doc as any).publishAt as string | undefined;
          const unpublishAt = (doc as any).unpublishAt as string | undefined;
          const title = String(doc.data?.title ?? doc.data?.name ?? doc.slug);
          const docUrl = `${baseUrl}/admin/${col.name}/${doc.slug}`;

          if (publishAt) {
            events.push(formatEvent({
              uid: `pub-${col.name}-${doc.slug}`,
              summary: `📗 Publish: ${title}`,
              description: `${col.label ?? col.name} — ${doc.slug}`,
              dtstart: toIcsDate(publishAt),
              dtend: toIcsDate(publishAt, 15),
              url: docUrl,
            }));
          }
          if (unpublishAt) {
            events.push(formatEvent({
              uid: `unpub-${col.name}-${doc.slug}`,
              summary: `📕 Unpublish: ${title}`,
              description: `${col.label ?? col.name} — ${doc.slug}`,
              dtstart: toIcsDate(unpublishAt),
              dtend: toIcsDate(unpublishAt, 15),
              url: docUrl,
            }));
          }
        }
      }),
    );

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//webhouse//cms//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:CMS Content Schedule",
      "X-WR-TIMEZONE:Europe/Copenhagen",
      ...events,
      "END:VCALENDAR",
    ].join("\r\n");

    return new NextResponse(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": "inline; filename=cms-schedule.ics",
        "Cache-Control": "no-cache, no-store",
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** Convert "2026-03-26T21:59:00" to iCal format "20260326T215900" */
function toIcsDate(iso: string, addMinutes = 0): string {
  // Strip non-digits, keep only date+time
  const clean = iso.replace(/[-:]/g, "").slice(0, 15); // "20260326T215900"
  if (addMinutes === 0) return clean;

  // Parse and add minutes
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + addMinutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function formatEvent({ uid, summary, description, dtstart, dtend, url }: {
  uid: string; summary: string; description: string; dtstart: string; dtend: string; url?: string;
}): string {
  return [
    "BEGIN:VEVENT",
    `UID:${uid}@webhouse-cms`,
    `DTSTAMP:${toIcsDate(new Date().toISOString())}Z`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${escapeIcs(summary)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    ...(url ? [`URL:${url}`] : []),
    "END:VEVENT",
  ].join("\r\n");
}

function escapeIcs(s: string): string {
  return s.replace(/[\\;,\n]/g, (c) => c === "\n" ? "\\n" : `\\${c}`);
}
