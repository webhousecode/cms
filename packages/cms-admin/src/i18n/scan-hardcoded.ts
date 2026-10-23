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
  if (/i18n-ignore-file:\s*\S/.test(source)) return [];
  const lines = source.split("\n");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: HardcodedText[] = [];
  const add = (node: ts.Node, text: string) => {
    const t = text.replace(/\s+/g, " ").trim();
    if (!t || !LETTER.test(t)) return;
    const line = sf.getLineAndCharacterOfPosition(node.getStart()).line;
    if (/i18n-ignore:\s*\S/.test(lines[line] ?? "") || markerLineAbove(lines[line - 1])) return;
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

/* ─── F211.2 · string literals ──────────────────────────────────────────
 * scanSource() sees JSX text and user-facing attributes. It is blind to text
 * that travels through a variable first — a label in a lookup table, a
 * ternary state ("Saving…"), an Error message a route returns, a chat status
 * line. scanLiterals() finds string literals that LOOK like prose, anywhere
 * in .ts/.tsx, outside t(). It is a heuristic with known false positives;
 * a literal that is deliberately not UI text is listed in an allowlist by
 * the caller, never silently skipped here.
 */

/** Calls whose string arguments are code, not text a person reads. */
const CODE_CALLS = /^(console\.\w+|fetch|require|import|t|useT|getT|translate|getServerT|.*\.(get|set|has|delete|append|getItem|setItem|removeItem|addEventListener|removeEventListener|dispatchEvent|querySelector|querySelectorAll|closest|matches|includes|startsWith|endsWith|indexOf|split|join|replace|replaceAll|match|test|localeCompare|padStart|padEnd|toLocaleString|toLocaleDateString|toLocaleTimeString|getAttribute|setAttribute|removeAttribute|on|off|emit)|path\.\w+|join|resolve|new URL|URL|CustomEvent|Event|cookies|headers|redirect|NextResponse\.redirect|revalidatePath|revalidateTag|execFileSync|spawn|spawnSync|execFile|z\.\w+|clsx|cn|cva|Symbol|RegExp)$/;
/** Object keys / JSX attributes whose value is code. */
const CODE_KEYS = /^(className|class|style|id|key|href|src|srcSet|type|method|variant|size|mode|icon|color|kind|role|status|target|rel|as|path|url|route|slug|name|value|field|collection|locale|lang|format|accept|pattern|autoComplete|inputMode|htmlFor|tabIndex|data-.*|aria-(controls|describedby|labelledby|hidden|current|expanded|selected|haspopup)|mime|contentType|encoding|provider|model|tier|event|action|permission|capability|testid|ref|align|justify|direction|position|display|overflow|cursor|fontFamily|fontWeight|transition|transform|animation|background|border|boxShadow|width|height|cache|credentials|redirect|signal|referrerPolicy|sameSite|domain|scope|grant_type|response_type|code_challenge_method|prompt|system|instruction|regex)$/;

/** A marker on the line ABOVE counts only when that line is a comment of its own —
 *  a trailing marker belongs to its own line, never to the next one. */
function markerLineAbove(line: string | undefined): boolean {
  const s = (line ?? "").trim();
  return /^(\/\/|\/\*|\{\/\*|\*)/.test(s) && /i18n-ignore:\s*\S/.test(s);
}

/** JSX props that carry text a person reads — on HTML elements and our own components. */
const TEXT_PROPS = /^(title|placeholder|alt|aria-label|label|description|text|message|heading|subtitle|hint|tooltip|caption|emptyText|emptyMessage|confirmText|confirmLabel|cancelLabel|submitLabel|helperText|errorText|sublabel|badge|prefix|suffix)$/;

function looksLikeProse(v: string): boolean {
  const s = v.trim();
  if (s.length < 2 || s.length > 600) return false;
  if (!/\p{L}{2,}/u.test(s)) return false;
  if (/^(https?:|mailto:|tel:|data:|\/|\.\/|\.\.\/|#|@|\$|--)/.test(s)) return false;           // urls, paths, css vars
  if (/^[a-z0-9]+([._:\/-][a-z0-9]+)*$/i.test(s) && !/^[A-Z][a-z]{2,}$/.test(s)) return false;    // identifiers, keys, slugs
  if (/^[A-Z0-9_]+$/.test(s)) return false;                                                       // CONSTANTS
  if (/[{};]|=>|\bvar\(|\d(px|rem|em|ms|s|%|vh|vw)\b/.test(s) && !/[.!?…]$/.test(s)) return false; // code / css
  if (/^[\w-]+(\s+[\w-]+)*$/.test(s) && /\b(flex|grid|items-|justify-|text-|bg-|border|rounded|p[xytrbl]?-\d|m[xytrbl]?-\d|w-|h-|gap-|hover:|dark:|sr-only|truncate)\b/.test(s)) return false; // tailwind
  if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(s)) return false;
  if (/^(public|private|no-store|no-cache|max-age)\b|^(rgb|rgba|hsl|hsla)\(|^(npm|pnpm|npx|bun|yarn|git|node|docker|flyctl) /.test(s)) return false; // headers, colours, commands
  if (/^[A-Z][a-z]{2,}(\.\.\.|…)?$/.test(s)) return true;          // "Saving…", "Dashboard"
  if (/\s/.test(s) && /\b[a-z]{2,}\b/.test(s)) return true;          // a sentence or a phrase
  if (/^[A-Z][a-z]+( [A-Z][a-z]+)+[.!?…]*$/.test(s)) return true;       // Title Case: "Scheduled Backup"
  return false;
}

/** A file or a line opts out EXPLICITLY, with a reason a reviewer can read:
 *    /* i18n-ignore-file: prompts sent to the model, not shown to a person *\/
 *    // i18n-ignore: CSS value
 *  Never a silent skip — the reason is the review. */
const IGNORE_FILE = /i18n-ignore-file:\s*\S/;
const IGNORE_LINE = /i18n-ignore:\s*\S/;

export function scanLiterals(file: string, source: string): HardcodedText[] {
  if (IGNORE_FILE.test(source)) return [];
  const lines = source.split("\n");
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const out: HardcodedText[] = [];
  const isCodeContext = (node: ts.Node): boolean => {
    for (let p: ts.Node | undefined = node.parent, child: ts.Node = node; p; child = p, p = p.parent) {
      if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isImportTypeNode(p) || ts.isLiteralTypeNode(p) || ts.isExternalModuleReference(p)) return true;
      if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
        const callee = p.expression.getText(sf).replace(/\s+/g, "");
        // Only a DIRECT argument is code (fetch("/api/x"), el.closest(".row")). A literal
        // nested in an object or array passed along is data — events.push({ title: "…" })
        // carries text a person reads.
        if (child === node && (CODE_CALLS.test(callee) || CODE_CALLS.test(callee.split(".").slice(-1)[0] ?? ""))) return true;
        if (((p.arguments ?? []) as readonly ts.Node[]).includes(child)) return false;
      }
      if (ts.isPropertyAssignment(p) && p.initializer === child && CODE_KEYS.test(p.name.getText(sf).replace(/["']/g, ""))) return true;
      if (ts.isPropertyAssignment(p) && p.name === child) return true;
      if (ts.isJsxAttribute(p)) {
        // A literal directly on the attribute is scanSource's job; one nested in an
        // expression (title={saved ? "Saved" : "Save"}) is ours — scanSource never sees it.
        const direct = p.initializer === node || (p.initializer && ts.isJsxExpression(p.initializer) && p.initializer.expression === node);
        if (direct) return true;
        return !TEXT_PROPS.test(p.name.getText(sf));
      }
      if (ts.isExpressionStatement(p) && p.expression === child) return true; // "use client" and other directives
      if (ts.isBinaryExpression(p) && /^(===|!==|==|!=|in|instanceof)$/.test(p.operatorToken.getText(sf))) return true;
      if (ts.isCaseClause(p) || ts.isElementAccessExpression(p) || ts.isEnumMember(p)) return true;
      if (ts.isJsxExpression(p) && ts.isJsxElement(p.parent) && SKIP_TAGS.has(tagName(p.parent.openingElement))) return true;
      if (ts.isBlock(p) || ts.isSourceFile(p)) return false;
    }
    return false;
  };
  const ignored = (node: ts.Node) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
    return IGNORE_LINE.test(lines[line] ?? "") || markerLineAbove(lines[line - 1]);
  };
  const visit = (node: ts.Node) => {
    if (ignored(node)) { ts.forEachChild(node, visit); return; }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && looksLikeProse(node.text) && !isCodeContext(node)) {
      out.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text: node.text.replace(/\s+/g, " ").trim() });
    } else if (ts.isTemplateExpression(node) && !isCodeContext(node)) {
      const text = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(" {…} ");
      if (looksLikeProse(text.replace(/\{…\}/g, "x"))) out.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text: text.replace(/\s+/g, " ").trim() });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

export function scanLiteralTree(root: string): HardcodedText[] {
  const out: HardcodedText[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "__tests__" || name === "node_modules" || name === "i18n") continue;
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(p) && !/\.(test|spec|d)\.tsx?$/.test(p)) out.push(...scanLiterals(path.relative(root, p), readFileSync(p, "utf-8")));
    }
  };
  walk(root);
  return out;
}
