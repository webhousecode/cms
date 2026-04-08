/**
 * Agent feedback storage (Phase 2 of Agents Overhaul).
 *
 * Persists curator corrections, rejections, and edits to per-agent
 * feedback files. The agent runner reads the most recent entries
 * back via `loadFeedbackForPrompt` to inject them as few-shot
 * "learn from past corrections" examples in the system prompt.
 *
 * Storage: `_data/agents/{agentId}/feedback.json` — JSON array.
 * The legacy `loadFeedback()` in agent-runner.ts read the same path
 * with a simpler `{ original, corrected }` shape; this module is
 * a superset and remains backwards-compatible.
 */
import fs from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "./site-paths";

export type FeedbackType = "correction" | "rejection" | "edit";

export interface FeedbackEntry {
  id: string;
  type: FeedbackType;
  /** Source queue item, if any */
  queueItemId?: string;
  /** Field name the feedback is about (for corrections/edits) */
  field?: string;
  /** Original AI output */
  original?: string;
  /** Curator-corrected version */
  corrected?: string;
  /** Free-form curator notes (rejections especially) */
  notes?: string;
  createdAt: string;
}

const MAX_ENTRIES = 200;

async function getFeedbackPath(agentId: string): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  return path.join(dataDir, "agents", agentId, "feedback.json");
}

export async function readFeedback(agentId: string): Promise<FeedbackEntry[]> {
  const filePath = await getFeedbackPath(agentId);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    // Backwards-compat: legacy entries had only { original, corrected }
    return data.map((e, i): FeedbackEntry => {
      if (e && typeof e === "object" && "type" in e && "id" in e) {
        return e as FeedbackEntry;
      }
      return {
        id: `legacy-${i}`,
        type: "correction",
        original: typeof e?.original === "string" ? e.original : undefined,
        corrected: typeof e?.corrected === "string" ? e.corrected : undefined,
        createdAt: new Date(0).toISOString(),
      };
    });
  } catch {
    return [];
  }
}

export async function appendFeedback(
  agentId: string,
  entry: Omit<FeedbackEntry, "id" | "createdAt">,
): Promise<FeedbackEntry> {
  const existing = await readFeedback(agentId);
  const full: FeedbackEntry = {
    ...entry,
    id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  const next = [...existing, full].slice(-MAX_ENTRIES);
  const filePath = await getFeedbackPath(agentId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(next, null, 2));
  return full;
}

/**
 * Returns the last N correction/edit examples in the simple shape the
 * agent runner injects into the system prompt. Filters out rejections
 * (which have no corrected text) and entries without both sides of the
 * diff.
 */
export async function loadFeedbackForPrompt(
  agentId: string,
  limit = 5,
): Promise<{ original: string; corrected: string }[]> {
  const all = await readFeedback(agentId);
  const examples: { original: string; corrected: string }[] = [];
  for (let i = all.length - 1; i >= 0 && examples.length < limit; i--) {
    const e = all[i];
    if ((e.type === "correction" || e.type === "edit") && e.original && e.corrected) {
      examples.push({ original: e.original, corrected: e.corrected });
    }
  }
  return examples.reverse();
}

/**
 * Returns the last N rejection notes — short curator-written reasons
 * the previous outputs were rejected. Used to populate a "things to
 * avoid" section in the system prompt so agents stop repeating
 * mistakes that didn't get a literal corrected example.
 *
 * Empty array when no rejections exist; the runner skips the section.
 */
export async function loadRejectionsForPrompt(
  agentId: string,
  limit = 5,
): Promise<string[]> {
  const all = await readFeedback(agentId);
  const notes: string[] = [];
  for (let i = all.length - 1; i >= 0 && notes.length < limit; i--) {
    const e = all[i];
    if (e.type === "rejection" && e.notes && e.notes.trim()) {
      notes.push(e.notes.trim());
    }
  }
  return notes.reverse();
}

/**
 * Diff two contentData maps and record one "correction" feedback entry
 * per field that changed. Used by the curation approve route when the
 * curator edited fields before approving.
 */
export async function recordCorrectionsFromDiff(params: {
  agentId: string;
  queueItemId: string;
  original: Record<string, unknown>;
  corrected: Record<string, unknown>;
}): Promise<number> {
  const { agentId, queueItemId, original, corrected } = params;
  const fields = new Set([...Object.keys(original), ...Object.keys(corrected)]);
  let count = 0;
  for (const field of fields) {
    const o = original[field];
    const c = corrected[field];
    if (typeof o !== "string" || typeof c !== "string") continue;
    if (o === c) continue;
    await appendFeedback(agentId, {
      type: "correction",
      queueItemId,
      field,
      original: o,
      corrected: c,
    });
    count++;
  }
  return count;
}
