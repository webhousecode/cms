/**
 * F126 — Command allowlist for custom build commands.
 * Validates commands against per-org settings.
 */
import path from "path";

export interface OrgBuildSettings {
  /** Allow custom build commands. Default: true (self-hosted). */
  allowCustomBuildCommands: boolean;
  /** If allowed, restrict to this allowlist. Empty = no restriction. */
  allowedCommands?: string[];
  /** Max timeout in seconds a site can configure. Default: 900. */
  maxTimeout?: number;
}

/** Default allowlist — common build tools that are safe to run. */
export const DEFAULT_ALLOWED_COMMANDS = [
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "node",
  "tsx",
  "php",
  "composer",
  "python",
  "python3",
  "pip",
  "pipenv",
  "ruby",
  "bundle",
  "bundler",
  "go",
  "hugo",
  "dotnet",
  "make",
];

/**
 * Parse command string into argv WITHOUT shell interpretation.
 * Supports quoted arguments and basic escaping.
 */
export function parseCommand(command: string): string[] {
  const argv: string[] = [];
  let current = "";
  let inQuote: string | null = null;
  let escaped = false;

  for (const ch of command.trim()) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (inQuote) {
      if (ch === inQuote) inQuote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      continue;
    }
    if (ch === " " || ch === "\t") {
      if (current) {
        argv.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current) argv.push(current);
  return argv;
}

/**
 * Check if a command is allowed by the org's build settings.
 */
export function isCommandAllowed(
  command: string,
  settings: OrgBuildSettings,
): boolean {
  if (!settings.allowCustomBuildCommands) return false;

  // Empty command is never allowed
  const firstArg = parseCommand(command)[0];
  if (!firstArg) return false;

  if (!settings.allowedCommands || settings.allowedCommands.length === 0)
    return true;

  // Match by basename (e.g. "php" matches "/usr/bin/php")
  const basename = path.basename(firstArg);
  return settings.allowedCommands.includes(basename);
}
