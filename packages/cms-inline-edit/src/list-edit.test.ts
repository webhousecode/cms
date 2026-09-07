/**
 * The rule this file exists to hold: the package REFUSES a list it does not
 * understand, rather than writing something plausible into it.
 *
 * Measured on /flagskibe/trail before any code was written — three shapes reach
 * the same path handling, and only the first can take a bare string:
 *
 *   slides.0.blocks.2.items.3     a chip
 *   slides.1.blocks.0.items.0.1   a step [title, description]
 *   slides.1.blocks.1.cols.0      a table column
 *
 * The column is the one worth keeping in mind: it IS a list of strings, so every
 * structural test passes on it — and adding one leaves every row a cell short.
 * That is why the site opts in per list and the package never infers it.
 */
import { describe, it, expect } from "vitest";
import {
  parseListItemPath,
  listKey,
  addListItem,
  removeListItem,
  renumberAfterRemoval,
  sameDocument,
} from "./list-edit";

const doc = () => ({
  slides: [
    { blocks: [{ items: ["Brand guides", "Skabeloner", "Kampagner"] }] },
    { blocks: [{ items: [["Titel", "Tekst"], ["Titel 2", "Tekst 2"]] }] },
  ],
  tags: ["Trail", "AI"],
});

describe("parseListItemPath", () => {
  it("reads the array and the index out of a list-item path", () => {
    expect(parseListItemPath("slides.0.blocks.2.items.3")).toEqual({
      arrayPath: "slides.0.blocks.2.items",
      index: 3,
    });
  });

  it("says no to a field that is not a list item", () => {
    expect(parseListItemPath("slides.0.eyebrow")).toBeNull();
    expect(parseListItemPath("title")).toBeNull();
  });

  it("reads a nested tuple path as the INNER position", () => {
    // `items.0.1` is the description of step 0 — its "list" is the step itself.
    // Nothing here decides it is unsafe; the opt-in does. This only pins that we
    // do not silently read it as element 1 of `items`.
    expect(parseListItemPath("slides.1.blocks.0.items.0.1")).toEqual({
      arrayPath: "slides.1.blocks.0.items.0",
      index: 1,
    });
  });
});

describe("listKey", () => {
  it("separates two lists that share a path tail", () => {
    // A footer and an article can both have `tags` on one page. Keyed on the
    // tail alone, one list's buttons would write into the other's document.
    expect(listKey("platforms", "trail", "tags")).not.toBe(listKey("posts", "trail", "tags"));
  });
});

describe("addListItem", () => {
  it("appends an empty member to a list of strings", () => {
    const d = doc();
    expect(addListItem(d, "slides.0.blocks.0.items")).toBe(3);
    expect(d.slides[0]!.blocks[0]!.items).toEqual([
      "Brand guides",
      "Skabeloner",
      "Kampagner",
      "",
    ]);
  });

  it("REFUSES a list of tuples and leaves it untouched", () => {
    // The negative control. An "" pushed here renders as half a row.
    const d = doc();
    const before = JSON.stringify(d);
    expect(addListItem(d, "slides.1.blocks.0.items")).toBeNull();
    expect(JSON.stringify(d)).toBe(before);
  });

  it("REFUSES a path that is not a list at all", () => {
    const d = doc();
    expect(addListItem(d, "slides.0.blocks.0")).toBeNull();
    expect(addListItem(d, "findes.ikke")).toBeNull();
  });
});

describe("removeListItem", () => {
  it("removes the named member", () => {
    const d = doc();
    expect(removeListItem(d, "tags", 0)).toBe(true);
    expect(d.tags).toEqual(["AI"]);
  });

  it("REFUSES a list of tuples and leaves it untouched", () => {
    const d = doc();
    const before = JSON.stringify(d);
    expect(removeListItem(d, "slides.1.blocks.0.items", 0)).toBe(false);
    expect(JSON.stringify(d)).toBe(before);
  });

  it("REFUSES an index outside the list", () => {
    const d = doc();
    expect(removeListItem(d, "tags", 5)).toBe(false);
    expect(removeListItem(d, "tags", -1)).toBe(false);
    expect(d.tags).toEqual(["Trail", "AI"]);
  });
});

describe("renumberAfterRemoval", () => {
  it("shifts only the members AFTER the one removed", () => {
    const f = ["t.0", "t.1", "t.2", "t.3"];
    expect(renumberAfterRemoval(f, "t", 1)).toEqual(["t.0", "t.1", "t.1", "t.2"]);
    // (the removed element's own node is deleted by the caller; the survivors
    // are 0, 2->1, 3->2)
  });

  it("leaves ANOTHER list's fields alone", () => {
    const f = ["t.0", "t.2", "andet.2"];
    expect(renumberAfterRemoval(f, "t", 1)).toEqual(["t.0", "t.1", "andet.2"]);
  });

  it("leaves non-list fields alone", () => {
    expect(renumberAfterRemoval(["titel", "t.2"], "t", 0)).toEqual(["titel", "t.1"]);
  });
});

describe("sameDocument", () => {
  const a = { collection: "platforms", slug: "trail" };

  it("keeps a removal inside its own document", () => {
    expect(sameDocument(a, { collection: "platforms", slug: "trail" })).toBe(true);
  });

  it("REFUSES to pair two documents that share a path tail", () => {
    // The finding this exists for: renumberAfterRemoval matches on the array
    // path alone, so without this predicate removing a tag from the article
    // would shift the FOOTER's tag indices in the DOM — and the footer's next
    // edit would write one slot over. Nothing on screen would say so.
    expect(sameDocument(a, { collection: "globals", slug: "trail" })).toBe(false);
    expect(sameDocument(a, { collection: "platforms", slug: "lens" })).toBe(false);
  });

  it("does not treat two undeclared documents as the same one", () => {
    // Both undefined compares equal, which is right for a page with a single
    // undeclared document and wrong for two of them — so the caller must supply
    // the dataset, and this pins that undefined is not a wildcard.
    expect(sameDocument({}, { collection: "platforms", slug: "trail" })).toBe(false);
  });
});
