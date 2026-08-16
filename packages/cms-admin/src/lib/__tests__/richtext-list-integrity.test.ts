// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";

/**
 * The other door.
 *
 * @broberg/cms-inline-edit 0.4.21 fixed a silent content-corruption bug: a list
 * item orphaned out of its <ul> lost its "- " marker on save, so a public page
 * showed the first qualification as a loose paragraph (sanneandersen, 13-item
 * CV list, 2026-08-16). That editor walks raw contenteditable DOM, where the
 * browser is free to orphan an <li>.
 *
 * cms-admin's richtext field is a DIFFERENT editor (TipTap/ProseMirror +
 * tiptap-markdown) and is now live on the very same field, so the sanne session
 * rightly asked whether the fix closed one of two doors. Structurally it should
 * be immune — ProseMirror serialises from a schema-validated document model, not
 * from DOM, and StarterKit's schema has no place for a listItem outside a list.
 * That is reasoning, not measurement. This measures it.
 */

const bulletLines = (md: string) => md.split("\n").filter((l) => /^[-*] /.test(l));

function roundTrip(content: string): string {
  const editor = new Editor({
    extensions: [StarterKit, Markdown.configure({ html: true })],
    content,
  });
  const md = (editor.storage as unknown as { markdown: { getMarkdown(): string } }).markdown.getMarkdown();
  editor.destroy();
  return md;
}

describe("cms-admin richtext (TipTap) — list integrity", () => {
  it("keeps every bullet through a markdown round-trip", () => {
    const md = [
      "Som zoneterapeut og komplementær behandler …",
      "",
      "## Min baggrund",
      "",
      "- RAB zoneterapeut og behandler med egen klinik siden 2000",
      "- Indehaver og skoleleder, Dansk Institut for Zoneterapi",
      "- Udbyder af RAB-kurser",
      "- Psykoterapeut, individuel terapi",
    ].join("\n");

    const out = roundTrip(md);

    expect(bulletLines(out)).toHaveLength(4);
    expect(out).toMatch(/^[-*] RAB zoneterapeut og behandler med egen klinik siden 2000$/m);
  });

  it("normalises an orphaned <li> back into the list instead of dropping its marker", () => {
    // The exact DOM shape that corrupted the live page through the other editor.
    const html =
      "<p>intro</p><h2>Min baggrund</h2>" +
      "<li>RAB zoneterapeut og behandler med egen klinik siden 2000</li>" +
      "<ul><li>Indehaver og skoleleder</li><li>Udbyder af RAB-kurser</li></ul>";

    const out = roundTrip(html);

    expect(bulletLines(out)).toHaveLength(3);
    expect(out).toContain("RAB zoneterapeut og behandler med egen klinik siden 2000");
    // The first item must NOT come back as a loose paragraph.
    expect(out).not.toMatch(/^RAB zoneterapeut/m);
  });

  it("keeps a numbered list numbered", () => {
    const out = roundTrip("1. one\n2. two\n3. three");
    expect(out).toMatch(/1\. one/);
    expect(out).toMatch(/three/);
  });
});
