/**
 * F211.2 — user-facing English still written straight into components. The
 * number may only FALL; raise the baseline and this test fails. Done at 0.
 * Lower `HARDCODED_BASELINE` in the same commit that moves text into t().
 */
import { describe, it, expect } from "vitest";
import path from "node:path";
import { scanTree, scanSource } from "@/i18n/scan-hardcoded";

const HARDCODED_BASELINE = 61;

describe("hardcoded UI text ratchet", () => {
  it(`no more than ${HARDCODED_BASELINE} hard-coded texts remain (the number only falls)`, () => {
    const found = scanTree(path.resolve(__dirname, "../.."));
    if (found.length > HARDCODED_BASELINE) {
      console.log(found.slice(0, 40).map((f) => `${f.file}:${f.line} ${f.text}`).join("\n"));
    }
    expect(found.length).toBeLessThanOrEqual(HARDCODED_BASELINE);
  }, 120_000); // parses every .tsx in the admin

  it("the scanner sees text, attributes and toasts — and not t() calls, classes or code", () => {
    const src = `
      export function X() {
        toast.success("Saved");
        toast.error(t("common.failed"));
        return <div className="p-4" data-testid="x-root" title="Open menu">
          Hello there {t("shell.ok")}
          <input placeholder={t("a.b")} aria-label="Search" />
          <code>npm run build</code>
          <span>{count} · 42</span>
        </div>;
      }`;
    const texts = scanSource("x.tsx", src).map((f) => f.text).sort();
    expect(texts).toEqual(["Hello there", "Open menu", "Saved", "Search"]);
  });
});
