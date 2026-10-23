/**
 * F211.2 — user-facing English still written straight into components. The
 * number may only FALL; raise the baseline and this test fails. Done at 0.
 * Lower `HARDCODED_BASELINE` in the same commit that moves text into t().
 */
import { describe, it, expect } from "vitest";
import path from "node:path";
import { scanTree, scanSource, scanLiteralTree, scanLiterals } from "@/i18n/scan-hardcoded";

const HARDCODED_BASELINE = 0;
/** F211.2 round 2 — prose literals outside t() in ALL of src (.ts + .tsx).
 *  Owner: «ALLE tekster skal kunne sprogversioneres». Only falls. */
const LITERAL_BASELINE = 0;

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

  it(`no more than ${LITERAL_BASELINE} prose literals outside t() remain anywhere in src`, () => {
    const found = scanLiteralTree(path.resolve(__dirname, "../.."));
    if (found.length > LITERAL_BASELINE) {
      console.log(found.slice(0, 40).map((f) => `${f.file}:${f.line} ${f.text}`).join("\n"));
    }
    expect(found.length).toBeLessThanOrEqual(LITERAL_BASELINE);
  }, 300_000);

  it("the literal scanner sees text in tables, states and nested props — and not code", () => {
    const src = `
      const LABELS = { draft: "Ready to publish" };
      export function X({ a, events }) {
        events.push({ title: "Scheduled Backup", subtitle: a ? "Daily backup" : "Weekly backup" });
        fetch("/api/x", { method: "POST" });
        if (a === "Some value") return null;
        const busy = a ? "Saving…" : t("k");
        return <button title={a ? "Remove from favorites" : "Add to favorites"} className={a ? "flex gap-2" : "p-4"}>{busy}</button>;
      }`;
    expect(scanLiterals("x.tsx", src).map((f) => f.text).sort()).toEqual(
      ["Add to favorites", "Daily backup", "Ready to publish", "Remove from favorites", "Saving…", "Scheduled Backup", "Weekly backup"],
    );
  });

  it("an opt-out needs a reason, and a reason silences exactly that line", () => {
    const src = `const a = "Shown to people";\nconst b = "Model prompt text"; // i18n-ignore: model prompt\nconst c = "Bare marker"; // i18n-ignore:`;
    expect(scanLiterals("x.ts", src).map((f) => f.text)).toEqual(["Shown to people", "Bare marker"]);
    expect(scanLiterals("y.ts", `/* i18n-ignore-file: prompts for the model */\nconst a = "Hello there";`)).toEqual([]);
  });

  it("a template is judged as written: a key stays a key, a sentence with a value stays a sentence", () => {
    const src = "const a = `editor.blocks.${name}.label`;\nconst b = `${base}.fields.${f}`;\nconst c = `Published · ${what} · ${when}`;\nconst d = `Saved ${n} documents`;";
    expect(scanLiterals("x.ts", src).map((f) => f.text)).toEqual(["Published · {…} · {…}", "Saved {…} documents"]);
  });
});
