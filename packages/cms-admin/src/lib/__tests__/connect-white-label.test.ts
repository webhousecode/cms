import { describe, it, expect } from "vitest";
import { renderConnectWelcome } from "../inline-edit-connect-page";
import { DEFAULT_BRAND, resolveBrand, BRAND_PACKS } from "../brand";

/**
 * F210 — the "you're signed in" page after the live-edit login. Owner, with a
 * screenshot from a customer site: «Denne skal også white lables og det mangler
 * du». It showed the webhouse eye, "webhouse CMS" and "Powered by
 * @webhouse/cms" to fysio.work's editors, in Danish for everyone.
 */
const data = { token: "tok", returnUrl: "https://example.dk/", site: "s", freshLogin: true };
const fysio = resolveBrand("cms.fysio.work", BRAND_PACKS);

describe("inline-edit connect page", () => {
  it("on a customer brand: its logo, name and colour — and no webhouse anywhere", () => {
    const html = renderConnectWelcome(data, fysio, "da");
    expect(fysio.id).toBe("fysio-work");
    expect(html).toContain(`src="${fysio.logo.dark}"`);
    expect(html).toContain("<b>fysio.work</b>");
    expect(html).toContain(`--gold:${fysio.colorDark}`);
    expect(html).toContain("Du er logget ind");
    expect(html).toContain('lang="da"');
    expect(html.toLowerCase()).not.toContain("webhouse");
    expect(html).not.toContain("Powered by");
  });

  it("follows the admin language", () => {
    const html = renderConnectWelcome(data, fysio, "en");
    expect(html).toContain("You&#39;re signed in".replace("&#39;", "'"));
    expect(html).toContain("Back to your website");
    expect(html).toContain('lang="en"');
  });

  it("CONTROL: webhouse's own brand keeps its mark and Powered by", () => {
    const html = renderConnectWelcome(data, DEFAULT_BRAND, "da");
    expect(html).toContain('class="brandmark"');
    expect(html).toContain("Powered by <b>@webhouse/cms</b>");
    expect(html).toContain("--gold:#f7bb2e");
  });

  it("the token still reaches the page script, escaped for a <script> context", () => {
    const html = renderConnectWelcome({ ...data, token: "</script><x>" }, fysio, "da");
    expect(html).not.toContain("</script><x>");
    expect(html).toContain("\\u003c/script>");
  });
});
