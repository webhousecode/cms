import { validateCalendarTokenForSite } from "@/lib/site-config";
import { icsUtc } from "@/lib/dansk-tid";
import { getSitePathsFor } from "@/lib/site-paths";
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * GET /api/cms/scheduled/calendar.ics?token=<hmac>&org=<orgId>&site=<siteId>
 *
 * Returns an iCalendar feed of all scheduled publish/unpublish events.
 * Reads from a pre-built snapshot (scheduled-events.json) written by the
 * Calendar page on each load. No CMS instance or GitHub API needed.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const orgId = url.searchParams.get("org") ?? "";
  const siteId = url.searchParams.get("site") ?? "";

  if (!token || !(await validateCalendarTokenForSite(token, orgId, siteId))) {
    return NextResponse.json({ error: "Access denied" }, { status: 401 });
  }

  try {
    const sitePaths = await getSitePathsFor(orgId, siteId);
    if (!sitePaths) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    const baseUrl = new URL(request.url).origin;
    const snapshotPath = path.join(sitePaths.dataDir, "scheduled-events.json");
    const events: string[] = [];

    if (fs.existsSync(snapshotPath)) {
      const items = JSON.parse(fs.readFileSync(snapshotPath, "utf-8")) as {
        id: string; type: string; date: string; title: string; subtitle: string; href: string;
      }[];

      for (const item of items) {
        const docUrl = `${baseUrl}${item.href}`;
        const summaryMap: Record<string, string> = {
          publish: `📗 Publish: ${item.title}`,
          unpublish: `📕 Unpublish: ${item.title}`,
          backup: `💾 ${item.title}`,
          "link-check": `🔗 ${item.title}`,
        };
        events.push(formatEvent({
          uid: `${item.id}@webhouse-cms`,
          summary: summaryMap[item.type] ?? item.title,
          description: `${item.subtitle} — ${item.href.split("/").pop()}`,
          dtstart: toIcsDate(item.date),
          dtend: toIcsDate(item.date, 15),
          url: docUrl,
        }));
      }
    }

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
        "Content-Disposition": "inline; filename=\"cms-schedule.ics\"",
        "Cache-Control": "no-cache, no-store",
      },
    });
  } catch (err) {
    console.error("[calendar.ics]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** F194 — ICS-tid i UTC, `YYYYMMDDTHHMMSSZ`.
 *
 *  Her stod to forskellige veje til det samme svar. Uden minutter blev
 *  strengen bare klippet (`replace(/[-:]/g,"").slice(0,15)`), så en ...Z-tid
 *  blev til et FLYDENDE tidspunkt uden zone — som modtagerens kalender-app
 *  læser som SIN egen lokale tid. Med minutter gik den gennem `new Date` og
 *  lokale gettere, altså serverens UTC. To grene, to resultater, og i en
 *  UTC-container faldt de sammen så forskellen var usynlig.
 *
 *  Filen erklærede samtidig X-WR-TIMEZONE:Europe/Copenhagen. Modsigelsen stod
 *  i én fil. */
function toIcsDate(iso: string, addMinutes = 0): string {
  return icsUtc(iso, addMinutes);
}

function formatEvent({ uid, summary, description, dtstart, dtend, url }: {
  uid: string; summary: string; description: string; dtstart: string; dtend: string; url?: string;
}): string {
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    // Z'et sad før UDEN FOR kaldet, altså sat på bagefter uanset hvad der
    // stod i strengen. icsUtc bærer det selv, fordi den regner i UTC.
    `DTSTAMP:${icsUtc(new Date())}`,
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
