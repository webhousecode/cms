/**
 * F201.1 — the compliance scanner must never report an unread repo as clean.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { scanProject, scanDir, recommend, signedRecordProblem, productionUse, applyOwnerRulings, publicSubprocessors, listChangedAt, type Assessment } from "../../../../../scripts/compliance-scan";

function repoWith(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "cscan-"));
  for (const [f, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    writeFileSync(path.join(dir, f), body);
  }
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["add", "-A"], { cwd: dir });
  return dir;
}

describe("compliance scan", () => {
  it("reports a repo it cannot read as NOT SCANNED, never as zero vendors", () => {
    const cache = mkdtempSync(path.join(tmpdir(), "cscan-cache-"));
    const { result, scan } = scanProject({ slug: "ghost", repo: "broberg-ai/this-repo-does-not-exist-f201" }, cache);
    expect(result.status).toBe("not_scanned");
    expect(result.reason).toMatch(/kunne ikke klones/);
    expect(scan).toBeNull();
  });

  it("reports a project without a repo as NOT SCANNED", () => {
    expect(scanProject({ slug: "x", repo: null }).result.status).toBe("not_scanned");
  });

  it("finds vendors by dependency, env-var name and host — with file:line", () => {
    const dir = repoWith({
      "package.json": JSON.stringify({ dependencies: { stripe: "1.0.0" } }, null, 2),
      "src/mail.ts": 'const k = process.env.RESEND_API_KEY;\nfetch("https://api.mistral.ai/v1/chat");\n',
      "fly.toml": 'app = "demo"\nprimary_region = "arn"\n',
    });
    const r = scanDir("t/demo", dir);
    expect([...r.hits.keys()].sort()).toEqual(["fly", "mistral", "resend", "stripe"]);
    expect(r.hits.get("resend")![0]).toMatchObject({ file: "src/mail.ts", line: 1 });
    expect(r.flyRegions).toEqual([{ app: "demo", region: "arn", file: "fly.toml" }]);
  });

  it("does not count tests, docs or fleet hooks as use", () => {
    const dir = repoWith({
      "src/a.test.ts": "process.env.STRIPE_SECRET_KEY",
      "docs/x.ts": "process.env.STRIPE_SECRET_KEY",
      ".claude/hooks/h.sh": "FLY_API_TOKEN",
    });
    expect(scanDir("t/x", dir).hits.size).toBe(0);
  });

  it("does not count its own catalogue or output as use", () => {
    const dir = repoWith({
      "scripts/compliance-scan.ts": "env: /^SENTRY_/, host: /sentry\\.io$/ // https://sentry.io",
      "compliance/compliance.yaml": "- id: sentry # https://sentry.io",
    });
    expect(scanDir("t/x", dir).hits.size).toBe(0);
  });

  it("lists an unknown outbound host for review instead of dropping it", () => {
    const dir = repoWith({ "src/a.ts": 'fetch("https://api.somenewvendor.io/v2")' });
    expect([...scanDir("t/x", dir).unknownHosts.keys()]).toEqual(["api.somenewvendor.io"]);
  });
});

describe("vendor recommendation (F201.2)", () => {
  const base: Assessment = { id: "v", dpa_status: "auto", dpa_url: "https://v.example/dpa", dpa_url_http: 200,
    transfer_basis: "DPF", eu_region_possible: true, checked_at: "2026-09-26" };

  it("links a DPA that is part of the terms", () => {
    expect(recommend(base, ["cms"]).recommendation).toBe("link");
  });

  it("does NOT call a DPA 'auto' when its link could not be fetched", () => {
    const r = recommend({ ...base, dpa_url_http: 404 }, ["cms"]);
    expect(r.status).toBe("ukendt");
    expect(r.recommendation).toBe("undersøg");
  });

  it("asks Christian to sign when the DPA must be accepted", () => {
    expect(recommend({ ...base, dpa_status: "skal_accepteres" }, ["cms"]).recommendation).toBe("acceptér/underskriv");
  });

  it("an unassessed vendor is 'undersøg', never silently fine", () => {
    expect(recommend(undefined, ["cms"]).recommendation).toBe("undersøg");
  });

  it("flags health products routed outside the EU — and not EU vendors", () => {
    expect(recommend(base, ["fd-sundhed", "cms"]).sensitiveOutsideEU).toBe(true);
    expect(recommend({ ...base, transfer_basis: "EU" }, ["fd-sundhed"]).sensitiveOutsideEU).toBe(false);
    expect(recommend(base, ["cms"]).sensitiveOutsideEU).toBe(false);
  });

  it("a vendor that is not a processor needs nothing and is not flagged", () => {
    const r = recommend({ ...base, dpa_status: "ikke_databehandler", transfer_basis: "ukendt" }, ["fd-sundhed"]);
    expect(r.recommendation).toBe("ingen handling");
    expect(r.sensitiveOutsideEU).toBe(false);
  });
});

describe("signed-DPA record (F201.3)", () => {
  const a: Assessment = { id: "fly", dpa_status: "skal_accepteres", dpa_url: "https://fly.io/documents/", dpa_url_http: 200,
    transfer_basis: "DPF", eu_region_possible: true, checked_at: "2026-09-26" };

  it("accepts an unsigned vendor and a fully signed one", () => {
    expect(signedRecordProblem(a)).toBeNull();
    expect(signedRecordProblem({ ...a, dpa_signed_at: "2026-09-26", dpa_signed_by: "Christian Broberg" })).toBeNull();
  });

  it("refuses a vendor marked done without who signed", () => {
    expect(signedRecordProblem({ ...a, dpa_signed_at: "2026-09-26" })).toMatch(/sammen/);
  });

  it("refuses a vendor marked done without when", () => {
    expect(signedRecordProblem({ ...a, dpa_signed_by: "Christian Broberg" })).toMatch(/sammen/);
  });

  it("refuses 'signed' on a vendor whose DPA did not need signing", () => {
    expect(signedRecordProblem({ ...a, dpa_status: "auto", dpa_signed_at: "x", dpa_signed_by: "y" })).toMatch(/dpa_status/);
  });
});

describe("production use (only vendors we actually run)", () => {
  const endpoints = [{ app: "a", env: "AWS_ENDPOINT_URL_S3", host: "fly.storage.tigris.dev", vendor: "tigris", measured_at: "2026-09-26" }];

  it("a vendor counts only when a running app holds its credential", () => {
    const use = productionUse({ a: ["RESEND_API_KEY", "CMS_JWT_SECRET"], b: [] }, []);
    expect([...use.get("resend")!]).toEqual(["a"]);
    expect(use.has("stripe")).toBe(false);
  });

  it("every running app counts toward Fly, the host itself", () => {
    expect([...productionUse({ a: [], b: [] }, []).get("fly")!].sort()).toEqual(["a", "b"]);
  });

  it("a measured endpoint counts only if that app still has the secret", () => {
    expect(productionUse({ a: ["AWS_ENDPOINT_URL_S3"] }, endpoints).get("tigris")).toEqual(new Set(["a"]));
    expect(productionUse({ a: [] }, endpoints).has("tigris")).toBe(false);
  });
});

describe("owner ruling: not in production", () => {
  const base: Assessment = { id: "opkald", dpa_status: "skal_accepteres", dpa_url: null, transfer_basis: "EU", eu_region_possible: true, checked_at: "2026-09-26" };
  const ruling = { at: "2026-09-27", by: "cb@webhouse.dk", reason: "kun demo-nøgle" };

  it("removes a vendor the owner ruled out, even though its credential is set", () => {
    const use = productionUse({ "fd-sundhed": ["OPKALD_DEMO_API_KEY", "RESEND_API_KEY"] }, []);
    expect(use.has("opkald")).toBe(true);
    const ruled = applyOwnerRulings(use, new Map([["opkald", { ...base, not_in_production: ruling }]]));
    expect(ruled.has("opkald")).toBe(false);
    expect(ruled.has("resend")).toBe(true);
  });

  it("leaves the measurement alone without a ruling", () => {
    const use = productionUse({ "fd-sundhed": ["OPKALD_DEMO_API_KEY"] }, []);
    expect(applyOwnerRulings(use, new Map([["opkald", base]])).has("opkald")).toBe(true);
  });

  it("a ruling without a reason is refused", () => {
    expect(signedRecordProblem({ ...base, not_in_production: { ...ruling, reason: "" } })).toMatch(/not_in_production/);
    expect(signedRecordProblem({ ...base, not_in_production: ruling })).toBeNull();
  });
});

describe("public sub-processor list (F201.4, broberg.ai/trust)", () => {
  const loc = { class: "eu" as const, da: "Stockholm", en: "Stockholm", measured: true, at: "2026-09-27" };
  const A = (id: string, extra: Partial<Assessment> = {}): Assessment => ({ id, dpa_status: "auto", dpa_url: null, transfer_basis: "EU", eu_region_possible: true, checked_at: "2026-09-27", location: loc, company_country: "USA", public: { name: id, purpose_da: "p", purpose_en: "p" }, ...extra });
  const V = ["fly", "discord", "opkald", "turso", "resend", "stripe"].map((id) => ({ id, name: id, purpose: "p" }));
  const ruling = { at: "2026-09-27", by: "cb@webhouse.dk", reason: "r" };
  const as = new Map([
    ["fly", A("fly")],
    ["discord", A("discord", { dpa_status: "ikke_databehandler" })],
    ["opkald", A("opkald", { not_in_production: ruling })],
    ["turso", A("turso", { internal_only: ruling })],
    ["resend", A("resend", { location: { ...loc, class: "mix" } })],
  ]);

  it("lists only processors in production, without owner rulings against them", () => {
    const { rows } = publicSubprocessors(V, new Set(["fly", "discord", "opkald", "turso", "resend"]), as);
    expect(rows.map((r) => r.id)).toEqual(["fly", "resend"]);
  });

  it("a vendor not measured in production is not listed", () => {
    expect(publicSubprocessors(V, new Set(["resend"]), as).rows.map((r) => r.id)).toEqual(["resend"]);
  });

  it("a qualifying vendor WITHOUT a location is reported missing, never silently dropped", () => {
    const withGap = new Map(as).set("stripe", A("stripe", { location: undefined }));
    const { rows, missing } = publicSubprocessors(V, new Set(["fly", "stripe"]), withGap);
    expect(missing).toEqual(["stripe"]);
    expect(rows.map((r) => r.id)).toEqual(["fly"]);
  });

  it("never exposes the internal DPA status", () => {
    const { rows } = publicSubprocessors(V, new Set(["fly"]), as);
    expect(Object.keys(rows[0])).not.toContain("dpa_status");
  });
});

describe("list_changed_at (F201.4)", () => {
  it("keeps the old date when the list is unchanged", () => {
    expect(listChangedAt({ list_changed_at: "2026-09-01", rows: [{ id: "a" }] }, [{ id: "a" }], "2026-09-27")).toBe("2026-09-01");
  });
  it("moves to today when a row changes", () => {
    expect(listChangedAt({ list_changed_at: "2026-09-01", rows: [{ id: "a" }] }, [{ id: "a" }, { id: "b" }], "2026-09-27")).toBe("2026-09-27");
  });
  it("starts at today with no previous file", () => {
    expect(listChangedAt(null, [], "2026-09-27")).toBe("2026-09-27");
  });
});
