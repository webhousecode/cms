/**
 * F189.5 — API-fladen: hvem må, hvorfra, og hvad.
 *
 * Den bærende prøve er den der går HVER rute igennem. Et permission-tjek der
 * mangler ét sted er præcis det sted der bliver brugt — og det opdages ikke,
 * fordi ruten svarer 200 som den skal.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PODCAST_PERMISSIONS } from "../podcast/api";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../permissions-shared";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const RUTE_ROD = path.join(PKG_ROOT, "src/app/api/podcast");

function alleRuter(dir = RUTE_ROD, ud: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) alleRuter(p, ud);
    else if (e.name === "route.ts") ud.push(p);
  }
  return ud;
}
const ruter = alleRuter();
const kort = (p: string) => p.slice(RUTE_ROD.length + 1) || "route.ts";

describe("tilladelserne findes og har den rigtige vægt", () => {
  it("alle tre er erklæret i permission-systemet", () => {
    for (const p of Object.values(PODCAST_PERMISSIONS)) {
      expect(Object.keys(PERMISSIONS), p).toContain(p);
    }
  });

  it("en REDAKTØR må læse og skrive", () => {
    expect(ROLE_PERMISSIONS.editor).toContain("podcast.read");
    expect(ROLE_PERMISSIONS.editor).toContain("podcast.edit");
  });

  it("men en redaktør må IKKE bruge penge", () => {
    // Den vigtigste linje i filen. `podcast.record` er sin egen tilladelse
    // netop for at den forskel kan udtrykkes — var den foldet ind i
    // podcast.edit, ville enhver der må rette en tekst kunne bruge $1,48 pr.
    // tryk af ejerens penge.
    expect(ROLE_PERMISSIONS.editor).not.toContain("podcast.record");
  });

  it("en VIEWER må ingen af delene", () => {
    for (const p of Object.values(PODCAST_PERMISSIONS)) {
      expect(ROLE_PERMISSIONS.viewer ?? [], p).not.toContain(p);
    }
  });

  it("tilladelsen der koster penge SIGER det i sin egen beskrivelse", () => {
    expect(PERMISSIONS["podcast.record"]).toMatch(/MONEY|penge/i);
  });
});

describe("HVER rute er gated — ikke de fleste", () => {
  it("der er ruter at prøve", () => {
    expect(ruter.length).toBeGreaterThanOrEqual(6);
  });

  for (const r of ruter) {
    it(`${kort(r)} kræver en tilladelse i hver handler`, () => {
      const s = fs.readFileSync(r, "utf-8");
      const handlere = s.match(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g) ?? [];
      expect(handlere.length, "ingen handlere fundet").toBeGreaterThan(0);
      // Ét kald pr. handler. Færre = en handler uden gate.
      const gates = s.match(/await kraevTilladelse\(/g) ?? [];
      expect(gates.length, `${handlere.length} handler(e), ${gates.length} gate(s)`).toBe(
        handlere.length,
      );
    });

    it(`${kort(r)} RETURNERER afvisningen`, () => {
      // Et tjek hvis resultat ikke bruges, er ingen spærre.
      const s = fs.readFileSync(r, "utf-8");
      expect(s).toMatch(/if \(afvist\) return afvist\.svar;/);
    });

    it(`${kort(r)} svarer på preflight, så CORS virker`, () => {
      expect(fs.readFileSync(r, "utf-8")).toMatch(/export const OPTIONS = preflight/);
    });
  }
});

describe("den dyre rute", () => {
  const rec = fs.readFileSync(path.join(RUTE_ROD, "[slug]/record/route.ts"), "utf-8");

  it("bruger podcast.record — ikke .edit", () => {
    expect(rec).toContain("PODCAST_PERMISSIONS.record");
    expect(rec).not.toContain("PODCAST_PERMISSIONS.edit");
  });

  it("lader motoren eje godkendelses-spærren", () => {
    // Ligger spærren i ruten, rammer et kald udenom den ikke reglen. Den bor i
    // record.ts's maaIndspilles() netop derfor.
    expect(rec).not.toContain("maaIndspilles");
    expect(rec).toContain("indspil(");
  });
});

describe("den fælles halvdel", () => {
  const api = fs.readFileSync(path.join(PKG_ROOT, "src/lib/podcast/api.ts"), "utf-8");

  it("bruger den SAMME verifyToken som det almindelige admin-login", () => {
    expect(api).toMatch(/import \{ verifyToken.*\} from "@\/lib\/auth"/);
  });

  it("accepterer BÅDE Bearer og cookie — samme verifikation", () => {
    expect(api).toContain('req.headers.get("authorization")');
    expect(api).toContain('req.cookies.get("cms-session")');
    // Én verifikation, ikke to stier: samme funktion for begge.
    expect((api.match(/verifyToken\(/g) ?? []).length).toBe(2);
  });

  it("afviser en read-only Lens-session på alt andet end læsning", () => {
    expect(api).toMatch(/kalder\.lens === true && kalder\.lensWrite !== true/);
  });

  it("CORS bruger sitets EGNE adresser, ikke previewSiteUrl alene", () => {
    expect(api).toContain("siteOriginsWithSiblings");
  });

  it("et FREMMED origin får ingen Allow-Origin-header", () => {
    // originAllowed er porten; headeren sættes kun når den siger ja.
    expect(api).toMatch(/if \(originAllowed\(origin, allowed\)\) headers\["Access-Control-Allow-Origin"\]/);
  });
});
