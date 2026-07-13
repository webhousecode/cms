/**
 * F162.7 — `cms check-editable` (Gate A.1: page-level visible-text scan).
 *
 * The reusable form of the DOM scan sanne's site proved (F162, commit 59ed664):
 * `cms coverage` (Gate A.2) is schema-driven + union-per-document — a field
 * editable on ANY page counts as covered, so a field rendered NON-editably on a
 * specific page slips through. This closes that blind spot: fetch each page's
 * live SSR HTML, and flag every content-leaf element inside <main> with visible
 * prose a visitor sees but cannot inline-edit (no [data-cms-field], not chrome).
 * Strict — 0 gaps required, no baseline. Complements Gate B (source AST) and
 * Gate A.2 (schema coverage). Pure node-html-parser: headless, no browser, no auth.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'node-html-parser';
import { logger } from '../utils/logger.js';
import { resolveTargets } from './resolve-targets.js';

/** Content-leaf elements that carry editable prose a visitor reads. */
const DEFAULT_CONTENT_SEL = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,dd';

/** Chrome / UI / form / inline-edit's own UI — text here is not CMS content. */
const NOISE_SEL =
  'nav,header,footer,button,form,input,select,textarea,[role=button],' +
  '[data-cms-inline-edit-idle],[data-cms-inline-edit-badge],' +
  '[data-cms-inline-edit-toolbar],[data-cms-inline-edit-pill],script,style,svg';

/** A container is not a gap — only its text leaves are. */
const CONTAINER_SEL = 'h1,h2,h3,h4,h5,h6,p,li,[data-cms-field]';

export interface EditableGap {
  tag: string;
  text: string;
}

export interface PageScan {
  path: string;
  status: number;
  marked: number;
  gaps: EditableGap[];
  excluded: string[];
  error?: string;
}

export interface ScanResult {
  marked: number;
  gaps: EditableGap[];
  excluded: string[];
}

/**
 * Scan one page's HTML for visible prose that isn't inline-editable.
 * Pure + synchronous so it unit-tests without a network. An element is a gap iff:
 * it's a text leaf (not a container), has ≥3 chars of visible text, is not inside
 * a [data-cms-field] (self or ancestor), is not inside chrome/noise, and its text
 * doesn't match an intentional-exclude substring (token fields like `{år}`).
 */
export function scanEditable(
  html: string,
  opts?: { contentSel?: string; ignoreText?: string[] },
): ScanResult {
  const contentSel = opts?.contentSel || DEFAULT_CONTENT_SEL;
  const ignoreText = opts?.ignoreText ?? [];
  const root = parse(html, { blockTextElements: { script: false, style: false, noscript: true, pre: true } });
  const main = root.querySelector('main') || root;
  const marked = main.querySelectorAll('[data-cms-field]').length;

  const gaps: EditableGap[] = [];
  const excluded: string[] = [];
  for (const el of main.querySelectorAll(contentSel)) {
    const text = (el.text || '').replace(/\s+/g, ' ').trim();
    if (text.length < 3) continue; // trivial / icon-only
    if (el.closest('[data-cms-field]')) continue; // inline-editable (self or ancestor)
    if (el.closest('[data-cms-html]')) continue; // CMS richtext/HTML field — CMS-managed, deliberately not inline-editable
    if (el.closest('a[href]')) continue; // inside a link → preview/card; the canonical editable copy is the linked page
    if (el.closest(NOISE_SEL)) continue; // chrome / UI / form
    if (el.querySelector(CONTAINER_SEL)) continue; // container, not a text leaf
    if (ignoreText.some((s) => text.includes(s))) {
      excluded.push(text.slice(0, 80));
      continue;
    }
    gaps.push({ tag: el.rawTagName, text: text.slice(0, 80) });
  }
  return { marked, gaps, excluded };
}

export interface CheckEditableOptions {
  /** Base URL of a running/served site, e.g. https://broberg.ai (with --pages). */
  url?: string;
  /** URL of the site's sitemap.xml — the preferred, self-maintaining page source. */
  sitemap?: string;
  /** Comma-separated page paths to check (manual list / override; default "/"). */
  pages?: string;
  /** Comma-separated text substrings that are intentionally NOT inline-editable. */
  ignoreText?: string;
  /** Override the content-leaf selector (default h1-h6,p,li,blockquote,figcaption,dd). */
  contentSel?: string;
  /** Path to a baseline file of accepted page paths (F086 no-new-gaps): pages that
   *  are not yet inline-wired today. Gaps on them are accepted; gaps on any OTHER
   *  page fail. One path per line; a trailing `/` matches that path's descendants. */
  baseline?: string;
  /** Emit the raw per-page report as JSON instead of a human summary. */
  json?: boolean;
  cwd?: string;
}

function splitCsv(v: string | undefined): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Load a check-editable baseline: one accepted page path per line, `#` comments +
 *  blanks ignored. A line ending in `/` accepts that path AND its descendants; an
 *  exact path (no trailing slash) accepts only that page. */
export function loadEditableBaseline(path: string | undefined, cwd: string): string[] {
  if (!path) return [];
  const abs = resolve(cwd, path);
  if (!existsSync(abs)) return [];
  return readFileSync(abs, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

/** A page is accepted if it exactly equals a baseline entry, or (for an entry
 *  ending in `/`) sits under it. `/behandlinger/` accepts every detail page but
 *  NOT the `/behandlinger` index; list `/behandlinger` separately to accept that. */
export function pageMatchesBaseline(pagePath: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => (p.endsWith('/') ? pagePath.startsWith(p) : pagePath === p));
}

export async function checkEditableCommand(options: CheckEditableOptions): Promise<void> {
  if (!options.url && !options.sitemap) {
    logger.error('cms check-editable requires --sitemap <url> (preferred) or --url <base>.');
    process.exitCode = 1;
    return;
  }

  const ignoreText = splitCsv(options.ignoreText);
  let targets;
  try {
    targets = await resolveTargets(options);
  } catch (err) {
    logger.error(`  ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }
  if (targets.length === 0) targets = [{ label: '/', url: (options.url ?? '').replace(/\/$/, '') + '/' }];

  const results: PageScan[] = [];
  for (const { label: path, url: pageUrl } of targets) {
    try {
      const res = await fetch(pageUrl, { headers: { 'user-agent': 'cms-check-editable' } });
      if (!res.ok) {
        results.push({ path, status: res.status, marked: 0, gaps: [], excluded: [], error: `HTTP ${res.status}` });
        continue;
      }
      const html = await res.text();
      const scan = scanEditable(html, {
        ignoreText,
        ...(options.contentSel ? { contentSel: options.contentSel } : {}),
      });
      results.push({ path, status: 200, ...scan });
    } catch (err) {
      results.push({ path, status: 0, marked: 0, gaps: [], excluded: [], error: (err as Error).message });
    }
  }

  const baseline = loadEditableBaseline(options.baseline, options.cwd ?? process.cwd());
  const isAccepted = (r: PageScan) => baseline.length > 0 && pageMatchesBaseline(r.path, baseline);

  const totalMarked = results.reduce((n, r) => n + r.marked, 0);
  const totalExcluded = results.reduce((n, r) => n + r.excluded.length, 0);
  const errors = results.filter((r) => r.error);
  // A gap fails only if its page is NOT baselined as a known-not-yet-wired page.
  const failingGaps = results.filter((r) => r.gaps.length && !isAccepted(r)).reduce((n, r) => n + r.gaps.length, 0);
  const acceptedGaps = results.filter((r) => r.gaps.length && isAccepted(r)).reduce((n, r) => n + r.gaps.length, 0);

  if (options.json) {
    process.stdout.write(JSON.stringify({ pages: results }, null, 2) + '\n');
  } else {
    logger.log('');
    for (const r of results) {
      if (r.error) logger.error(`  ⚠ ${r.path} → ${r.error}`);
      else if (r.gaps.length && isAccepted(r)) logger.log(`  ⊘ ${r.path} → ${r.gaps.length} gap(s) [baselined]`);
      else if (r.gaps.length) logger.error(`  ✗ ${r.path} → ${r.gaps.length} gap(s)`);
      else logger.log(`  ✓ ${r.path}`);
      if (r.gaps.length && !isAccepted(r)) for (const g of r.gaps) logger.error(`      <${g.tag}> ${g.text}`);
    }
    logger.log('');
    const baselineNote = acceptedGaps ? ` · ${acceptedGaps} baselined` : '';
    logger.log(
      `${results.length} page(s) · ${totalMarked} editable field(s) · ${failingGaps} gap(s)${baselineNote} · ${totalExcluded} token-excluded`,
    );
    if (failingGaps === 0 && errors.length === 0) {
      logger.success('All visible content is inline-editable.');
    } else if (failingGaps) {
      logger.error(`${failingGaps} visible text element(s) are NOT inline-editable.`);
    }
    if (errors.length) logger.error(`${errors.length} page(s) could not be scanned (see ⚠ above).`);
  }

  // A page you listed but can't scan (404/network) can't be proven covered → fail.
  process.exitCode = failingGaps === 0 && errors.length === 0 ? 0 : 1;
}
