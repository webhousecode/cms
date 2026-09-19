/**
 * F188.5 — the free text expires, the numbers stay.
 *
 * Owner's decision, 19 September 2026: «90 dage på teksten, tallene for evigt.»
 * A chat log is other people's words about their own business, so we do not
 * accumulate an archive of strangers' conversations — but the countable part
 * (how many, in which language, which turns carried a lead or a miss, and when)
 * has no expiry, because that is the insight the module exists for.
 */

import fs from "fs/promises";
import path from "path";
import { loadRegistry } from "../site-registry";
import { getSiteDataDir, getActiveSitePaths } from "../site-paths";
import { ConversationStore } from "./store";

/**
 * THE one value. Everything else derives from it: the sweep's cut-off AND the
 * `textRetentionDays` the read API hands to any surface that wants to tell a
 * human how long text is kept. Repeat this number anywhere else and the two
 * will disagree the first time it changes — which nobody would notice, because
 * a wrong retention promise renders exactly like a right one.
 */
export const CONVERSATION_TEXT_RETENTION_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** How often the sweep may run. A duration, not a time of day — there is no
 *  hour a retention sweep belongs to, and a duration cannot be wrong across a
 *  daylight-saving change the way a wall-clock rule can. */
const MIN_HOURS_BETWEEN_RUNS = 20;

interface RetentionState {
  lastRun?: string;
}

function statePath(dataDir: string): string {
  return path.join(dataDir, "conversation-retention-state.json");
}

async function readState(dataDir: string): Promise<RetentionState> {
  try {
    return JSON.parse(await fs.readFile(statePath(dataDir), "utf-8")) as RetentionState;
  } catch {
    return {};
  }
}

async function writeState(dataDir: string, state: RetentionState): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(statePath(dataDir), JSON.stringify(state, null, 2));
}

/**
 * Strip expired text for ONE site. Returns what it looked at and what it
 * changed, so a caller can log a real number instead of "done".
 *
 * Age is measured from `createdAt` — the CMS's own clock when the conversation
 * was received — NOT from the caller-supplied turn timestamps. A site that
 * sends a turn dated in the future would otherwise buy its conversation an
 * indefinite stay, and the retention promise is ours to keep, not the caller's.
 */
export async function pruneConversationText(
  dataDir: string,
  now: Date = new Date(),
): Promise<{ scanned: number; redacted: number }> {
  const store = new ConversationStore(dataDir);
  const cutoff = now.getTime() - CONVERSATION_TEXT_RETENTION_DAYS * DAY_MS;

  const summaries = await store.list();
  let redacted = 0;
  for (const s of summaries) {
    if (s.textRedactedAt) continue;

    // Fail SAFE on an unreadable age. `new Date(undefined).getTime()` is NaN,
    // and every comparison with NaN is false — so the obvious
    // `if (age > cutoff) continue` would fall through and destroy the text of a
    // conversation whose date we could not read. On a one-way path the unknown
    // case must keep the data, not delete it.
    const created = new Date(s.createdAt).getTime();
    if (!Number.isFinite(created)) {
      console.warn(`[conversation-retention] skipping ${s.id}: unreadable createdAt ${JSON.stringify(s.createdAt)}`);
      continue;
    }
    if (created > cutoff) continue;

    if (await store.redactText(s.id, now.toISOString())) redacted++;
  }
  return { scanned: summaries.length, redacted };
}

/**
 * Sweep EVERY site. Deliberately its own walk rather than a step inside
 * runToolsScheduler: that loop skips a site whose backup and link-check are
 * both "off", and a site that opted out of backups has not opted out of a
 * data-protection promise. The hole would have been invisible — the sweep
 * would report success having never looked at those sites.
 */
export async function runConversationRetention(
  now: Date = new Date(),
): Promise<{ sitesSwept: number; redacted: number; errors: string[] }> {
  const errors: string[] = [];
  let sitesSwept = 0;
  let redacted = 0;

  const sweep = async (dataDir: string, label: string) => {
    const state = await readState(dataDir);
    if (state.lastRun) {
      const hours = (now.getTime() - new Date(state.lastRun).getTime()) / (60 * 60 * 1000);
      if (hours < MIN_HOURS_BETWEEN_RUNS) return;
    }
    const result = await pruneConversationText(dataDir, now);
    sitesSwept++;
    redacted += result.redacted;
    if (result.redacted > 0) {
      console.log(`[conversation-retention] ${label}: text removed from ${result.redacted} of ${result.scanned}`);
    }
    await writeState(dataDir, { lastRun: now.toISOString() });
  };

  const registry = await loadRegistry();
  if (!registry) {
    try {
      const { dataDir } = await getActiveSitePaths();
      await sweep(dataDir, "single-site");
    } catch (err) {
      errors.push(`single-site: ${err instanceof Error ? err.message : String(err)}`);
    }
    return { sitesSwept, redacted, errors };
  }

  for (const org of registry.orgs) {
    for (const site of org.sites) {
      try {
        const dataDir = await getSiteDataDir(org.id, site.id);
        if (!dataDir) continue;
        await sweep(dataDir, `${org.id}/${site.id}`);
      } catch (err) {
        errors.push(`${org.id}/${site.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return { sitesSwept, redacted, errors };
}
