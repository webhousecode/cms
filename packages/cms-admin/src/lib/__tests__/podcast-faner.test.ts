/**
 * F191.8 — podcast er ÉT modul med faner, ikke fire ruter.
 *
 * Christian, 8/9: «Det Podcast modul åbner faner som andre skifter undertøj
 * […] jeg famler rundt i det».
 *
 * Det denne prøve findes for er den STILLE regression: at nogen senere flytter
 * en fane tilbage til sin egen rute, eller sletter de to gamle mapper. Den
 * sidste er den værste — /admin/podcast/sponsorer ville så blive fanget af
 * [slug] og vise «afsnittet findes ikke». En forkert URL der ligner manglende
 * data er svær at kende fra en rigtig fejl.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { laesFane, FANER } from "../../components/podcast-tabs";

const sti = (f: string) => fileURLToPath(new URL(f, import.meta.url));
const KODE = (f: string) => readFileSync(sti(f), "utf8");
const UDEN_KOMMENTAR = (f: string) =>
  KODE(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const FANE_FILER = [
  "../../components/podcast/afsnit-fane.tsx",
  "../../components/podcast/reklamer-fane.tsx",
  "../../components/podcast/udtale-fane.tsx",
];

describe("fanevalget kommer fra URL'en", () => {
  it("de tre faner Christian bad om", () => {
    expect([...FANER]).toEqual(["afsnit", "reklamer", "udtale"]);
  });

  it("hver fane kan læses tilbage fra sin egen værdi", () => {
    for (const f of FANER) expect(laesFane(f)).toBe(f);
  });

  it("en ukendt eller manglende ?fane= lander på den første — ikke på en fejlside", () => {
    expect(laesFane(null)).toBe("afsnit");
    expect(laesFane(undefined)).toBe("afsnit");
    expect(laesFane("")).toBe("afsnit");
    expect(laesFane("sponsorer")).toBe("afsnit");
  });

  it("KONTROL: den svarer ikke bare «afsnit» på alt", () => {
    // Uden denne ville en `return "afsnit"` bestå hele blokken ovenfor på nær
    // én linje — og præcis den fejl ville se ud som om fanerne virker.
    expect(laesFane("udtale")).not.toBe("afsnit");
  });
});

describe("de gamle ruter svarer stadig", () => {
  for (const [mappe, fane] of [["sponsorer", "reklamer"], ["udtale", "udtale"]] as const) {
    it(`/admin/podcast/${mappe} findes stadig og sender til ?fane=${fane}`, () => {
      const f = `../../app/admin/(workspace)/podcast/${mappe}/page.tsx`;
      // Findes filen ikke, fanger [slug] stien. Derfor tjekkes den FØR indholdet.
      expect(existsSync(sti(f)), `${mappe}/page.tsx er slettet — [slug] fanger nu stien`).toBe(true);
      expect(UDEN_KOMMENTAR(f)).toContain(`redirect("/admin/podcast?fane=${fane}")`);
    });
  }
});

describe("fanerne er faner, ikke sider", () => {
  it("ingen fane har sin egen ActionBar — den hører til skallen", () => {
    for (const f of FANE_FILER) expect(UDEN_KOMMENTAR(f), f).not.toContain("ActionBar");
  });

  it("ingen fane linker til en af de gamle ruter", () => {
    for (const f of FANE_FILER) {
      expect(UDEN_KOMMENTAR(f), f).not.toContain("/admin/podcast/sponsorer");
      expect(UDEN_KOMMENTAR(f), f).not.toContain("/admin/podcast/udtale");
    }
  });

  it("skallen monterer alle tre", () => {
    const k = UDEN_KOMMENTAR("../../components/podcast-tabs.tsx");
    for (const n of ["AfsnitFane", "ReklamerFane", "UdtaleFane"]) expect(k).toContain(`<${n} />`);
  });

  it("hver fane-knap har et testid Lens kan klikke på", () => {
    const k = KODE("../../components/podcast-tabs.tsx");
    expect(k).toContain("data-testid={`podcast-fane-${f.id}`}");
  });

  it("KONTROL: filerne er der og har indhold", () => {
    // Uden denne består «not.toContain»-prøverne ovenfor på en tom fil.
    for (const f of FANE_FILER) expect(KODE(f).length, f).toBeGreaterThan(2000);
  });
});
