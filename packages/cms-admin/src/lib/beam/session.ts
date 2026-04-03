/**
 * F122 — Beam Session Tracker.
 *
 * Tracks in-progress Live Beam transfers. Sessions are persisted to disk
 * so they survive across Next.js API route workers.
 *
 * SSE listeners remain in-memory (per-connection).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from "node:fs";
import path from "node:path";

export interface BeamSession {
  beamId: string;
  direction: "sending" | "receiving";
  siteName: string;
  siteId: string;
  targetOrgId?: string;
  totalFiles: number;
  transferredFiles: number;
  totalBytes: number;
  transferredBytes: number;
  currentFile: string;
  phase: "initiate" | "manifest" | "files" | "finalize" | "done" | "error";
  error?: string;
  startedAt: string;
  completedAt?: string;
  checksumErrors: number;
  secretsRequired: string[];
}

/** Directory for beam session files */
function getSessionDir(): string {
  const configPath = process.env.CMS_CONFIG_PATH;
  const base = configPath
    ? path.dirname(path.resolve(configPath))
    : process.cwd();
  const dir = path.join(base, "_data", "beam-sessions");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function sessionPath(beamId: string): string {
  // Sanitize beamId to prevent path traversal
  const safe = beamId.replace(/[^a-zA-Z0-9\-]/g, "");
  return path.join(getSessionDir(), `${safe}.json`);
}

function readSession(beamId: string): BeamSession | undefined {
  const p = sessionPath(beamId);
  if (!existsSync(p)) return undefined;
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return undefined;
  }
}

function writeSession(session: BeamSession): void {
  writeFileSync(sessionPath(session.beamId), JSON.stringify(session, null, 2));
}

/** In-memory SSE listeners (per-connection, not persisted) */
const listeners = new Map<string, Set<(event: string, data: string) => void>>();

function notifyListeners(session: BeamSession): void {
  const set = listeners.get(session.beamId);
  if (!set || set.size === 0) return;

  const data = JSON.stringify({
    beamId: session.beamId,
    phase: session.phase,
    totalFiles: session.totalFiles,
    transferredFiles: session.transferredFiles,
    totalBytes: session.totalBytes,
    transferredBytes: session.transferredBytes,
    currentFile: session.currentFile,
    error: session.error,
    checksumErrors: session.checksumErrors,
    secretsRequired: session.secretsRequired,
  });

  for (const listener of set) {
    listener("progress", data);
  }
}

export function createBeamSession(
  beamId: string,
  direction: "sending" | "receiving",
  siteName: string,
  siteId: string,
  targetOrgId?: string,
): BeamSession {
  const session: BeamSession = {
    beamId,
    direction,
    siteName,
    siteId,
    targetOrgId,
    totalFiles: 0,
    transferredFiles: 0,
    totalBytes: 0,
    transferredBytes: 0,
    currentFile: "",
    phase: "initiate",
    startedAt: new Date().toISOString(),
    checksumErrors: 0,
    secretsRequired: [],
  };
  writeSession(session);
  return session;
}

export function getBeamSession(beamId: string): BeamSession | undefined {
  return readSession(beamId);
}

export function updateBeamSession(
  beamId: string,
  update: Partial<Omit<BeamSession, "beamId">>,
): void {
  const session = readSession(beamId);
  if (!session) return;
  Object.assign(session, update);
  writeSession(session);
  notifyListeners(session);
}

export function completeBeamSession(beamId: string): void {
  const session = readSession(beamId);
  if (!session) return;
  session.phase = "done";
  session.completedAt = new Date().toISOString();
  writeSession(session);
  notifyListeners(session);

  // Clean up session file after 5 minutes
  setTimeout(() => {
    try { unlinkSync(sessionPath(beamId)); } catch { /* already cleaned */ }
  }, 5 * 60 * 1000);
}

export function failBeamSession(beamId: string, error: string): void {
  const session = readSession(beamId);
  if (!session) return;
  session.phase = "error";
  session.error = error;
  writeSession(session);
  notifyListeners(session);

  setTimeout(() => {
    try { unlinkSync(sessionPath(beamId)); } catch { /* already cleaned */ }
  }, 5 * 60 * 1000);
}

export function addBeamListener(
  beamId: string,
  listener: (event: string, data: string) => void,
): () => void {
  if (!listeners.has(beamId)) {
    listeners.set(beamId, new Set());
  }
  listeners.get(beamId)!.add(listener);
  return () => {
    const set = listeners.get(beamId);
    if (set) {
      set.delete(listener);
      if (set.size === 0) listeners.delete(beamId);
    }
  };
}

/**
 * Clean up stale session files (older than 2 hours).
 * Called periodically or on startup.
 */
export function cleanupStaleSessions(): void {
  const dir = getSessionDir();
  if (!existsSync(dir)) return;
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;

  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const p = path.join(dir, file);
    try {
      const session: BeamSession = JSON.parse(readFileSync(p, "utf-8"));
      if (new Date(session.startedAt).getTime() < cutoff) {
        unlinkSync(p);
      }
    } catch {
      // Corrupted file, remove it
      try { unlinkSync(p); } catch { /* ignore */ }
    }
  }
}
