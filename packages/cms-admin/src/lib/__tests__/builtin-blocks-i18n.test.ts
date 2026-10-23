import { describe, it, expect } from "vitest";
import { builtinBlocks } from "@webhouse/cms";
import { localizeBuiltinBlocks } from "../localize-builtin-blocks";
import { getT } from "../../i18n/locale";

/**
 * F211.2 — the built-in blocks' labels follow the admin language; their names,
 * field names and option values (stored in documents) never change.
 */
const da = localizeBuiltinBlocks(builtinBlocks, getT("da"));
const en = localizeBuiltinBlocks(builtinBlocks, getT("en"));

describe("built-in blocks in the admin language", () => {
  it("every built-in block, field and option has a catalog text in BOTH languages", () => {
    // A new built-in block without catalog entries turns this red.
    const missing: string[] = [];
    for (const [lang, t] of [["en", getT("en")], ["da", getT("da")]] as const) {
      for (const b of builtinBlocks) {
        const base = `editor.builtinBlocks.${b.name}`;
        if (t(`${base}.label`) === `${base}.label`) missing.push(`${lang} ${base}.label`);
        for (const f of b.fields ?? []) {
          const k = `${base}.fields.${f.name}.label`;
          if (t(k) === k) missing.push(`${lang} ${k}`);
          for (const o of (f as { options?: { value: string }[] }).options ?? []) {
            const ok = `${base}.fields.${f.name}.options.${o.value}`;
            if (t(ok) === ok) missing.push(`${lang} ${ok}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("English is byte-identical to the package's own labels", () => {
    expect(en.map((b) => b.label)).toEqual(builtinBlocks.map((b) => b.label));
    expect(en.flatMap((b) => b.fields?.map((f) => f.label) ?? [])).toEqual(builtinBlocks.flatMap((b) => b.fields?.map((f) => f.label) ?? []));
  });

  it("Danish labels are Danish", () => {
    const byName = Object.fromEntries(da.map((b) => [b.name, b]));
    expect(byName.columns!.label).toBe("Kolonner");
    expect(byName.image!.label).toBe("Billede");
    expect(byName["image-gallery"]!.label).toBe("Billedgalleri");
  });

  it("CONTROL: names, field names and option values are untouched (stored in documents)", () => {
    expect(da.map((b) => b.name)).toEqual(builtinBlocks.map((b) => b.name));
    expect(da.flatMap((b) => b.fields?.map((f) => `${f.name}:${f.type}`) ?? [])).toEqual(
      builtinBlocks.flatMap((b) => b.fields?.map((f) => `${f.name}:${f.type}`) ?? []),
    );
    const values = (bs: typeof builtinBlocks) => bs.flatMap((b) => b.fields?.flatMap((f) => ((f as { options?: { value: string }[] }).options ?? []).map((o) => o.value)) ?? []);
    expect(values(da)).toEqual(values(builtinBlocks));
  });
});
