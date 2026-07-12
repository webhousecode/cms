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
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { logger } from '../utils/logger.js';
import {
  parseCoverageSchema,
  summarizeCoverage,
  unionByDocument,
  type CoverageSchema,
  type CoverageReport,
} from './coverage-schema.js';

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
  /** Base URL of a running/served site, e.g. http://localhost:5000. */
  url?: string;
  /** Comma-separated page paths to check (default "/"). */
  pages?: string;
  /** Comma-separated field names that are intentionally NOT inline-editable. */
  ignore?: string;
  /** Emit the raw report as JSON instead of a human summary. */
  json?: boolean;
  cwd?: string;
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
  if (!options.url) {
    logger.error('cms coverage requires --url <base> (a running or served site).');
    process.exitCode = 1;
    return;
  }

  const engine = await loadEngine();
  const schema = await loadSchema(options.schema, cwd);
  const ignoreFields = (options.ignore ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const paths = (options.pages ?? '/')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const base = options.url.replace(/\/$/, '');
  const pages: CoverageReport['pages'] = [];
  for (const path of paths) {
    const pageUrl = base + (path.startsWith('/') ? path : `/${path}`);
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
  const summary = summarizeCoverage(report);

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
