/**
 * F210.5 — cms.fysio.work logs in through its OWN BID client («cms-fysio-work»),
 * because BID designs the login dialog per client: the default client shows
 * webhouse, fysio's shows fysio.work. Picked by exact address, and only once
 * both of its secrets are present — before that the default client keeps
 * working, so landing the code before the secrets breaks nothing.
 */
import { describe, it, expect } from "vitest";
import { bidClientFor } from "../bid";
import { BRAND_PACKS, type BrandPack } from "../brand";

const BASE = { clientId: "default-id", clientSecret: "default-secret" };
const PACKS: BrandPack[] = [
  {
    id: "fysio-work", name: "fysio.work", hosts: ["cms.fysio.work"],
    logo: { light: "", dark: "" }, favicon: "", color: "#0E4F5C", colorForeground: "#FFFFFF",
    bidClient: { idEnv: "FW_ID", secretEnv: "FW_SECRET" },
  },
];
const ENV = { FW_ID: "fysio-id", FW_SECRET: "fysio-secret" } as unknown as NodeJS.ProcessEnv;

describe("bidClientFor", () => {
  it("a customer address with its secrets set uses its own client", () => {
    expect(bidClientFor("cms.fysio.work", BASE, ENV, PACKS)).toEqual({ clientId: "fysio-id", clientSecret: "fysio-secret" });
    expect(bidClientFor("CMS.Fysio.Work:443", BASE, ENV, PACKS)).toEqual({ clientId: "fysio-id", clientSecret: "fysio-secret" });
  });

  it("falls back to the default client while either secret is missing", () => {
    expect(bidClientFor("cms.fysio.work", BASE, {} as unknown as NodeJS.ProcessEnv, PACKS)).toEqual(BASE);
    expect(bidClientFor("cms.fysio.work", BASE, { FW_ID: "x" } as unknown as NodeJS.ProcessEnv, PACKS)).toEqual(BASE);
    expect(bidClientFor("cms.fysio.work", BASE, { FW_SECRET: "x" } as unknown as NodeJS.ProcessEnv, PACKS)).toEqual(BASE);
  });

  it("webhouse.app, no host, unknown and look-alike hosts keep the default client", () => {
    for (const h of ["webhouse.app", null, "evil.example", "cms.fysio.work.evil.example", "cms.fysio.work.localhost"]) {
      expect(bidClientFor(h, BASE, ENV, PACKS)).toEqual(BASE);
    }
  });

  it("the committed fysio.work pack names the env vars the vault holds", () => {
    const fysio = BRAND_PACKS.find((p) => p.id === "fysio-work");
    expect(fysio?.bidClient).toEqual({ idEnv: "BID_CLIENT_ID_FYSIO_WORK", secretEnv: "BID_CLIENT_SECRET_FYSIO_WORK" });
  });
});
