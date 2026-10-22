/**
 * F211.2 — counts user-facing English that is still written straight into a
 * component instead of going through t(). Drives the ratchet test: the number
 * may only fall, and the work is done when it is 0.
 *
 * Counted: JSX text with a letter in it, the string value of user-facing
 * attributes, and literal toast messages. Not counted: anything inside t(),
 * class names, ids, testids, URLs, code samples in <code>/<pre>.
 */
import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export interface HardcodedText { file: string; line: number; text: string }

const USER_ATTRS = new Set(["title", "placeholder", "aria-label", "alt", "label"]);
const SKIP_TAGS = new Set(["code", "pre", "kbd", "style", "script"]);
const LETTER = /\p{L}/u;

function tagName(el: ts.JsxOpeningLikeElement): string {
  return el.tagName.getText();
}

export function scanSource(file: string, source: string): HardcodedText[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: HardcodedText[] = [];
  const add = (node: ts.Node, text: string) => {
    const t = text.replace(/\s+/g, " ").trim();
    if (!t || !LETTER.test(t)) return;
    out.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, text: t });
  };
  const visit = (node: ts.Node, skip: boolean) => {
    if (ts.isJsxElement(node) && SKIP_TAGS.has(tagName(node.openingElement))) skip = true;
    if (!skip && ts.isJsxText(node)) add(node, node.text);
    if (!skip && ts.isJsxAttribute(node) && node.initializer && USER_ATTRS.has(node.name.getText())) {
      const init = node.initializer;
      if (ts.isStringLiteral(init)) add(init, init.text);
      else if (ts.isJsxExpression(init) && init.expression && (ts.isStringLiteral(init.expression) || ts.isNoSubstitutionTemplateLiteral(init.expression))) add(init, init.expression.text);
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.getText() === "toast" && node.arguments[0]
      && (ts.isStringLiteral(node.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))) {
      add(node.arguments[0], node.arguments[0].text);
    }
    ts.forEachChild(node, (c) => visit(c, skip));
  };
  visit(sf, false);
  return out;
}

export function scanTree(root: string): HardcodedText[] {
  const out: HardcodedText[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "__tests__" || name === "node_modules") continue;
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".tsx")) out.push(...scanSource(path.relative(root, p), readFileSync(p, "utf-8")));
    }
  };
  walk(root);
  return out;
}
