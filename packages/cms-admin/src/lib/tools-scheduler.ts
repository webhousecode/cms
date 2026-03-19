/**
 * Tools scheduler — runs scheduled backup and link-check jobs.
 *
 * Called every 5 minutes from instrumentation.ts.
 * Reads schedule config from site-config.json, tracks last runs
 * in _data/tools-scheduler-state.json.
 */
import fs from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "./site-paths";
import { readSiteConfig } from "./site-config";
import { createBackup, pruneBackups } from "./backup-service";

interface ToolsSchedulerState {
  lastBackupRun?: string;  // ISO timestamp
  lastLinkCheckRun?: string;
}

async function getStatePath(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  return path.join(dataDir, "tools-scheduler-state.json");
}

async function readState(): Promise<ToolsSchedulerState> {
  try {
    const raw = await fs.readFile(await getStatePath(), "utf-8");
    return JSON.parse(raw) as ToolsSchedulerState;
  } catch {
    return {};
  }
}

async function writeState(state: ToolsSchedulerState): Promise<void> {
  const filePath = await getStatePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(state, null, 2));
}

function isDue(schedule: "off" | "daily" | "weekly", scheduledTime: string, lastRun?: string): boolean {
  if (schedule === "off") return false;

  const now = new Date();
  const [hh, mm] = scheduledTime.split(":").map(Number);
  const scheduledToday = new Date(now);
  scheduledToday.setHours(hh, mm, 0, 0);

  // Not yet past scheduled time
  if (now < scheduledToday) return false;

  // Weekly: only Mondays
  if (schedule === "weekly" && now.getDay() !== 1) return false;

  // Already ran today?
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

  try {
    const [config, state] = await Promise.all([readSiteConfig(), readState()]);

    // ── Scheduled Backup ─────────────────────────────────────
    if (isDue(config.backupSchedule, config.backupTime, state.lastBackupRun)) {
      try {
        console.log("[tools-scheduler] Running scheduled backup...");
        const snapshot = await createBackup("scheduled");
        if (snapshot.status === "complete") {
          console.log(`[tools-scheduler] Backup complete: ${snapshot.fileName} (${snapshot.documentCount} docs)`);
          backupRan = true;
        } else {
          errors.push(`backup failed: ${snapshot.error}`);
        }

        // Prune old backups
        const pruned = await pruneBackups(config.backupRetentionDays);
        if (pruned > 0) {
          console.log(`[tools-scheduler] Pruned ${pruned} old backups`);
        }

        state.lastBackupRun = new Date().toISOString();
      } catch (err) {
        errors.push(`backup error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ── Scheduled Link Check ─────────────────────────────────
    if (isDue(config.linkCheckSchedule, config.linkCheckTime ?? "04:00", state.lastLinkCheckRun)) {
      try {
        console.log("[tools-scheduler] Running scheduled link check...");
        // Trigger the link check via internal HTTP call (reuses existing logic)
        const baseUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3010";
        const cronSecret = process.env.CMS_CRON_SECRET;
        if (cronSecret) {
          const res = await fetch(`${baseUrl}/api/check-links`, {
            method: "POST",
            headers: { Authorization: `Bearer ${cronSecret}` },
          });
          if (res.ok) {
            const data = await res.json() as { total?: number; broken?: number };
            console.log(`[tools-scheduler] Link check complete: ${data.total} links, ${data.broken} broken`);
            linkCheckRan = true;
          } else {
            errors.push(`link-check failed: HTTP ${res.status}`);
          }
        } else {
          console.log("[tools-scheduler] Skipping link check — CMS_CRON_SECRET not set");
        }

        state.lastLinkCheckRun = new Date().toISOString();
      } catch (err) {
        errors.push(`link-check error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await writeState(state);
  } catch (err) {
    errors.push(`fatal: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { backupRan, linkCheckRan, errors };
}
