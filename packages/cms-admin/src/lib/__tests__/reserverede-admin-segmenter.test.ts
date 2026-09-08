/**
 * F146 — HVER admin-rute skal stå i RESERVED_ADMIN_SEGMENTS.
 *
 * Christian, 8/9: «du har komplet smadret hele CMS brugerfladen - der kan ikke
 * skiftes modul når du først har valgt et så ændres der ikke routes længere».
 *
 * ÅRSAGEN, og den er værd at forstå én gang for alle: `/admin/{noget}` læses
 * som `/admin/{SITE-SLUG}`. Står `noget` ikke på listen over reserverede
 * segmenter, tror admin'en at man er inde på et SITE ved navn «noget» — og så
 * bliver hvert eneste sidebar-link til `/admin/noget/agents`,
 * `/admin/noget/media` … Modulet skifter aldrig igen.
 *
 * Jeg lagde `/admin/podcast` ind samme dag uden at føje den til listen. Fra det
 * øjeblik han klikkede på Podcast, var hele venstremenuen død. Ingen fejl,
 * ingen rød log — bare en URL der ikke ændrer sig.
 *
 * `inline-edit` manglede også, og HAVDE gjort det længe.
 *
 * DERFOR ER DENNE PRØVE IKKE EN LISTE JEG SKREV. Den læser rute-mapperne på
 * disken. Næste gang nogen lægger en ny skærm ind, bliver den rød FØR den når
 * ejerens skærm — det er den eneste form der virker, for en håndholdt liste
 * bliver glemt præcis når den betyder mest.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RESERVED_ADMIN_SEGMENTS, parseSiteSlugPath } from "../site-slug-routing";

const ROD = fileURLToPath(new URL("../../app/admin", import.meta.url));

/** Alle STATISKE rute-segmenter direkte under /admin — grupper «(auth)» foldes
 *  ud, og dynamiske «[collection]» springes over: de ER slug-pladsen. */
function ruteSegmenter(): string[] {
  const ud: string[] = [];
  const gaa = (dir: string) => {
    for (const navn of readdirSync(dir, { withFileTypes: true })) {
      if (!navn.isDirectory()) continue;
      if (navn.name.startsWith("[")) continue;
      // En rute-GRUPPE «(workspace)» er ikke et URL-segment — kig indeni.
      if (navn.name.startsWith("(")) { gaa(`${dir}/${navn.name}`); continue; }
      ud.push(navn.name);
    }
  };
  gaa(ROD);
  return [...new Set(ud)];
}

describe("hvert admin-segment er reserveret", () => {
  it("rute-mapperne kan læses (ellers måler resten ingenting)", () => {
    expect(existsSync(ROD)).toBe(true);
    expect(ruteSegmenter().length).toBeGreaterThan(20);
  });

  it("INGEN rute mangler på listen", () => {
    const mangler = ruteSegmenter().filter((s) => !RESERVED_ADMIN_SEGMENTS.has(s));
    expect(
      mangler,
      `${mangler.join(", ")} står ikke i RESERVED_ADMIN_SEGMENTS. ` +
        `Så læses /admin/${mangler[0] ?? "x"} som et SITE, og hele venstremenuen ` +
        `holder op med at skifte modul.`,
    ).toEqual([]);
  });

  it("de to der faktisk manglede, står der nu", () => {
    // Den konkrete melding, holdt fast ved siden af den generelle regel: en
    // regel der læser disken ville også være grøn hvis begge ruter forsvandt.
    expect(RESERVED_ADMIN_SEGMENTS.has("podcast")).toBe(true);
    expect(RESERVED_ADMIN_SEGMENTS.has("inline-edit")).toBe(true);
  });

  it("KONSEKVENSEN: /admin/podcast er IKKE et site", () => {
    // Det er her fejlen viste sig. Uden reservationen svarer den
    // { slug: "podcast" } — og så bliver hvert link /admin/podcast/<modul>.
    expect(parseSiteSlugPath("/admin/podcast")).toBeNull();
    expect(parseSiteSlugPath("/admin/podcast/sponsorer")).toBeNull();
    expect(parseSiteSlugPath("/admin/inline-edit/connect")).toBeNull();
  });

  it("NEGATIV KONTROL: et rigtigt site-slug bliver stadig genkendt", () => {
    // Uden denne ville en parseSiteSlugPath der ALTID svarer null bestå
    // prøven ovenfor — og så ville F146's hele URL-routing være død.
    expect(parseSiteSlugPath("/admin/broberg-ai/agents")).toEqual({
      slug: "broberg-ai",
      rest: "/admin/agents",
    });
    expect(parseSiteSlugPath("/admin/broberg-ai")).toEqual({
      slug: "broberg-ai",
      rest: "/admin",
    });
  });
});
