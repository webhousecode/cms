/**
 * F162.1 — `cms coverage` command.
 *
 * Proves every rendered CMS field on a site is inline-editable: fetch each
 * page's HTML from a running/served site → `computeCoverage(html, schema)`
 * (pure jsdom, NO browser, NO auth) → fail (non-zero exit) if any expected
 * text field isn't tagged with `data-cms-field`. Built on the shared
 * `@broberg/lens-engine` coverage engine (owned by components) — cms only owns
 * the CMS-specific glue (schema parsing + the CI verdict).
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { logger } from '../utils/logger.js';
import {
  parseCoverageSchema,
  summarizeCoverage,
  unionByDocument,
  type CoverageSchema,
  type CoverageReport,
} from './coverage-schema.js';
import { resolveTargets } from './resolve-targets.js';

interface LensEngine {
  computeCoverage: (
    html: string,
    schema: CoverageSchema,
    opts?: { ignoreFields?: string[] },
  ) => CoverageReport;
}

async function loadEngine(): Promise<LensEngine> {
  try {
    // A typed-string specifier keeps lens-engine an OPTIONAL peer dep: cms-cli
    // typechecks + installs WITHOUT pulling the engine's heavy (playwright) tree;
    // the CI coverage job installs it. computeCoverage itself is pure jsdom.
    const spec: string = '@broberg/lens-engine';
    return (await import(spec)) as LensEngine;
  } catch {
    throw new Error(
      'cms coverage needs @broberg/lens-engine (install it in the coverage job): npm i -D @broberg/lens-engine',
    );
  }
}

export interface CoverageCommandOptions {
  /** Path OR URL to a webhouse-schema.json (or a pre-parsed CoverageSchema). */
  schema: string;
  /** Base URL of a running/served site, e.g. http://localhost:5000 (with --pages). */
  url?: string;
  /** URL of the site's sitemap.xml — the preferred, self-maintaining page source. */
  sitemap?: string;
  /** Comma-separated page paths to check (manual list / override; default "/"). */
  pages?: string;
  /** Comma-separated field names that are intentionally NOT inline-editable. */
  ignore?: string;
  /** Path to a baseline file of accepted `collection/field` gaps (F086 model). */
  baseline?: string;
  /** Emit the raw report as JSON instead of a human summary. */
  json?: boolean;
  cwd?: string;
}

/** Load a baseline file: one `collection/field` per line, `#` comments + blanks
 *  ignored. Accepted gaps today → only NEW un-editable fields fail the gate. */
export function loadBaseline(path: string | undefined, cwd: string): Set<string> {
  if (!path) return new Set();
  const abs = resolve(cwd, path);
  if (!existsSync(abs)) return new Set();
  return new Set(
    readFileSync(abs, 'utf-8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#')),
  );
}

async function loadSchema(schemaRef: string, cwd: string): Promise<CoverageSchema> {
  let raw: unknown;
  if (/^https?:\/\//.test(schemaRef)) {
    const res = await fetch(schemaRef);
    if (!res.ok) throw new Error(`Schema fetch failed: ${res.status} ${schemaRef}`);
    raw = await res.json();
  } else {
    raw = JSON.parse(readFileSync(resolve(cwd, schemaRef), 'utf-8'));
  }
  return parseCoverageSchema(raw);
}

export async function coverageCommand(options: CoverageCommandOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  if (!options.url && !options.sitemap) {
    logger.error('cms coverage requires --sitemap <url> (preferred) or --url <base>.');
    process.exitCode = 1;
    return;
  }

  const engine = await loadEngine();
  const schema = await loadSchema(options.schema, cwd);
  const ignoreFields = (options.ignore ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  let targets;
  try {
    targets = await resolveTargets(options);
  } catch (err) {
    logger.error(`  ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }

  const pages: CoverageReport['pages'] = [];
  for (const { label: path, url: pageUrl } of targets) {
    let res: Response;
    try {
      res = await fetch(pageUrl);
    } catch (err) {
      logger.error(`  ${path} → fetch failed (${(err as Error).message})`);
      continue;
    }
    if (!res.ok) {
      logger.error(`  ${path} → HTTP ${res.status} (skipped)`);
      continue;
    }
    const html = await res.text();
    pages.push(...engine.computeCoverage(html, schema, { ignoreFields }).pages);
  }

  // Union per document across all scanned pages: a field is covered if editable
  // on ANY page the document appears on (card on the front page vs full detail).
  const report = unionByDocument({ pages });
  const baseline = loadBaseline(options.baseline, cwd);
  const summary = summarizeCoverage(report, baseline.size ? baseline : undefined);

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    const covered = summary.totalExpected - summary.totalMissing;
    logger.log('');
    logger.log(`Inline-edit coverage: ${summary.coveragePct}% (${covered}/${summary.totalExpected} fields)`);
    if (summary.gaps.length === 0) {
      logger.success('All rendered CMS fields are inline-editable.');
    } else {
      logger.error(`${summary.totalMissing} field(s) are NOT inline-editable:`);
      for (const gap of summary.gaps) {
        logger.error(`  ${gap.collection}/${gap.slug}: ${gap.missing.join(', ')}`);
      }
    }
  }

  process.exitCode = summary.pass ? 0 : 1;
}
