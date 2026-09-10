/**
 * Writes a snapshot of all scheduled events (publishAt/unpublishAt, backups,
 * link checks) to _data/scheduled-events.json. Used by the calendar.ics feed
 * which runs without cookies or CMS instance access.
 */
import { getAdminCms, getAdminConfig } from "./cms";
import { getActiveSitePaths } from "./site-paths";
import { readSiteConfig } from "./site-config";
import { listBackups } from "./backup-service";
import fs from "fs/promises";
import path from "path";

interface ScheduledEvent {
  id: string;
  type: "publish" | "unpublish" | "backup" | "link-check";
  date: string;
  title: string;
  subtitle: string;
  href: string;
}

/** F194 — `date` er et ØJEBLIK, ikke et vægur.
 *
 *  DEN KOPI DER BLEV GLEMT. scheduled-events/route.ts havde den samme
 *  funktion, og den blev rettet; denne stod tilbage og byggede stadig en
 *  zoneløs streng af getFullYear()/getHours().
 *
 *  Det var ikke bare uensartet — det var brudt. Snapshotten her fodrer
 *  .ics-feedet, og icsUtc() AFVISER en dato-tid uden zone (med vilje: den er
 *  et gæt). Kaldet ligger inde i én try/catch der omslutter hele svaret, så
 *  ét backup-punkt sendte hele kalenderabonnementet i fejl — ikke bare den
 *  ene post. Målt: icsUtc("2026-09-11T03:00:00") kaster «ingen tidszone».
 *
 *  Én form nu, samme som den anden rute. */
function localISO(d: Date): string {
  return d.toISOString();
}

export async function updateScheduledSnapshot(): Promise<void> {
  try {
    const [cms, config, { dataDir }] = await Promise.all([
      getAdminCms(),
      getAdminConfig(),
      getActiveSitePaths(),
    ]);

    const events: ScheduledEvent[] = [];

    // ── Publish/unpublish events from documents ──────────────
    const allDocs = await Promise.all(
      config.collections.map(async (col) => {
        const { documents } = await cms.content.findMany(col.name, {});
        return { col, documents };
      }),
    );

    for (const { col, documents } of allDocs) {
      for (const doc of documents) {
        const publishAt = doc.publishAt;
        const unpublishAt = doc.unpublishAt;
        const title = String(doc.data?.title ?? doc.data?.name ?? doc.slug);
        const base = {
          title,
          subtitle: col.label ?? col.name,
          href: `/admin/content/${col.name}/${doc.slug}`,
        };
        if (publishAt) {
          events.push({ id: `pub-${col.name}-${doc.slug}`, type: "publish", date: publishAt, ...base });
        }
        if (unpublishAt) {
          events.push({ id: `unpub-${col.name}-${doc.slug}`, type: "unpublish", date: unpublishAt, ...base });
        }
      }
    }

    // ── Completed scheduled backups ──────────────────────────
    try {
      const backups = await listBackups();
      for (const snap of backups) {
        if (snap.status !== "complete" || snap.trigger !== "scheduled") continue;
        events.push({
          id: `bak-${snap.id}`,
          type: "backup",
          date: snap.timestamp,
          title: `Backup (${snap.documentCount} docs)`,
          subtitle: "Scheduled backup",
          href: "/admin/backup",
        });
      }
    } catch { /* no backups yet */ }

    // ── Upcoming scheduled backups (next 30 days) ────────────
    try {
      const siteConf = await readSiteConfig();
      if (siteConf.backupSchedule !== "off") {
        const [hh, mm] = siteConf.backupTime.split(":").map(Number);
        const now = new Date();
        for (let i = 0; i < 30; i++) {
          const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hh!, mm!);
          if (d <= now) continue;
          if (siteConf.backupSchedule === "weekly" && d.getDay() !== 1) continue;
          events.push({
            id: `bak-sched-${localISO(d)}`,
            type: "backup",
            date: localISO(d),
            title: "Scheduled Backup",
            subtitle: siteConf.backupSchedule === "daily" ? "Daily backup" : "Weekly backup",
            href: "/admin/backup",
          });
        }
      }

      // ── Upcoming scheduled link checks (next 30 days) ──────
      if (siteConf.linkCheckSchedule !== "off") {
        const now = new Date();
        for (let i = 0; i < 30; i++) {
          const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 3, 0);
          if (d <= now) continue;
          if (siteConf.linkCheckSchedule === "weekly" && d.getDay() !== 1) continue;
          events.push({
            id: `lc-sched-${localISO(d)}`,
            type: "link-check",
            date: localISO(d),
            title: "Scheduled Link Check",
            subtitle: siteConf.linkCheckSchedule === "daily" ? "Daily check" : "Weekly check",
            href: "/admin/link-checker",
          });
        }
      }
    } catch { /* site config not available yet */ }

    events.sort((a, b) => a.date.localeCompare(b.date));

    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(path.join(dataDir, "scheduled-events.json"), JSON.stringify(events, null, 2));
  } catch {
    // Non-fatal — snapshot is a convenience, not critical
  }
}
