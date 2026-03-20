/**
 * Tools scheduler — runs scheduled backup and link-check jobs.
 *
 * Called every 5 minutes from instrumentation.ts.
 * Iterates ALL sites across ALL orgs (not just the active site).
 * Triggers jobs via internal HTTP calls with explicit site cookies.
 */
import { loadRegistry } from "./site-registry";
import { readSiteConfigForSite } from "./site-config";

interface SchedulerState {
  lastBackupRun?: string;
  lastLinkCheckRun?: string;
}

async function readState(dataDir: string): Promise<SchedulerState> {
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const raw = await fs.readFile(path.join(dataDir, "tools-scheduler-state.json"), "utf-8");
    return JSON.parse(raw) as SchedulerState;
  } catch { return {}; }
}

async function writeState(dataDir: string, state: SchedulerState): Promise<void> {
  const fs = await import("fs/promises");
  const path = await import("path");
  const filePath = path.join(dataDir, "tools-scheduler-state.json");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(state, null, 2));
}

function isDue(schedule: string, scheduledTime: string, lastRun?: string): boolean {
  if (schedule === "off") return false;
  const now = new Date();
  const [hh, mm] = scheduledTime.split(":").map(Number);
  const scheduledToday = new Date(now);
  scheduledToday.setHours(hh, mm, 0, 0);
  if (now < scheduledToday) return false;
  if (schedule === "weekly" && now.getDay() !== 1) return false;
  if (lastRun) {
    const lastRunDate = new Date(lastRun);
    if (lastRunDate.toDateString() === now.toDateString()) return false;
  }
  return true;
}

export async function runToolsScheduler(): Promise<{ backupRan: boolean; linkCheckRan: boolean; errors: string[] }> {
  const errors: string[] = [];
  let backupRan = false;
  let linkCheckRan = false;

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3010";
  const serviceToken = process.env.CMS_JWT_SECRET ?? "";

  const registry = await loadRegistry();
  if (!registry) {
    // Single-site mode — run for default site
    try {
      const { readSiteConfig } = await import("./site-config");
      const { getActiveSitePaths } = await import("./site-paths");
      const config = await readSiteConfig();
      const { dataDir } = await getActiveSitePaths();
      const result = await runForSite(dataDir, config, baseUrl, serviceToken, "", "", errors);
      backupRan = result.backupRan;
      linkCheckRan = result.linkCheckRan;
    } catch (err) {
      errors.push(`single-site: ${err instanceof Error ? err.message : String(err)}`);
    }
    return { backupRan, linkCheckRan, errors };
  }

  // Multi-site mode — iterate ALL sites in ALL orgs
  for (const org of registry.orgs) {
    for (const site of org.sites) {
      try {
        const config = await readSiteConfigForSite(org.id, site.id);
        if (!config) continue;
        if (config.backupSchedule === "off" && config.linkCheckSchedule === "off") continue;

        const { getSiteDataDir } = await import("./site-paths");
        const dataDir = await getSiteDataDir(org.id, site.id);
        if (!dataDir) continue;

        const label = `${org.id}/${site.id}`;
        const result = await runForSite(dataDir, config, baseUrl, serviceToken, org.id, site.id, errors, label);
        if (result.backupRan) backupRan = true;
        if (result.linkCheckRan) linkCheckRan = true;
      } catch (err) {
        errors.push(`${org.id}/${site.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return { backupRan, linkCheckRan, errors };
}

async function runForSite(
  dataDir: string,
  config: { backupSchedule: string; backupTime: string; backupRetentionDays: number; linkCheckSchedule: string; linkCheckTime?: string },
  baseUrl: string,
  serviceToken: string,
  orgId: string,
  siteId: string,
  errors: string[],
  label?: string,
): Promise<{ backupRan: boolean; linkCheckRan: boolean }> {
  let backupRan = false;
  let linkCheckRan = false;
  const state = await readState(dataDir);
  const prefix = label ? `[${label}] ` : "";

  // Build cookie header for internal HTTP calls (sets active org/site)
  const cookies = orgId && siteId
    ? `cms-active-org=${orgId}; cms-active-site=${siteId}`
    : "";

  // ── Scheduled Backup ─────────────────────────────────────
  if (isDue(config.backupSchedule, config.backupTime, state.lastBackupRun)) {
    try {
      console.log(`[tools-scheduler] ${prefix}Running scheduled backup...`);
      const res = await fetch(`${baseUrl}/api/admin/backup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cms-service-token": serviceToken,
          ...(cookies ? { Cookie: cookies } : {}),
        },
        body: JSON.stringify({ trigger: "scheduled" }),
        signal: AbortSignal.timeout(60000),
      });
      if (res.ok) {
        const data = await res.json() as { fileName?: string; documentCount?: number };
        console.log(`[tools-scheduler] ${prefix}Backup complete: ${data.fileName} (${data.documentCount} docs)`);
        backupRan = true;
      } else {
        errors.push(`${prefix}backup HTTP ${res.status}`);
      }
      state.lastBackupRun = new Date().toISOString();
    } catch (err) {
      errors.push(`${prefix}backup error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Scheduled Link Check ─────────────────────────────────
  if (isDue(config.linkCheckSchedule, config.linkCheckTime ?? "04:00", state.lastLinkCheckRun)) {
    try {
      console.log(`[tools-scheduler] ${prefix}Running scheduled link check...`);
      const cronSecret = process.env.CMS_CRON_SECRET;
      if (cronSecret) {
        const res = await fetch(`${baseUrl}/api/check-links`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cronSecret}`,
            ...(cookies ? { Cookie: cookies } : {}),
          },
        });
        if (res.ok) {
          const data = await res.json() as { total?: number; broken?: number };
          console.log(`[tools-scheduler] ${prefix}Link check complete: ${data.total} links, ${data.broken} broken`);
          linkCheckRan = true;
        } else {
          errors.push(`${prefix}link-check HTTP ${res.status}`);
        }
      }
      state.lastLinkCheckRun = new Date().toISOString();
    } catch (err) {
      errors.push(`${prefix}link-check error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await writeState(dataDir, state);
  return { backupRan, linkCheckRan };
}
