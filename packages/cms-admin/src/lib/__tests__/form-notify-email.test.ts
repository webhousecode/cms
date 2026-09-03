import { describe, it, expect } from "vitest";
import { renderFormNotification, renderAutoReply } from "../mail/render";
import { brandForSite, WEBHOUSE } from "../mail/brand";

/**
 * Christian, on seeing one of these in Gmail: "Frygteligt design".
 *
 * Three of the four faults were not taste, and these tests are about those:
 *   - it printed the machine's own field KEYS ("name", "message") while the
 *     form config had proper labels sitting unused;
 *   - it printed the stored ISO timestamp verbatim at a human;
 *   - it carried no way to act on the thing it was notifying about.
 * The fourth (a black slab in a white inbox) is a screenshot's job, not a test's.
 *
 * F186 moved the rendering into @broberg/mail-core. The assertions below are
 * the SAME requirements — they are just driven through the shell now. That is
 * the point of keeping them: a new shell must not quietly lose a property the
 * old one was fixed to have.
 */
const FAKTA = [
  { label: "Navn", value: "Mette Sørensen" },
  { label: "E-mail", value: "mette@eksempel.dk" },
  { label: "Besked", value: "Hej" },
];

const DA = {
  formLabel: "Contact",
  fakta: FAKTA,
  brand: WEBHOUSE,
  lang: "da" as const,
  etiket: "Ny henvendelse",
  modtaget: "Modtaget 24. august 2026",
  fodnote: "Sendt fra kontaktformularen på broberg.ai",
  svarTekst: "Svar til afsenderen",
  svarHref: "mailto:mette@eksempel.dk",
  aabnTekst: "Åbn i CMS",
  aabnHref: "https://webhouse.app/admin/goto/x",
};

describe("form notification", () => {
  it("uses the field's human LABEL, never the schema key", () => {
    const html = renderFormNotification(DA);
    expect(html).toContain("Navn");
    expect(html).toContain("Besked");
    expect(html).not.toMatch(/>name</);
    expect(html).not.toMatch(/>message</);
  });

  it("prints a date a person can read, not the stored ISO string", () => {
    const html = renderFormNotification(DA);
    expect(html).not.toContain("2026-08-24T20:06:40.224Z");
    expect(html).toContain("24. august 2026");
  });

  it("carries both actions — reply to the sender, and open it in the CMS", () => {
    const html = renderFormNotification(DA);
    expect(html).toContain("mailto:mette@eksempel.dk");
    expect(html).toContain("https://webhouse.app/admin/goto/x");
    expect(html).toContain("Svar til afsenderen");
  });

  it("omits an action rather than rendering a dead button", () => {
    const html = renderFormNotification({ ...DA, svarHref: undefined, aabnHref: undefined });
    expect(html).not.toContain("Svar til afsenderen");
    expect(html).not.toContain("Åbn i CMS");
  });

  it("escapes submitted content — a message is not markup", () => {
    const html = renderFormNotification({
      ...DA,
      fakta: [{ label: "Navn", value: "<script>alert(1)</script>" }],
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("speaks English when the site's default language is English", () => {
    const html = renderFormNotification({
      ...DA, lang: "en", etiket: "New enquiry", modtaget: "Received 24 August 2026",
    });
    expect(html).toContain("New enquiry");
    expect(html).toContain("Received");
    expect(html).not.toContain("Ny henvendelse");
  });
});

/**
 * THE BRAND IS THE POINT OF F186, so it gets both directions.
 *
 * cms-admin drives several sites on one machine. A shell that renders every
 * site identically would look finished and be the bug: broberg.ai's blue on a
 * mail to Sanne's clients.
 */
describe("the brand comes from the site, not from a constant", () => {
  const SANNE = { emailAccentColor: "#3a8fb7", emailFooterName: "Sanne Andersen",
    emailLogoUrl: "https://sanneandersen.dk/logo.png", deployProductionUrl: "https://sanneandersen.dk" };
  const BROBERG = { emailAccentColor: "#00b2ff", emailFooterName: "broberg.ai",
    emailLogoUrl: "https://broberg.ai/logo.png", deployProductionUrl: "https://broberg.ai" };

  it("renders two different sites differently", () => {
    const a = renderFormNotification({ ...DA, brand: brandForSite(SANNE) });
    const b = renderFormNotification({ ...DA, brand: brandForSite(BROBERG) });
    // The load-bearing assertion: not that each contains its own colour, but
    // that the two OUTPUTS differ. Identical output would mean the brand is
    // not wired in at all, and per-colour checks could still pass by accident.
    expect(a).not.toEqual(b);
    expect(a).toContain("#3a8fb7");
    expect(a).toContain("Sanne Andersen");
    expect(b).toContain("#00b2ff");
    expect(b).toContain("broberg.ai");
    expect(a).not.toContain("#00b2ff");
  });

  it("ships dark: no logo in config renders NO mark, never a broken image", () => {
    const uden = brandForSite({ ...BROBERG, emailLogoUrl: "" });
    expect(uden.logoUrl).toBeUndefined();
    const html = renderFormNotification({ ...DA, brand: uden });
    expect(html).not.toContain("<img");
    // …and the letter still carries its content.
    expect(html).toContain("Mette Sørensen");
  });

  it("refuses a relative logo path — a mail client has no page to be relative to", () => {
    expect(brandForSite({ emailLogoUrl: "/logo.png" }).logoUrl).toBeUndefined();
    expect(brandForSite({ emailLogoUrl: "https://x.dk/logo.png" }).logoUrl).toBe("https://x.dk/logo.png");
  });

  it("falls back to the house brand when the colour is not a colour", () => {
    expect(brandForSite({ emailAccentColor: "rgb(1,2,3)" }).accentColor).toBe(WEBHOUSE.accentColor);
    expect(brandForSite({ emailAccentColor: "#00b2ff" }).accentColor).toBe("#00b2ff");
  });
});

describe("auto-reply", () => {
  const AR = {
    subject: "Tak for din henvendelse",
    body: "Hej Mette\n\nTak fordi du skrev. Vi vender tilbage.",
    links: [{ label: "Om os", url: "https://broberg.ai/om" }],
    brand: WEBHOUSE,
    laesOgsaa: "Læs også",
  };

  it("keeps the site's own words", () => {
    const html = renderAutoReply(AR);
    expect(html).toContain("Tak fordi du skrev.");
    expect(html).toContain("Hej Mette");
  });

  it("splits blank-line paragraphs instead of one preserved-whitespace blob", () => {
    const html = renderAutoReply(AR);
    // Two paragraphs → the greeting and the body are not in the same element.
    expect(html).not.toMatch(/Hej Mette[\s\S]{0,20}Tak fordi/);
  });

  it("renders read-more links, and none when there are none", () => {
    expect(renderAutoReply(AR)).toContain("https://broberg.ai/om");
    expect(renderAutoReply({ ...AR, links: [] })).not.toContain("Læs også");
  });
});
