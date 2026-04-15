/**
 * F61 — Unified 3-Layer Event Log
 *
 * Three append-only JSONL logs per site:
 *   - audit.jsonl  (GDPR: who did what, when)    90-day retention
 *   - server.jsonl (errors, deploy, scheduler)   30-day retention
 *   - client.jsonl (toasts, UI errors, clicks)    7-day retention
 *
 * All writes are fire-and-forget — logging never throws or blocks the caller.
 * Reads support filtering, pagination, and CSV/JSON export for GDPR requests.
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { getActiveSitePaths } from "./site-paths";

export type LogLayer = "audit" | "server" | "client";
export type LogLevel = "info" | "warn" | "error";

export interface LogActor {
  type: "user" | "system" | "agent" | "scheduler" | "browser";
  userId?: string;
  name?: string;
  email?: string;
  agentId?: string;
  userAgent?: string;
  ipHash?: string;
}

export interface LogTarget {
  type: "document" | "media" | "interactive" | "agent" | "settings" | "team" | "site" | "form" | "deploy" | "backup" | "permission";
  collection?: string;
  slug?: string;
  id?: string;
  title?: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  layer: LogLayer;
  level: LogLevel;
  action: string;
  actor: LogActor;
  target?: LogTarget;
  details?: Record<string, unknown>;
  error?: {
    message: string;
    stack?: string;
    status?: number;
  };
}

const FILES: Record<LogLayer, string> = {
  audit: "audit.jsonl",
  server: "server.jsonl",
  client: "client.jsonl",
};

const MAX_LINES: Record<LogLayer, number> = {
  audit: 50000,
  server: 20000,
  client: 10000,
};

const MAX_AGE_DAYS: Record<LogLayer, number> = {
  audit: 90,
  server: 30,
  client: 7,
};

async function logFilePath(layer: LogLayer, dataDirOverride?: string): Promise<string> {
  const dataDir = dataDirOverride ?? (await getActiveSitePaths()).dataDir;
  return path.join(dataDir, FILES[layer]);
}

function makeId(): string {
  return crypto.randomBytes(4).toString("hex");
}

/** Write a log entry — never throws, never blocks. */
export async function logEvent(
  entry: Omit<LogEntry, "id" | "timestamp"> & { dataDir?: string },
): Promise<void> {
  try {
    const { dataDir, ...rest } = entry;
    const record: LogEntry = {
      id: makeId(),
      timestamp: new Date().toISOString(),
      ...rest,
    };
    const file = await logFilePath(record.layer, dataDir);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.appendFile(file, JSON.stringify(record) + "\n");
  } catch {
    // Logging must never fail the caller
  }
}

/** Convenience: write an audit entry. */
export async function auditLog(
  action: string,
  actor: LogActor,
  target?: LogTarget,
  details?: Record<string, unknown>,
): Promise<void> {
  await logEvent({ layer: "audit", level: "info", action, actor, target, details });
}

/** Convenience: write a server event. */
export async function serverLog(
  level: LogLevel,
  action: string,
  details?: Record<string, unknown>,
  error?: LogEntry["error"],
): Promise<void> {
  await logEvent({
    layer: "server",
    level,
    action,
    actor: { type: "system" },
    details,
    error,
  });
}

export interface ReadOptions {
  layers?: LogLayer[];
  level?: LogLevel;
  action?: string; // prefix match, e.g. "document." or "document.published"
  userId?: string;
  collection?: string;
  since?: string; // ISO
  until?: string; // ISO
  limit?: number;
  offset?: number;
}

/** Read log entries across one or more layers, newest first. */
export async function readLog(opts: ReadOptions = {}): Promise<{ entries: LogEntry[]; total: number }> {
  const layers = opts.layers ?? ["audit", "server", "client"];
  const limit = opts.limit ?? 100;
  const offset = opts.offset ?? 0;

  const all: LogEntry[] = [];
  for (const layer of layers) {
    try {
      const file = await logFilePath(layer);
      if (!fs.existsSync(file)) continue;
      const content = await fsp.readFile(file, "utf-8");
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line) as LogEntry;
          all.push(entry);
        } catch { /* skip malformed lines */ }
      }
    } catch { /* skip layers we can't read */ }
  }

  // Sort newest first
  all.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // Apply filters
  const filtered = all.filter((e) => {
    if (opts.level && e.level !== opts.level) return false;
    if (opts.action && !e.action.startsWith(opts.action)) return false;
    if (opts.userId && e.actor.userId !== opts.userId) return false;
    if (opts.collection && e.target?.collection !== opts.collection) return false;
    if (opts.since && e.timestamp < opts.since) return false;
    if (opts.until && e.timestamp > opts.until) return false;
    return true;
  });

  return {
    entries: filtered.slice(offset, offset + limit),
    total: filtered.length,
  };
}

/** Count entries by action prefix for dashboard stats. */
export async function logStats(opts: { since?: string } = {}): Promise<{
  byLayer: Record<LogLayer, number>;
  byLevel: Record<LogLevel, number>;
  errors24h: number;
  activeUsers24h: number;
  events24h: number;
  total: number;
}> {
  const { entries } = await readLog({ limit: 100000, since: opts.since });
  const byLayer: Record<LogLayer, number> = { audit: 0, server: 0, client: 0 };
  const byLevel: Record<LogLevel, number> = { info: 0, warn: 0, error: 0 };
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const activeUserIds = new Set<string>();
  let errors24h = 0;
  let events24h = 0;
  for (const e of entries) {
    byLayer[e.layer]++;
    byLevel[e.level]++;
    const in24h = e.timestamp >= cutoff;
    if (in24h) {
      events24h++;
      if (e.actor.userId) activeUserIds.add(e.actor.userId);
      if (e.level === "error") errors24h++;
    }
  }
  return {
    byLayer,
    byLevel,
    errors24h,
    activeUsers24h: activeUserIds.size,
    events24h,
    total: entries.length,
  };
}

/** Rotate a layer's log if it exceeds thresholds. */
export async function rotateLog(layer: LogLayer): Promise<{ rotated: boolean; reason?: string }> {
  try {
    const file = await logFilePath(layer);
    if (!fs.existsSync(file)) return { rotated: false };

    const stat = fs.statSync(file);
    const ageDays = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
    const content = await fsp.readFile(file, "utf-8");
    const lineCount = content.split("\n").filter(Boolean).length;

    if (lineCount < MAX_LINES[layer] && ageDays < MAX_AGE_DAYS[layer]) {
      return { rotated: false };
    }

    const stamp = new Date().toISOString().slice(0, 7);
    const rotated = file.replace(".jsonl", `.${stamp}.jsonl`);
    await fsp.rename(file, rotated);
    return { rotated: true, reason: lineCount >= MAX_LINES[layer] ? "size" : "age" };
  } catch {
    return { rotated: false };
  }
}

/** Hash an IP for GDPR-compliant logging. */
export function hashIp(ip: string | null | undefined): string | undefined {
  if (!ip) return undefined;
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 8);
}
