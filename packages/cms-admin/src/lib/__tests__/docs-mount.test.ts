/**
 * F212 — white-label docs: cms.<brand>/docs forwards to the docs app.
 */
import { describe, it, expect } from "vitest";
import { docsForward, docsBrandHeader, isDocsPath, DOCS_BRAND_HEADER } from "../docs-mount";
import { BRAND_PACKS, DEFAULT_BRAND, docsBase, docsHome, resolveBrand } from "../brand";

const fysio = resolveBrand("cms.fysio.work");
const ORIGIN = "https://docs.webhouse.app";

function adminRequestHeaders(): Headers {
  return new Headers({
    cookie: "cms-session=SECRET-SESSION; cms-active-site=x",
    authorization: "Bearer wh_SECRET",
    "x-cms-service-token": "SECRET",
    "x-forwarded-host": "cms.fysio.work",
    accept: "text/html",
    "accept-language": "da",
    rsc: "1",
  });
}

describe("docsForward", () => {
  it("forwards a customer's /docs path to the docs app, same path and query", () => {
    const f = docsForward(fysio, new URL("https://cms.fysio.work/docs/seo-da?x=1"), adminRequestHeaders(), ORIGIN);
    expect(f?.target.toString()).toBe("https://docs.webhouse.app/docs/seo-da?x=1");
  });

  it("never forwards the admin's cookies, bearer token or service token", () => {
    const f = docsForward(fysio, new URL("https://cms.fysio.work/docs"), adminRequestHeaders(), ORIGIN)!;
    for (const name of ["cookie", "authorization", "x-cms-service-token", "x-forwarded-host"]) {
      expect(f.headers.get(name)).toBeNull();
    }
    expect([...f.headers.values()].join(" ")).not.toContain("SECRET");
  });

  it("keeps the headers the docs app needs (language, client router)", () => {
    const f = docsForward(fysio, new URL("https://cms.fysio.work/docs"), adminRequestHeaders(), ORIGIN)!;
    expect(f.headers.get("accept-language")).toBe("da");
    expect(f.headers.get("rsc")).toBe("1");
  });

  it("names the brand from the brand pack — the pack stays the one source", () => {
    const f = docsForward(fysio, new URL("https://cms.fysio.work/docs"), adminRequestHeaders(), ORIGIN)!;
    const brand = JSON.parse(f.headers.get(DOCS_BRAND_HEADER)!);
    expect(brand).toMatchObject({
      id: fysio.id,
      address: fysio.hosts[0],
      locale: "da",
      color: fysio.color,
      logoLight: fysio.logo.light,
      fontFamily: fysio.font?.family,
    });
  });

  it("does nothing on webhouse's own address (its docs are docs.webhouse.app)", () => {
    expect(docsForward(DEFAULT_BRAND, new URL("https://webhouse.app/docs"), adminRequestHeaders(), ORIGIN)).toBeNull();
  });

  it("does nothing without DOCS_ORIGIN — no hard-coded fallback", () => {
    expect(docsForward(fysio, new URL("https://cms.fysio.work/docs"), adminRequestHeaders(), undefined)).toBeNull();
  });
});

describe("docsBrandHeader", () => {
  it("only carries values the docs app accepts (hex colours, /brands/ files)", () => {
    for (const pack of BRAND_PACKS) {
      const b = JSON.parse(docsBrandHeader(pack));
      for (const key of ["color", "colorForeground", "colorDark", "colorDarkForeground"]) {
        if (b[key] !== undefined) expect(b[key]).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
      for (const key of ["logoLight", "logoDark", "favicon", "fontStylesheet"]) {
        if (b[key] !== undefined) expect(b[key]).toMatch(/^\/brands\/[a-z0-9-]+\/[A-Za-z0-9._-]+$/);
      }
      expect(b.address).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
    }
  });
});

describe("isDocsPath", () => {
  it("matches /docs and below, nothing else", () => {
    expect(isDocsPath("/docs")).toBe(true);
    expect(isDocsPath("/docs/seo")).toBe(true);
    expect(isDocsPath("/docsx")).toBe(false);
    expect(isDocsPath("/admin/docs")).toBe(false);
  });
});

describe("docs links follow the brand", () => {
  it("webhouse links to docs.webhouse.app, a customer to its own /docs", () => {
    expect(docsHome(DEFAULT_BRAND)).toBe("https://docs.webhouse.app");
    expect(`${docsBase(DEFAULT_BRAND)}/docs/seo`).toBe("https://docs.webhouse.app/docs/seo");
    expect(docsHome(fysio)).toBe("/docs");
    expect(`${docsBase(fysio)}/docs/seo`).toBe("/docs/seo");
  });
});
