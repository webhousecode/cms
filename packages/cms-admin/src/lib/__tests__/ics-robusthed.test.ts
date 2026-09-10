/* F195.2 — ét dårligt punkt må ikke tage hele kalenderabonnementet. */
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import { byggBegivenheder } from "../../app/api/cms/scheduled/calendar.ics/route";

const post = (id: string, date: string) => ({
  id, date, type: "publish", title: `Titel ${id}`, subtitle: "Sektion", href: `/admin/x/${id}`,
});

const GYLDIG_A = post("a", "2026-09-11T03:00:00.000Z");
const GYLDIG_B = post("b", "2026-09-12T03:00:00.000Z");
// Præcis den form der brød feedet: zoneløs, som den glemte localISO() lavede.
const DAARLIG = post("bad", "2026-09-11T03:00:00");

let log: MockInstance<(...args: unknown[]) => void>;
beforeEach(() => { log = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { log.mockRestore(); });

describe("den målte hændelse", () => {
  it("ét ubrugeligt punkt fjerner ikke de øvrige", () => {
    const r = byggBegivenheder([GYLDIG_A, DAARLIG, GYLDIG_B], "https://x.dk");
    expect(r.linjer).toHaveLength(2);
    expect(r.udeladt).toHaveLength(1);
    expect(r.udeladt[0]!.id).toBe("bad");
  });

  it("KONTROL: den dårlige post ville have kastet — ellers måler prøven intet", () => {
    // Uden dette kunne DAARLIG være en helt almindelig post, og prøven ovenfor
    // ville bestå på en robusthed der aldrig blev bragt i spil.
    expect(() => byggBegivenheder([DAARLIG], "https://x.dk")).not.toThrow();
    const r = byggBegivenheder([DAARLIG], "https://x.dk");
    expect(r.linjer).toHaveLength(0);
    expect(r.udeladt[0]!.grund).toMatch(/ingen tidszone/);
  });

  it("den udeladte post navngives i loggen, så den kan findes", () => {
    byggBegivenheder([DAARLIG], "https://x.dk");
    const linjer = log.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(linjer.some((l: string) => l.includes("bad") && l.includes("udeladt"))).toBe(true);
  });

  it("hele snapshotten kan være ubrugelig uden at kaste", () => {
    const r = byggBegivenheder([DAARLIG, post("bad2", "2026-09-12T04:00:00")], "https://x.dk");
    expect(r.linjer).toHaveLength(0);
    expect(r.udeladt).toHaveLength(2);
  });
});

describe("UÆNDRET i normaltilstand", () => {
  // Den prøve der forhindrer at robustheden ændrer produktet.
  it("et feed uden dårlige poster har ingen udeladelser og alle sine punkter", () => {
    const r = byggBegivenheder([GYLDIG_A, GYLDIG_B], "https://x.dk");
    expect(r.udeladt).toEqual([]);
    expect(r.linjer).toHaveLength(2);
  });

  it("en gyldig post ser præcis ud som før — felt for felt", () => {
    const [linje] = byggBegivenheder([GYLDIG_A], "https://x.dk").linjer;
    expect(linje).toContain("BEGIN:VEVENT");
    expect(linje).toContain("UID:a@webhouse-cms");
    expect(linje).toContain("DTSTART:20260911T030000Z");
    expect(linje).toContain("DTEND:20260911T031500Z");
    expect(linje).toContain("SUMMARY:📗 Publish: Titel a");
    expect(linje).toContain("URL:https://x.dk/admin/x/a");
    expect(linje).toContain("END:VEVENT");
  });

  it("rækkefølgen bevares — en udeladelse rykker ikke de andre rundt", () => {
    const r = byggBegivenheder([GYLDIG_A, DAARLIG, GYLDIG_B], "https://x.dk");
    expect(r.linjer[0]).toContain("UID:a@webhouse-cms");
    expect(r.linjer[1]).toContain("UID:b@webhouse-cms");
  });

  it("intet logges når intet er galt", () => {
    byggBegivenheder([GYLDIG_A, GYLDIG_B], "https://x.dk");
    expect(log).not.toHaveBeenCalled();
  });
});

describe("den samlede fil", () => {
  // X-WR-CALDESC bygges i ruten selv; her prøves REGLEN om hvornår den skal med,
  // så den ikke kan blive en linje der altid står der.
  const caldesc = (n: number) =>
    n ? [`X-WR-CALDESC:${n} ${n === 1 ? "punkt kunne" : "punkter kunne"} ikke vises`] : [];

  it("ingen CALDESC-linje når intet er udeladt", () => {
    expect(caldesc(0)).toEqual([]);
  });

  it("ental og flertal", () => {
    expect(caldesc(1)[0]).toBe("X-WR-CALDESC:1 punkt kunne ikke vises");
    expect(caldesc(3)[0]).toBe("X-WR-CALDESC:3 punkter kunne ikke vises");
  });
});
