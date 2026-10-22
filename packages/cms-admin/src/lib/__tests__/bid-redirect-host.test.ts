/**
 * F210.5 — a Broberg ID login must come home to the address it started on.
 *
 * SSO_REDIRECT_URI names ONE address (webhouse.app). A login started on
 * cms.fysio.work would be sent back to webhouse.app, where the login cookie
 * set on cms.fysio.work does not exist — so the login fails, every time, on
 * the customer's own address. The fix picks the callback from the address,
 * but ONLY among the customer addresses we have committed: a free host would
 * let anyone send BID's answer to an address of their choosing.
 */
import { describe, it, expect } from "vitest";
import { bidRedirectUriFor } from "../bid";
import type { BrandPack } from "../brand";

const DEFAULT = "https://webhouse.app/api/auth/bid/callback";
const PACKS: BrandPack[] = [
  {
    id: "fysio-work", name: "fysio.work", hosts: ["cms.fysio.work"],
    logo: { light: "", dark: "" }, favicon: "", color: "#0E4F5C", colorForeground: "#FFFFFF",
  },
];

describe("bidRedirectUriFor", () => {
  it("a customer address gets its own callback", () => {
    expect(bidRedirectUriFor("cms.fysio.work", DEFAULT, PACKS)).toBe("https://cms.fysio.work/api/auth/bid/callback");
  });

  it("ignores case and port on a customer address", () => {
    expect(bidRedirectUriFor("CMS.Fysio.Work:443", DEFAULT, PACKS)).toBe("https://cms.fysio.work/api/auth/bid/callback");
  });

  it("webhouse.app, a missing host and an unknown host keep the configured callback", () => {
    expect(bidRedirectUriFor("webhouse.app", DEFAULT, PACKS)).toBe(DEFAULT);
    expect(bidRedirectUriFor(null, DEFAULT, PACKS)).toBe(DEFAULT);
    expect(bidRedirectUriFor("evil.example", DEFAULT, PACKS)).toBe(DEFAULT);
  });

  it("never follows a look-alike — no suffix match, no .localhost preview alias", () => {
    expect(bidRedirectUriFor("cms.fysio.work.evil.example", DEFAULT, PACKS)).toBe(DEFAULT);
    expect(bidRedirectUriFor("evil-cms.fysio.work", DEFAULT, PACKS)).toBe(DEFAULT);
    expect(bidRedirectUriFor("cms.fysio.work.localhost", DEFAULT, PACKS)).toBe(DEFAULT);
  });

  it("keeps the configured path, so only the address changes", () => {
    const local = "http://localhost:3010/api/auth/bid/callback";
    expect(bidRedirectUriFor("cms.fysio.work", local, PACKS)).toBe("https://cms.fysio.work/api/auth/bid/callback");
  });
});
