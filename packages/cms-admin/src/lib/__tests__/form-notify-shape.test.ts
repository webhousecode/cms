import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FormConfig } from "@webhouse/cms";
import type { FactRow } from "@broberg/mail-core";

/**
 * DEN JSON MOTOREN FAKTISK PRODUCERER — ikke feltlisten den kommer fra.
 *
 * cardmem bygger `factBox` i @broberg/mail-core mod dette. De bad om en
 * SYNTETISK indsendelse gennem den RIGTIGE rute, netop fordi den er uden
 * rigtige personer i og derfor kan blive liggende i en test. Den findes her
 * så begge sider har den samme kendsgerning at bygge mod, og så en ændring i
 * vores ende bliver synlig frem for at overraske dem.
 *
 * FORMULAREN ER DEN ÆGTE. Felterne herunder er læst ordret fra broberg.ai's
 * _data/forms.json i drift — inklusive etiketten på 47 tegn. En opfundet
 * formular ville have givet et pænere, forkert svar.
 *
 * INDHOLDET ER OPDIGTET, og de tre træk der driller er med med vilje:
 *   - TOMME værdier (3 af 7 felter var tomme i mindst én rigtig indsendelse)
 *   - en ETIKET længere end sin værdi
 *   - en TEXTAREA med linjeskift
 */

const captured: { fakta?: FactRow[] } = {};

vi.mock("../mail/render", async (importOriginal) => {
  const rigtig = await importOriginal<typeof import("../mail/render")>();
  return {
    ...rigtig,
    renderFormNotification: (input: Parameters<typeof rigtig.renderFormNotification>[0]) => {
      captured.fakta = input.fakta;
      return rigtig.renderFormNotification(input);
    },
  };
});

const sendt: Array<{ to: string[]; subject: string; html: string; text: string }> = [];
vi.mock("../mailer", () => ({
  getMailer: () => ({
    send: async (m: { to: string[]; subject: string; html: string; text: string }) => {
      sendt.push(m);
    },
  }),
  buildFrom: (navn: string, adr: string) => `${navn} <${adr}>`,
}));

vi.mock("../site-config", () => ({
  readSiteConfig: async () => ({
    defaultLocale: "da",
    emailFooterName: "broberg.ai",
    emailFromName: "broberg.ai",
    emailFrom: "forms@webhouse.app",
    emailAccentColor: "#F7BB2E",
  }),
}));

vi.mock("../webhook-events", () => ({ fireContentEvent: async () => {} }));

/** Ordret fra broberg.ai's _data/forms.json i drift (2026-09-04). */
const KONTAKTFORMULAR = {
  name: "contact",
  label: "Kontakt (salgsforside)",
  fields: [
    { name: "name", type: "text", label: "Navn", required: true },
    { name: "email", type: "email", label: "Email", required: true },
    { name: "phone", type: "phone", label: "Telefon", required: false },
    { name: "company", type: "text", label: "Virksomhed", required: false },
    { name: "solutionType", type: "text", label: "Interesseret i (kan være flere, kommasepareret)", required: false },
    { name: "message", type: "textarea", label: "Besked", required: true },
    { name: "newsletter", type: "checkbox", label: "Nyhedsbrev", required: false },
  ],
  notifications: { email: ["ejer@eksempel.dk"] },
} as unknown as FormConfig;

/** Opdigtet indsendelse. Formen er målt; personen findes ikke. */
const INDSENDELSE = {
  id: "syntetisk-0001",
  form: "contact",
  status: "new" as const,
  createdAt: "2026-09-04T09:15:00.000Z",
  data: {
    name: "Testperson Eksempelsen",
    email: "testperson@eksempel.dk",
    phone: "",                     // tomt — normalt
    company: "",                   // tomt — normalt
    solutionType: "cms, hosting",  // værdien er KORTERE end sin etiket
    message: "Første linje.\n\nAndet afsnit efter en tom linje.\nTredje linje.",
    newsletter: "true",            // et flueben, som HTTP leverer det
  },
};

/**
 * DEN FAKTISKE JSON. Ikke en beskrivelse af den — den værdi motoren afleverer.
 * Rækkefølgen er indsendelsens egen (Object.entries), ikke skemaets.
 */
const FORVENTET_FAKTA: FactRow[] = [
  { label: "Navn", value: "Testperson Eksempelsen" },
  { label: "Email", value: "testperson@eksempel.dk" },
  { label: "Interesseret i (kan være flere, kommasepareret)", value: "cms, hosting" },
  { label: "Besked", value: "Første linje.\n\nAndet afsnit efter en tom linje.\nTredje linje." },
  { label: "Nyhedsbrev", value: "Ja" },
];

describe("form notification — den JSON factBox modtager", () => {
  beforeEach(() => {
    sendt.length = 0;
    delete captured.fakta;
  });

  it("afleverer præcis denne FactRow[] til skallen", async () => {
    const { notifyFormSubmission } = await import("../forms/notify");
    await notifyFormSubmission(KONTAKTFORMULAR, INDSENDELSE);
    expect(captured.fakta).toEqual(FORVENTET_FAKTA);
  });

  it("udelader tomme felter helt frem for at sende en tom række", async () => {
    const { notifyFormSubmission } = await import("../forms/notify");
    await notifyFormSubmission(KONTAKTFORMULAR, INDSENDELSE);
    // 7 felter ind, 5 rækker ud. En modtager af FactRow[] møder ALDRIG en tom
    // værdi fra os — men må ikke ANTAGE det, for det er vores valg, ikke en
    // egenskab ved typen.
    expect(captured.fakta).toHaveLength(5);
    expect(captured.fakta!.map((r) => r.label)).not.toContain("Telefon");
    expect(captured.fakta!.map((r) => r.label)).not.toContain("Virksomhed");
  });

  it("sender et flueben som Ja, ikke som true", async () => {
    const { notifyFormSubmission } = await import("../forms/notify");
    await notifyFormSubmission(KONTAKTFORMULAR, INDSENDELSE);
    const nyhedsbrev = captured.fakta!.find((r) => r.label === "Nyhedsbrev");
    expect(nyhedsbrev!.value).toBe("Ja");
    expect(captured.fakta!.some((r) => r.value === "true")).toBe(false);
  });

  it("bærer linjeskiftene fra en textarea uændret videre", async () => {
    const { notifyFormSubmission } = await import("../forms/notify");
    await notifyFormSubmission(KONTAKTFORMULAR, INDSENDELSE);
    const besked = captured.fakta!.find((r) => r.label === "Besked");
    expect(besked!.value.split("\n")).toHaveLength(4);
  });

  it("begge halvdele af brevet siger det samme om fluebenet", async () => {
    const { notifyFormSubmission } = await import("../forms/notify");
    await notifyFormSubmission(KONTAKTFORMULAR, INDSENDELSE);
    const mail = sendt[0]!;
    expect(mail.text).toContain("Nyhedsbrev: Ja");
    expect(mail.text).not.toContain("Nyhedsbrev: true");
    expect(mail.html).not.toContain(">true<");
  });
});
