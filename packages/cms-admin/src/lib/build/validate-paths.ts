/**
 * F126 — Path validation for custom build commands.
 * Ensures workingDir and outDir stay within the project directory.
 */
import path from "path";
import fs from "fs";
import { getServerTSafe } from "@/i18n/server";

/**
 * F211.2 — a build-config error thrown from synchronous code. The message is the
 * English fallback; async callers translate it via localizeKeyedError().
 */
export class BuildConfigError extends Error {
  constructor(message: string, readonly i18nKey: string, readonly i18nVars?: Record<string, string>) {
    super(message);
    this.name = "BuildConfigError";
  }
}

/** Translate any error that carries an i18nKey (BuildConfigError, ServerBuildDisabledError, config-writer guards) into the requester's language, in place. */
export async function localizeKeyedError(err: unknown): Promise<unknown> {
  const keyed = err as Error & { i18nKey?: string; i18nVars?: Record<string, string> };
  if (!(err instanceof Error) || !keyed.i18nKey) return err;
  err.message = (await getServerTSafe())(keyed.i18nKey, keyed.i18nVars);
  return err;
}

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
    throw new BuildConfigError(`workingDir "${workingDir}" escapes project directory`, "deployText.buildPaths.workingDirEscapes", { dir: String(workingDir) }); // i18n-ignore: English fallback; translated via its key by localizeKeyedError()
  }
  if (!fs.existsSync(working)) {
    throw new BuildConfigError(`workingDir "${working}" does not exist`, "deployText.buildPaths.workingDirMissing", { dir: working }); // i18n-ignore: English fallback; translated via its key by localizeKeyedError()
  }
  if (!fs.statSync(working).isDirectory()) {
    throw new BuildConfigError(`workingDir "${working}" is not a directory`, "deployText.buildPaths.workingDirNotDir", { dir: working }); // i18n-ignore: English fallback; translated via its key by localizeKeyedError()
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
    throw new BuildConfigError(`outDir "${outDir}" escapes project directory`, "deployText.buildPaths.outDirEscapes", { dir: outDir }); // i18n-ignore: English fallback; translated via its key by localizeKeyedError()
  }
  return out;
}
