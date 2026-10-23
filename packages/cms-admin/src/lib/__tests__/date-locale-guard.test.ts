import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * F211.2 — every date, time and number a person reads follows the ADMIN
 * language. A bare `toLocaleDateString()` formats in the BROWSER's language,
 * a literal `"en-GB"` in a fixed one; both showed "23 Oct 2026" on a Danish
 * admin. Format through lib/format-locale.ts (useFormat() / formatDate(v, locale)).
 *
 * Fails on any toLocaleDateString / toLocaleTimeString / toLocaleString /
 * new Intl.DateTimeFormat|RelativeTimeFormat|NumberFormat whose first argument
 * is missing, `undefined`, or a string-literal locale — unless the line or the
 * line above carries `i18n-ignore: <reason>` (site content, mails, logs, file
 * names, machine formats).
 */

const SRC = join(process.cwd(), "src");

const CALL = /(\.toLocale(?:Date|Time)?String|new\s+Intl\.(?:DateTimeFormat|RelativeTimeFormat|NumberFormat))\s*\(/g;
const MARKER = /i18n-ignore:\s*\S/;

/** Offending call sites in one file's source: { line, text }. */
function findBareLocaleCalls(source: string): Array<{ line: number; text: string }> {
  const lines = source.split("\n");
  const out: Array<{ line: number; text: string }> = [];
  for (const m of source.matchAll(CALL)) {
    const after = source.slice(m.index! + m[0].length).replace(/^\s+/, "");
    const bad =
      after.startsWith(")") ||
      /^undefined\b/.test(after) ||
      /^(["'`])(?:(?!\1)[^\\]|\\.)*\1\s*[,)]/.test(after);
    if (!bad) continue;
    const lineNo = source.slice(0, m.index).split("\n").length; // 1-based
    const here = lines[lineNo - 1] ?? "";
    const above = lines[lineNo - 2] ?? "";
    if (MARKER.test(here) || MARKER.test(above)) continue;
    out.push({ line: lineNo, text: here.trim() });
  }
  return out;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(p, acc);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      acc.push(p);
    }
  }
  return acc;
}

describe("F211.2 — date/number formatting follows the admin language", () => {
  it("the detector flags bare, undefined and literal locales, and honours i18n-ignore", () => {
    expect(findBareLocaleCalls("d.toLocaleDateString()")).toHaveLength(1);
    expect(findBareLocaleCalls("d.toLocaleString(undefined, { month: 'short' })")).toHaveLength(1);
    expect(findBareLocaleCalls('d.toLocaleTimeString("da-DK", { hour: "2-digit" })')).toHaveLength(1);
    expect(findBareLocaleCalls('new Intl.NumberFormat("en-US")')).toHaveLength(1);
    expect(findBareLocaleCalls("new Intl.DateTimeFormat(\n  'en-GB',\n  {})")).toHaveLength(1);
    expect(findBareLocaleCalls("d.toLocaleDateString(formatTag(locale), opts)")).toHaveLength(0);
    expect(findBareLocaleCalls('new Intl.DateTimeFormat(lang === "da" ? "da-DK" : "en-GB")')).toHaveLength(0);
    expect(findBareLocaleCalls('d.toLocaleString("da-DK") // i18n-ignore: git commit message')).toHaveLength(0);
    expect(findBareLocaleCalls('// i18n-ignore: file name\nd.toLocaleString("da-DK")')).toHaveLength(0);
    expect(findBareLocaleCalls('// i18n-ignore:\nd.toLocaleString("da-DK")')).toHaveLength(1); // a reason is required
  });

  it("no source file formats a date/time/number in the browser's or a hardcoded locale", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      for (const hit of findBareLocaleCalls(readFileSync(file, "utf8"))) {
        offenders.push(`${relative(SRC, file)}:${hit.line}  ${hit.text}`);
      }
    }
    expect(offenders, `Use useFormat()/formatDate(v, locale) from @/lib/format-locale, or mark the line "// i18n-ignore: <reason>":\n${offenders.join("\n")}`).toEqual([]);
  });
});
