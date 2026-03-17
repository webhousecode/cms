import type { AutolinkConfig } from '../schema/types.js';

/**
 * Apply automatic internal linking to an HTML string.
 *
 * Rules:
 * - Terms are matched case-sensitively
 * - Longest term wins (prevents "cms" from matching before "@webhouse/cms")
 * - First occurrence per page only
 * - Never links inside existing <a> tags
 * - Never links inside <h1>–<h6> headings
 * - External hrefs (starting with "http") get target="_blank" rel="noopener noreferrer"
 */
export function applyAutolinks(html: string, autolinks: AutolinkConfig[]): string {
  if (!autolinks || autolinks.length === 0) return html;

  // Sort longest term first to prevent partial matches consuming longer terms
  const sorted = [...autolinks].sort((a, b) => b.term.length - a.term.length);

  // Track which terms have already been linked on this page
  const used = new Set<string>();

  let result = '';
  let pos = 0;
  let inAnchor = 0;
  let inHeading = 0;

  // Match any HTML tag
  const tagRegex = /<(\/?)([\w-]+)[^>]*>/g;

  while (pos < html.length) {
    tagRegex.lastIndex = pos;
    const tagMatch = tagRegex.exec(html);

    if (!tagMatch) {
      // Remaining content is plain text
      const text = html.slice(pos);
      result += (inAnchor > 0 || inHeading > 0)
        ? text
        : replaceTerms(text, sorted, used);
      break;
    }

    // Process text before this tag
    const textBefore = html.slice(pos, tagMatch.index);
    result += (inAnchor > 0 || inHeading > 0)
      ? textBefore
      : replaceTerms(textBefore, sorted, used);

    // Track tag context
    const isClosing = tagMatch[1] === '/';
    const tagName = tagMatch[2]!.toLowerCase();

    if (tagName === 'a') {
      inAnchor += isClosing ? -1 : 1;
    } else if (/^h[1-6]$/.test(tagName)) {
      inHeading += isClosing ? -1 : 1;
    }

    result += tagMatch[0];
    pos = tagMatch.index + tagMatch[0].length;
  }

  return result;
}

function replaceTerms(text: string, autolinks: AutolinkConfig[], used: Set<string>): string {
  if (!text.trim()) return text;

  // Single-pass: collect all match positions on the ORIGINAL text first,
  // then replace from a single sweep — prevents href values from being re-matched.
  const matches: Array<{ start: number; end: number; link: AutolinkConfig }> = [];

  for (const link of autolinks) {
    if (used.has(link.term)) continue;
    // Find first occurrence that doesn't overlap an already-claimed match
    let searchFrom = 0;
    let idx = text.indexOf(link.term, searchFrom);
    while (idx !== -1) {
      const overlaps = matches.some(m => idx < m.end && idx + link.term.length > m.start);
      if (!overlaps) {
        matches.push({ start: idx, end: idx + link.term.length, link });
        break;
      }
      searchFrom = idx + 1;
      idx = text.indexOf(link.term, searchFrom);
    }
  }

  if (matches.length === 0) return text;

  // Sort by start position
  matches.sort((a, b) => a.start - b.start);

  let result = '';
  let pos = 0;
  for (const match of matches) {
    result += text.slice(pos, match.start);
    const isExternal = match.link.href.startsWith('http');
    const attrs = [
      `href="${match.link.href}"`,
      match.link.title ? `title="${match.link.title}"` : '',
      isExternal ? 'target="_blank" rel="noopener noreferrer"' : '',
    ].filter(Boolean).join(' ');
    result += `<a ${attrs}>${match.link.term}</a>`;
    used.add(match.link.term);
    pos = match.end;
  }
  result += text.slice(pos);
  return result;
}
