import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface AuditEntry {
  timestamp: string;
  tool: string;
  actor: string;
  result: "success" | "error";
  documentRef?: string;
  error?: string;
}

let auditPath: string | null = null;

export function initAuditLog(dataDir: string): void {
  auditPath = `${dataDir}/mcp-audit.jsonl`;
  mkdirSync(dirname(auditPath), { recursive: true });
}

export function writeAudit(entry: AuditEntry): void {
  if (!auditPath) return;
  try {
    appendFileSync(auditPath, JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    // Non-fatal — don't crash the server if audit fails
  }
}
