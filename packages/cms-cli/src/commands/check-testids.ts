/**
 * F162.6 — `cms check-testids` (Gate C command).
 *
 * Scans a site's .tsx/.jsx sources for interactive elements (buttons, inputs,
 * links, anything with an onClick/onChange/… handler) that carry no
 * `data-testid` — the anchor Lens needs to drive + assert them (F086). Exits
 * non-zero when a file has MORE gaps than its baseline allows, so a CI job can
 * BLOCK deploy until a new control gets a testid (or the baseline is bumped).
 *
 * Baseline = per-file accepted gap COUNT (robust to line shifts, unlike a
 * line/signature key): `<relative/path.tsx> <count>`; a bare path with no count
 * grandfathers the whole file. Files not in the baseline allow 0 gaps.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { logger } from '../utils/logger.js';
import { loadTs, walkTsx } from './check-text.js';
import { findTestidGaps, type TestidGap } from './gate-c.js';

/** Parse a per-file testid baseline. Lines: `path/to/file.tsx 3` (accept up to 3
 *  gaps) or a bare `path/to/file.tsx` (grandfather every gap in it). `#` comments
 *  + blanks ignored. Pure so the over/under semantics unit-test without fs. */
export function parseTestidBaseline(text: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(.*\S)\s+(\d+)$/);
    if (m) map.set(m[1]!, parseInt(m[2]!, 10));
    else map.set(line, Number.POSITIVE_INFINITY); // bare path → fully grandfathered
  }
  return map;
}

/** A file fails only when it has MORE gaps than its baseline allows (files not
 *  in the baseline allow 0). This is the F086 "no new gaps" delta. */
export function isFileOverBaseline(gapCount: number, baseline: Map<string, number>, file: string): boolean {
  return gapCount > (baseline.get(file) ?? 0);
}

function loadTestidBaseline(path: string | undefined, cwd: string): Map<string, number> {
  if (!path) return new Map();
  const abs = resolve(cwd, path);
  if (!existsSync(abs)) return new Map();
  return parseTestidBaseline(readFileSync(abs, 'utf-8'));
}

export interface CheckTestidsOptions {
  dir?: string;
  baseline?: string;
  json?: boolean;
  cwd?: string;
}

interface FileReport {
  file: string;
  gaps: TestidGap[];
  allowed: number;
  over: boolean;
}

export async function checkTestidsCommand(options: CheckTestidsOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const ts = await loadTs();
  const dir = resolve(cwd, options.dir ?? 'src');
  const baseline = loadTestidBaseline(options.baseline, cwd);

  const files = walkTsx(dir);
  const reports: FileReport[] = [];
  for (const file of files) {
    const gaps = findTestidGaps(ts, readFileSync(file, 'utf-8'), file);
    if (gaps.length === 0) continue;
    const rel = relative(cwd, file);
    const allowed = baseline.get(rel) ?? 0;
    reports.push({ file: rel, gaps, allowed, over: isFileOverBaseline(gaps.length, baseline, rel) });
  }

  const totalGaps = reports.reduce((n, r) => n + r.gaps.length, 0);
  const failing = reports.filter((r) => r.over);

  if (options.json) {
    process.stdout.write(JSON.stringify({ files: reports, totalGaps }, null, 2) + '\n');
  } else {
    logger.log('');
    if (totalGaps === 0) {
      logger.success(`No interactive elements missing data-testid in ${files.length} file(s).`);
    } else if (failing.length === 0) {
      logger.success(`${totalGaps} interactive gap(s), all within baseline — no new gaps in ${files.length} file(s).`);
    } else {
      logger.error(`${failing.reduce((n, r) => n + r.gaps.length, 0)} interactive element(s) missing data-testid (add one, or bump the baseline):`);
      for (const r of failing) {
        logger.error(`  ${r.file} → ${r.gaps.length} gap(s)${r.allowed ? ` (baseline ${r.allowed})` : ''}`);
        for (const g of r.gaps) logger.error(`      <${g.tag}> line ${g.line} [${g.reason}]`);
      }
    }
  }

  process.exitCode = failing.length === 0 ? 0 : 1;
}
