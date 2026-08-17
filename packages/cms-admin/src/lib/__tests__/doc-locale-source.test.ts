import { describe, it, expect } from "vitest";
import { getDocLocale } from "../locale";

/**
 * WHERE a document's locale lives.
 *
 * It is a DOCUMENT field, a sibling of slug/status/translationGroup — not a
 * field inside `data`. Four places read `doc.data.locale`, which is undefined
 * on every document ever stored, so they all silently fell back to the site
 * default.
 *
 * Measured on sanneandersen.dk (2026-08-17), a bilingual da/en site:
 *
 *   sanne-special-treatment    doc.locale = "en"   data.locale = undefined
 *   sanne-special-behandling   doc.locale = "da"   data.locale = undefined
 *
 * ...20 of 20 treatments, 18 of 18 vidensbank, 36 of 36 sider-content, 11 of 11
 * school-courses. Every one carried a correct doc.locale and an absent
 * data.locale.
 *
 * The consequence was invisible rather than loud: bulk SEO optimisation treated
 * the whole site as Danish, so the English treatment page was given the Danish
 * meta title "Sanne's Anti-Stress Behandling – Effektiv Stresshåndtering" and
 * five Danish keywords. Nothing errored. The page just quietly stopped being
 * findable in the language it is written in.
 */

/** The shape the CMS actually returns — locale beside slug, never inside data. */
const doc = (locale: string | undefined) => ({
  slug: "sanne-special-treatment",
  status: "published",
  locale,
  translationGroup: "sanne-special",
  data: { title: "Sanne's anti-stress treatment" } as Record<string, unknown>,
});

describe("document locale", () => {
  it("comes from the document, not from data", () => {
    expect(getDocLocale(doc("en"), "da")).toBe("en");
  });

  it("does NOT come from data.locale — reading there is the bug", () => {
    const d = doc("en");
    expect((d.data as { locale?: string }).locale).toBeUndefined();
    // The old expression: (doc.data.locale as string) || siteDefault
    const oldWay = (d.data as { locale?: string }).locale || "da";
    expect(oldWay).toBe("da"); // wrong language for an English page
    expect(getDocLocale(d, "da")).toBe("en"); // right one
  });

  it("falls back to the site default only when the document really has none", () => {
    expect(getDocLocale(doc(undefined), "da")).toBe("da");
  });

  it("falls back to en when the site declares no default either", () => {
    expect(getDocLocale(doc(undefined), undefined)).toBe("en");
  });

  it("keeps the default-locale document on the default locale", () => {
    expect(getDocLocale(doc("da"), "da")).toBe("da");
  });
});
