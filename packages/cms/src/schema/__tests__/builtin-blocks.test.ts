/**
 * Snapshot test for builtin block definitions.
 *
 * PURPOSE: Prevent accidental changes to block field names, types, or structure.
 * These blocks have content stored in production JSON files. Changing a field
 * name (e.g. "body" → "content") or type (e.g. "richtext" → "text") silently
 * breaks ALL existing content that uses that block.
 *
 * IF THIS TEST FAILS:
 * 1. You changed a builtin block definition
 * 2. Check if ANY content/*.json files use this block (grep for "_block":"<name>")
 * 3. If yes → your change will break existing content. Revert it.
 * 4. If adding a NEW block → update the snapshot: `npx vitest run --update`
 * 5. If intentionally migrating → write a content migration script first
 */
import { describe, it, expect } from "vitest";
import { builtinBlocks } from "../builtin-blocks.js";

describe("builtin-blocks", () => {
  // Snapshot of the full block definitions — catches ANY change
  it("block definitions match snapshot", () => {
    expect(builtinBlocks).toMatchSnapshot();
  });

  // Explicit contract tests for field names and types that content depends on
  // These are the most critical — changing these breaks stored JSON
  it("text block: body field is richtext", () => {
    const text = builtinBlocks.find((b) => b.name === "text");
    expect(text).toBeDefined();
    const bodyField = text!.fields.find((f) => f.name === "body");
    expect(bodyField).toBeDefined();
    expect(bodyField!.type).toBe("richtext");
  });

  it("video block: src field is video", () => {
    const video = builtinBlocks.find((b) => b.name === "video");
    expect(video).toBeDefined();
    expect(video!.fields.find((f) => f.name === "src")?.type).toBe("video");
    expect(video!.fields.find((f) => f.name === "caption")?.type).toBe("text");
  });

  it("audio block: src field is audio", () => {
    const audio = builtinBlocks.find((b) => b.name === "audio");
    expect(audio).toBeDefined();
    expect(audio!.fields.find((f) => f.name === "src")?.type).toBe("audio");
  });

  it("file block: src field is file", () => {
    const file = builtinBlocks.find((b) => b.name === "file");
    expect(file).toBeDefined();
    expect(file!.fields.find((f) => f.name === "src")?.type).toBe("file");
    expect(file!.fields.find((f) => f.name === "filename")?.type).toBe("text");
  });

  it("interactive block: interactiveId field is interactive", () => {
    const int = builtinBlocks.find((b) => b.name === "interactive");
    expect(int).toBeDefined();
    expect(int!.fields.find((f) => f.name === "interactiveId")?.type).toBe("interactive");
  });

  it("image block: src field is image", () => {
    const image = builtinBlocks.find((b) => b.name === "image");
    expect(image).toBeDefined();
    expect(image!.fields.find((f) => f.name === "src")?.type).toBe("image");
    expect(image!.fields.find((f) => f.name === "alt")?.type).toBe("text");
  });

  it("image-gallery block: images field is image-gallery", () => {
    const gallery = builtinBlocks.find((b) => b.name === "image-gallery");
    expect(gallery).toBeDefined();
    expect(gallery!.fields.find((f) => f.name === "images")?.type).toBe("image-gallery");
  });

  it("richtext block: content field is richtext", () => {
    const rt = builtinBlocks.find((b) => b.name === "richtext");
    expect(rt).toBeDefined();
    expect(rt!.fields.find((f) => f.name === "content")?.type).toBe("richtext");
  });

  it("columns block: columns field is column-slots", () => {
    const cols = builtinBlocks.find((b) => b.name === "columns");
    expect(cols).toBeDefined();
    expect(cols!.fields.find((f) => f.name === "columns")?.type).toBe("column-slots");
    expect(cols!.fields.find((f) => f.name === "layout")?.type).toBe("select");
  });

  it("htmldoc block: content field is htmldoc", () => {
    const html = builtinBlocks.find((b) => b.name === "htmldoc");
    expect(html).toBeDefined();
    expect(html!.fields.find((f) => f.name === "content")?.type).toBe("htmldoc");
  });

  it("textarea block: content field is textarea", () => {
    const ta = builtinBlocks.find((b) => b.name === "textarea");
    expect(ta).toBeDefined();
    expect(ta!.fields.find((f) => f.name === "content")?.type).toBe("textarea");
  });

  // Guard: no block should have been accidentally removed
  it("all expected builtin blocks exist", () => {
    const names = builtinBlocks.map((b) => b.name);
    expect(names).toContain("columns");
    expect(names).toContain("video");
    expect(names).toContain("audio");
    expect(names).toContain("file");
    expect(names).toContain("interactive");
    expect(names).toContain("text");
    expect(names).toContain("textarea");
    expect(names).toContain("richtext");
    expect(names).toContain("image");
    expect(names).toContain("image-gallery");
    expect(names).toContain("htmldoc");
  });
});
