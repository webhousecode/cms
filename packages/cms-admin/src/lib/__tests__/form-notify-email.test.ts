import { describe, it, expect } from "vitest";
import { renderFormNotificationBody } from "../forms/notify";

/**
 * Christian, on seeing one of these in Gmail: "Frygteligt design".
 *
 * Three of the four faults were not taste, and these tests are about those:
 *   - it printed the machine's own field KEYS ("name", "message") while the
 *     form config had proper labels sitting unused;
 *   - it printed the stored ISO timestamp verbatim at a human;
 *   - it carried no way to act on the thing it was notifying about.
 * The fourth (a black slab in a white inbox) is a screenshot's job, not a test's.
 */
const FORM = {
  name: "contact",
  label: "Contact",
  fields: [
    { name: "name", type: "text", label: "Navn" },
    { name: "email", type: "email", label: "E-mail" },
    { name: "message", type: "textarea", label: "Besked" },
  ],
} as never;

const SUB = {
  id: "s1",
  createdAt: "2026-08-24T20:06:40.224Z",
  data: { name: "Mette Sørensen", email: "mette@eksempel.dk", message: "Hej", empty: "" },
} as never;

function render(over: Partial<Parameters<typeof renderFormNotificationBody>[0]> = {}) {
  return renderFormNotificationBody({
    form: FORM, sub: SUB, lang: "da", accent: "#F7BB2E",
    replyHref: "mailto:mette@eksempel.dk", openHref: "https://webhouse.app/admin/goto/x",
    ...over,
  });
}

describe("form notification body", () => {
  it("uses the field's human LABEL, never the schema key", () => {
    const html = render();
    expect(html).toContain("Navn");
    expect(html).toContain("Besked");
    // the raw keys must not appear as a row label
    expect(html).not.toMatch(/>name</);
    expect(html).not.toMatch(/>message</);
  });

  it("prints a date a person can read, not the stored ISO string", () => {
    const html = render();
    expect(html).not.toContain("2026-08-24T20:06:40.224Z");
    expect(html).toContain("24. august 2026");
  });

  it("carries both actions — reply to the sender, and open it in the CMS", () => {
    const html = render();
    expect(html).toContain("mailto:mette@eksempel.dk");
    expect(html).toContain("https://webhouse.app/admin/goto/x");
    expect(html).toContain("Svar til afsenderen");
  });

  it("omits an action rather than rendering a dead button", () => {
    const html = render({ replyHref: "", openHref: "" });
    expect(html).not.toContain("Svar til afsenderen");
    expect(html).not.toContain("Åbn i CMS");
  });

  it("skips empty fields instead of showing a blank row", () => {
    expect(render()).not.toContain("Empty");
  });

  it("makes the sender's address clickable", () => {
    expect(render()).toContain('href="mailto:mette@eksempel.dk"');
  });

  it("does not put the form's own label in the heading — it was English on a Danish site", () => {
    const html = render();
    expect(html).toContain("Ny henvendelse");
    expect(html).not.toContain("contact<");
    expect(html).not.toContain("via contact");
  });

  it("escapes submitted content — a message is not markup", () => {
    const html = renderFormNotificationBody({
      form: FORM,
      sub: { ...(SUB as object), data: { name: "<script>alert(1)</script>", email: "a@b.dk" } } as never,
      lang: "da", accent: "#F7BB2E", replyHref: "", openHref: "",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("speaks English when the site's default language is English", () => {
    const html = render({ lang: "en" });
    expect(html).toContain("New enquiry");
    expect(html).toContain("Received");
    expect(html).not.toContain("Ny henvendelse");
  });
});
