/**
 * F162.5 — Gate B: hardcoded user-visible text detector.
 *
 * Gate A (`cms coverage`) can only see text that is ALREADY wired to the CMS —
 * it checks "did you forget to tag a CMS field?". It is structurally blind to
 * prose that was never CMS content (a hardcoded legal page, a baked-in button
 * label). Gate B closes that hole: it scans the SOURCE for user-visible text
 * literals that aren't dynamic ({expr}) — the class Gate A can't catch.
 *
 * It is a heuristic (a static scan can't prove intent), so it pairs with an
 * allowlist: legitimately-static strings are baselined, and only NEW hardcoded
 * text fails the gate (the F086 testid-gaps "no new gaps" model).
 *
 * `typescript` is dependency-injected (not imported at runtime) so this stays a
 * pure, testable function and cms-cli never bundles the compiler — the CLI
 * lazy-imports the site-repo's own typescript and passes it in.
 */
import type * as TS from 'typescript';

export interface HardcodedString {
  /** The literal text, trimmed. */
  text: string;
  /** 1-based line number in the source. */
  line: number;
  kind: 'jsx-text' | 'attr';
  /** For kind 'attr', the attribute name (title/alt/placeholder/aria-label). */
  attr?: string;
}

/** User-visible attributes whose STRING-LITERAL values are rendered to a human. */
const VISIBLE_ATTRS = new Set(['title', 'alt', 'placeholder', 'aria-label', 'aria-description']);

/**
 * A literal counts as prose (user-visible content) when it has at least one run
 * of two+ letters. Excludes pure whitespace, numbers, arrows and punctuation
 * (→, ·, —, |, …) that are structural, not content.
 */
export function isProse(s: string): boolean {
  return /\p{L}{2,}/u.test(s);
}

/**
 * Find user-visible hardcoded text in a .tsx/.jsx source: JSX text nodes and
 * string literals in visible attributes. Dynamic content ({expr}) is ignored —
 * only the class Gate A cannot see. Returns [] for non-JSX or empty sources;
 * never throws.
 */
export function findHardcodedStrings(
  ts: typeof TS,
  source: string,
  fileName = 'file.tsx',
): HardcodedString[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: HardcodedString[] = [];
  const lineOf = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;

  const visit = (node: TS.Node): void => {
    if (ts.isJsxText(node)) {
      const text = node.text.trim();
      if (isProse(text)) out.push({ text, line: lineOf(node.getStart(sf)), kind: 'jsx-text' });
    } else if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const name = node.name.getText(sf);
      if (VISIBLE_ATTRS.has(name) && isProse(node.initializer.text)) {
        out.push({ text: node.initializer.text.trim(), line: lineOf(node.getStart(sf)), kind: 'attr', attr: name });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}
