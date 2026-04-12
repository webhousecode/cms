/**
 * F126 Phase 6 — Build audit log.
 *
 * Appends every build execution to _data/build-audit.ndjson (append-only).
 * Used for security forensics, debugging, and the Build History UI.
 */
import fs from "node:fs";
import path from "node:path";
import { getActiveSitePaths } from "../site-paths";

export interface BuildAuditEntry {
  buildId: string;
  timestamp: string;
  profile: string;
  command: string;
  workingDir: string;
  outDir: string;
  exitCode: number | null;
  duration: number;
  success: boolean;
  cancelled: boolean;
  docker?: string; // image name if Docker was used
}

/**
 * Append a build execution to the audit log.
 * Fire-and-forget — never throws.
 */
export async function logBuildExecution(
  entry: BuildAuditEntry,
): Promise<void> {
  try {
    const sitePaths = await getActiveSitePaths();
    const auditDir = sitePaths.dataDir;
    if (!fs.existsSync(auditDir)) {
      fs.mkdirSync(auditDir, { recursive: true });
    }
    const auditPath = path.join(auditDir, "build-audit.ndjson");
    const line = JSON.stringify(entry) + "\n";
    fs.appendFileSync(auditPath, line, "utf-8");
  } catch {
    // Audit logging must never break the build
    console.error("[build-audit] Failed to write audit log entry");
  }
}

/**
 * Read the last N build audit entries for the active site.
 */
export async function readBuildAudit(
  limit = 20,
): Promise<BuildAuditEntry[]> {
  try {
    const sitePaths = await getActiveSitePaths();
    const auditPath = path.join(sitePaths.dataDir, "build-audit.ndjson");
    if (!fs.existsSync(auditPath)) return [];
    const content = fs.readFileSync(auditPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    return lines
      .slice(-limit)
      .map((line) => JSON.parse(line) as BuildAuditEntry)
      .reverse(); // newest first
  } catch {
    return [];
  }
}
