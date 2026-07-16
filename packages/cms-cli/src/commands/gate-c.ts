/**
 * F162.6 — Gate C: interactive-element testID coverage detector.
 *
 * Lens drives + asserts a site through `data-testid` anchors (F086). An
 * interactive element without one is invisible to Lens — it can't be clicked
 * or verified. The cardmem daemon already reports these gaps live
 * (`POST 127.0.0.1:7475/lens/testid-gaps`), but a site's CI can't call a local
 * daemon. Gate C is the deterministic, CI-runnable static equivalent: scan the
 * SOURCE for interactive JSX elements a visitor can click/type that carry no
 * `data-testid`, so a NEW untagged control blocks the build.
 *
 * Heuristic → pairs with a baseline (per-file accepted counts, F086 "no new
 * gaps"): only a NEW gap fails. `typescript` is dependency-injected (same as
 * gate-b.ts) so this stays a pure, testable function and cms-cli never bundles
 * the compiler.
 */
import type * as TS from 'typescript';

export interface TestidGap {
  /** Tag name of the interactive element (e.g. 'button', 'a', 'CustomSelect'). */
  tag: string;
  /** 1-based line number in the source. */
  line: number;
  /** Why it counts as interactive: a native control, or a handler-carrying element. */
  reason: 'control' | 'handler';
}

/** Native HTML elements that are interactive controls by themselves. `a` only
 *  counts with an href (or a handler) — a bare <a> anchor is not a control. */
const NATIVE_CONTROLS = new Set(['button', 'input', 'select', 'textarea']);

/** Event-handler props that make ANY element (native or custom) an interactive
 *  control a visitor drives — the F086 "onClick/onChange/…" set. */
const INTERACTION_HANDLERS = new Set([
  'onClick',
  'onChange',
  'onSubmit',
  'onInput',
  'onToggle',
  'onKeyDown',
  'onKeyUp',
  'onKeyPress',
  'onPointerDown',
  'onMouseDown',
]);

/**
 * Find interactive JSX elements missing a `data-testid`. An element is a gap iff
 * it is interactive — a native control (`button|input|select|textarea`), an
 * `a` with an href, or ANY element carrying an interaction handler — AND it has
 * no `data-testid`, is not a hidden input, and does not spread props (`{...x}`,
 * which could carry the testid — we can't statically prove absence, so we don't
 * flag it). Returns [] for non-JSX / empty sources; never throws.
 */
export function findTestidGaps(
  ts: typeof TS,
  source: string,
  fileName = 'file.tsx',
): TestidGap[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: TestidGap[] = [];
  const lineOf = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;

  const visit = (node: TS.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sf);
      let hasTestid = false;
      let hasSpread = false;
      let hasHandler = false;
      let hasHref = false;
      let inputType: string | null = null;

      for (const prop of node.attributes.properties) {
        if (ts.isJsxSpreadAttribute(prop)) {
          hasSpread = true;
          continue;
        }
        if (!ts.isJsxAttribute(prop)) continue;
        const name = prop.name.getText(sf);
        if (name === 'data-testid') hasTestid = true;
        else if (INTERACTION_HANDLERS.has(name)) hasHandler = true;
        else if (name === 'href') hasHref = true;
        else if (name === 'type' && prop.initializer && ts.isStringLiteral(prop.initializer)) {
          inputType = prop.initializer.text;
        }
      }

      const isNativeControl = NATIVE_CONTROLS.has(tag);
      const isInteractiveLink = tag === 'a' && (hasHref || hasHandler);
      const interactive = isNativeControl || isInteractiveLink || hasHandler;
      const isHiddenInput = tag === 'input' && inputType === 'hidden';

      if (interactive && !isHiddenInput && !hasTestid && !hasSpread) {
        out.push({
          tag,
          line: lineOf(node.getStart(sf)),
          reason: isNativeControl || isInteractiveLink ? 'control' : 'handler',
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}
