import { describe, it, expect } from "vitest";

/**
 * Translating a document must never overwrite the document it is translating.
 *
 * INCIDENT, webhouse-site, 2026-08-24. Translating `globals/site` to Danish
 * returned an AI slug of "site" — because "site" is "site" in Danish. The
 * route then looked for an existing translation by slug, found the SOURCE
 * (same slug), and updated it in place:
 *
 *   before   slug=site locale=en  siteTitle="WebHouse — Intelligent Software Since 1995"
 *   after    slug=site locale=da  siteTitle="WebHouse — Intelligent Software siden 1995"
 *
 * One document, HTTP 200, response {"action":"updated"}, no error anywhere. The
 * English site title, footer tagline and every nav label were gone, and the
 * only reason it was caught is that the run was tried on ONE document first.
 * Restored from a backup taken minutes earlier.
 *
 * Any word that survives translation triggers it: site, cms, demo, blog,
 * design, service, plus every brand and proper noun. It was waiting on a lot
 * more than one document.
 *
 * Two independent guards, because this write is destructive:
 *   1. a translated slug identical to the source slug falls back to `-<locale>`
 *   2. the source can never match as its own "existing translation"
 */

/** The slug rule, exactly as the route applies it. */
function resolveTranslationSlug(aiSlug: string | undefined, sourceSlug: string, targetLocale: string): string {
  let s = aiSlug
    ? aiSlug.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "")
    : `${sourceSlug}-${targetLocale}`;
  if (s === sourceSlug) s = `${sourceSlug}-${targetLocale}`;
  return s;
}

type Doc = { id: string; slug: string; locale?: string; translationGroup?: string };

/** The lookup rule, exactly as the route applies it. */
function findExistingTranslation(
  allDocs: Doc[], translationSlug: string, groupId: string, targetLocale: string, sourceId: string,
): Doc | undefined {
  return (
    allDocs.find(d => d.slug === translationSlug && d.id !== sourceId) ||
    allDocs.find(d => d.translationGroup === groupId && d.locale === targetLocale && d.id !== sourceId)
  );
}

describe("translation must not cannibalise its source", () => {
  const source: Doc = { id: "src-1", slug: "site", locale: "en", translationGroup: "g1" };

  it("gives the twin its own slug when the word is the same in both languages", () => {
    // This is the exact input that destroyed the English globals.
    expect(resolveTranslationSlug("site", "site", "da")).toBe("site-da");
  });

  it("keeps a genuinely translated slug", () => {
    expect(resolveTranslationSlug("om-os", "about", "da")).toBe("om-os");
  });

  it("falls back when the AI returns no slug at all", () => {
    expect(resolveTranslationSlug(undefined, "about", "da")).toBe("about-da");
  });

  it("does not find the SOURCE as its own existing translation", () => {
    const found = findExistingTranslation([source], "site", "g1", "da", source.id);
    expect(found).toBeUndefined(); // before the fix this returned `source`
  });

  it("still finds a real twin by slug", () => {
    const twin: Doc = { id: "twin-1", slug: "site-da", locale: "da", translationGroup: "g1" };
    expect(findExistingTranslation([source, twin], "site-da", "g1", "da", source.id)?.id).toBe("twin-1");
  });

  it("still finds a real twin by translation group when its slug was renamed", () => {
    const twin: Doc = { id: "twin-1", slug: "helt-andet-navn", locale: "da", translationGroup: "g1" };
    expect(findExistingTranslation([source, twin], "site-da", "g1", "da", source.id)?.id).toBe("twin-1");
  });

  it("the two guards are independent — either alone stops the incident", () => {
    // Guard 2 removed: the slug guard alone still spares the source.
    const slugOnly = resolveTranslationSlug("site", "site", "da");
    expect([source].find(d => d.slug === slugOnly)).toBeUndefined();
    // Guard 1 removed: the id check alone still spares the source.
    expect(findExistingTranslation([source], "site", "g1", "da", source.id)).toBeUndefined();
  });
});
