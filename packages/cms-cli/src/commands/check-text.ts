/**
 * F162.5 — `cms check-text` (Gate B command).
 *
 * Scans a site's .tsx/.jsx sources for user-visible hardcoded text that isn't
 * wired to the CMS (the class Gate A / `cms coverage` is structurally blind to)
 * and exits non-zero when any is found — so a CI job can BLOCK deploy until the
 * text is moved to the CMS or explicitly allowlisted.
 *
 * `typescript` is lazy-imported: it's already a dependency of every TS site-repo,
 * so cms-cli never bundles the compiler.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { logger } from '../utils/logger.js';
import { findHardcodedStrings, type HardcodedString } from './gate-b.js';

export async function loadTs(): Promise<typeof import('typescript')> {
  try {
    const spec = 'typescript';
    return (await import(spec)) as typeof import('typescript');
  } catch {
    throw new Error('cms source gates need "typescript" (already a dependency of any TS site-repo).');
  }
}

export function walkTsx(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkTsx(full, out);
    else if (/\.(tsx|jsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Load an allowlist file: one accepted literal per line, `#` comments + blanks
 *  ignored. Its presence is what makes the gate a "no NEW hardcoded text" delta. */
export function loadAllowlist(path: string | undefined, cwd: string): Set<string> {
  if (!path) return new Set();
  try {
    const raw = readFileSync(resolve(cwd, path), 'utf-8');
    return new Set(
      raw
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#')),
    );
  } catch {
    return new Set();
  }
}

export interface CheckTextOptions {
  dir?: string;
  allowlist?: string;
  json?: boolean;
  cwd?: string;
}

export async function checkTextCommand(options: CheckTextOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const ts = await loadTs();
  const dir = resolve(cwd, options.dir ?? 'src');
  const allow = loadAllowlist(options.allowlist, cwd);

  const files = walkTsx(dir);
  const findings: (HardcodedString & { file: string })[] = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf-8');
    for (const hit of findHardcodedStrings(ts, src, file)) {
      if (!allow.has(hit.text)) findings.push({ ...hit, file: relative(cwd, file) });
    }
  }

  if (options.json) {
    process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
  } else {
    logger.log('');
    if (findings.length === 0) {
      logger.success(`No un-allowlisted hardcoded user-visible text in ${files.length} file(s).`);
    } else {
      logger.error(`${findings.length} hardcoded text string(s) not wired to CMS (move to CMS or add to the allowlist):`);
      for (const f of findings) {
        logger.error(`  ${f.file}:${f.line}  ${f.attr ? `[${f.attr}] ` : ''}"${f.text.slice(0, 80)}"`);
      }
    }
  }

  process.exitCode = findings.length === 0 ? 0 : 1;
}
