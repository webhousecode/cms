import { describe, it, expect } from "vitest";
import { parseNoteRefs, noteCollections, readPath, resolveNote } from "../option-notes";

/**
 * F180 — a select option's note may show a value from the site's own content.
 *
 * The bug these seal: the platform fee was written into the option LABEL
 * ("Leveret online (30%)") while the real number lived in the consumer's fee
 * calculation. Change one, the other lies, and nothing says so.
 */
describe("F180 option notes", () => {
  const globals = { global: { fees: { digital: 30, attendance: 1, physical: 5 }, empty: "" } };
  const lookup = (c: string, p: string) =>
    readPath((globals as Record<string, unknown>)[c], p);

  it("resolves a placeholder from the site's own global document", () => {
    // Strict equality, not "contains": a contains-check passes on a value that
    // is truncated, doubled, or has the old text still attached to it.
    expect(resolveNote("{{global.fees.digital}}%", lookup)).toBe("30%");
    expect(resolveNote("{{global.fees.attendance}}%", lookup)).toBe("1%");
  });

  it("follows the number, so a changed rate changes the note with no schema edit", () => {
    const before = resolveNote("{{global.fees.digital}}%", lookup);
    globals.global.fees.digital = 25;
    const after = resolveNote("{{global.fees.digital}}%", lookup);
    expect(before).toBe("30%");
    expect(after).toBe("25%");
    globals.global.fees.digital = 30;
  });

  it("omits the whole note when a value cannot be read — never a bare suffix", () => {
    // The correction to the plan-doc: dropping only the placeholder would
    // render "%", which reads as a broken field or a zero rather than an
    // absent one.
    expect(resolveNote("{{global.fees.gift}}%", lookup)).toBeUndefined();
    expect(resolveNote("{{nosuch.a.b}}%", lookup)).toBeUndefined();
    expect(resolveNote("{{global.empty}}%", lookup)).toBeUndefined();
  });

  it("leaves an option without a note completely alone", () => {
    expect(resolveNote(undefined, lookup)).toBeUndefined();
    expect(resolveNote("Gavekort — kode + mail", lookup)).toBeUndefined();
  });

  it("resolves every placeholder in a note, and drops all if one is missing", () => {
    expect(resolveNote("{{global.fees.attendance}}% / {{global.fees.physical}}%", lookup))
      .toBe("1% / 5%");
    expect(resolveNote("{{global.fees.attendance}}% / {{global.fees.nope}}%", lookup))
      .toBeUndefined();
  });

  it("names which collections to read, so nothing is fetched for a plain field", () => {
    expect(noteCollections([undefined, "plain text"])).toEqual([]);
    expect(noteCollections(["{{global.fees.digital}}%", "{{global.fees.physical}}%"]))
      .toEqual(["global"]);
    expect(noteCollections(["{{a.x}}", "{{b.y}}", "{{a.z}}"])).toEqual(["a", "b"]);
  });

  it("parses collection and path apart, tolerating whitespace", () => {
    expect(parseNoteRefs("{{ global.fees.digital }}%")).toEqual([
      { raw: "{{ global.fees.digital }}", collection: "global", path: "fees.digital" },
    ]);
  });

  it("returns undefined at any gap in the path instead of throwing", () => {
    expect(readPath(globals.global, "fees.digital")).toBe(30);
    expect(readPath(globals.global, "fees.nope.deeper")).toBeUndefined();
    expect(readPath(null, "a")).toBeUndefined();
    expect(readPath("a string", "length")).toBeUndefined();
  });
});
