/**
 * F144 P4 — Persistent build log per (siteId, sha).
 *
 * Each builder run gets one log file under `_data/builds/<siteId>/<sha>.json`.
 * The file is the source of truth for the live UI (polled / SSE-streamed)
 * and for the post-mortem listing in Site Settings → Deploy → History.
 *
 * Schema:
 *   {
 *     siteId, sha,
 *     startedAt, updatedAt,
 *     phase: "init" | "source-extract" | "image-build" | "image-push" | "done" | "failed",
 *     message?: string,
 *     events: [{ ts, phase, message }, …],   // append-only audit trail
 *     final?: { success, exitCode?, durationMs?, imageTag? },
 *   }
 *
 * Read/write through the helpers below — never poke the file directly so
 * concurrent callbacks (init + source-extract arrive within the same
 * second) don't trample each other. We do a read-modify-write under a
 * per-build promise lock.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getActiveSitePaths } from "../site-paths";

export type BuildPhase =
  | "init"
  | "source-extract"
  | "image-build"
  | "image-push"
  | "done"
  | "failed";

export interface BuildEvent {
  ts: string;
  phase: BuildPhase;
  message?: string;
}

export interface BuildRecord {
  siteId: string;
  sha: string;
  startedAt: string;
  updatedAt: string;
  phase: BuildPhase;
  message?: string;
  events: BuildEvent[];
  final?: {
    success: boolean;
    exitCode?: number | null;
    durationMs?: number;
    imageTag?: string;
  };
}

const buildLocks = new Map<string, Promise<void>>();

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = buildLocks.get(key) ?? Promise.resolve();
  let release: () => void;
  const next = new Promise<void>((r) => { release = r; });
  buildLocks.set(key, prev.then(() => next));
  await prev;
  try {
    return await fn();
  } finally {
    release!();
    if (buildLocks.get(key) === next) buildLocks.delete(key);
  }
}

async function buildFilePath(siteId: string, sha: string): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  const dir = path.join(dataDir, "builds", siteId);
  mkdirSync(dir, { recursive: true });
  return path.join(dir, `${sha}.json`);
}

export async function recordBuildEvent(args: {
  siteId: string;
  sha: string;
  phase: BuildPhase;
  message?: string;
  final?: BuildRecord["final"];
}): Promise<BuildRecord> {
  const file = await buildFilePath(args.siteId, args.sha);
  return withLock(`${args.siteId}/${args.sha}`, async () => {
    let record: BuildRecord;
    if (existsSync(file)) {
      record = JSON.parse(readFileSync(file, "utf-8")) as BuildRecord;
    } else {
      record = {
        siteId: args.siteId,
        sha: args.sha,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        phase: args.phase,
        events: [],
      };
    }
    const ts = new Date().toISOString();
    record.events.push({
      ts,
      phase: args.phase,
      ...(args.message && { message: args.message }),
    });
    record.phase = args.phase;
    record.updatedAt = ts;
    if (args.message) record.message = args.message;
    if (args.final) record.final = args.final;

    writeFileSync(file, JSON.stringify(record, null, 2), "utf-8");
    return record;
  });
}

export async function readBuildRecord(siteId: string, sha: string): Promise<BuildRecord | null> {
  const file = await buildFilePath(siteId, sha);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf-8")) as BuildRecord;
}
