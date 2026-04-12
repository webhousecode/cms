/**
 * F126 — Path validation for custom build commands.
 * Ensures workingDir and outDir stay within the project directory.
 */
import path from "path";
import fs from "fs";

/**
 * Validate that workingDir is under projectDir (no path traversal).
 * Returns the resolved absolute working dir, or throws.
 */
export function resolveWorkingDir(
  projectDir: string,
  workingDir?: string,
): string {
  const project = path.resolve(projectDir);
  const working = path.resolve(project, workingDir ?? ".");
  const rel = path.relative(project, working);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`workingDir "${workingDir}" escapes project directory`);
  }
  if (!fs.existsSync(working)) {
    throw new Error(`workingDir "${working}" does not exist`);
  }
  if (!fs.statSync(working).isDirectory()) {
    throw new Error(`workingDir "${working}" is not a directory`);
  }
  return working;
}

/**
 * Validate that outDir is under projectDir and resolve to absolute.
 */
export function resolveOutDir(projectDir: string, outDir: string): string {
  const project = path.resolve(projectDir);
  const out = path.resolve(project, outDir);
  const rel = path.relative(project, out);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`outDir "${outDir}" escapes project directory`);
  }
  return out;
}
