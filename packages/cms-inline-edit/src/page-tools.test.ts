import { describe, it as test, expect } from "vitest";
import { parseTags, mergeTags, primaryDocRef } from "./page-tools";

describe("parseTags", () => {
  test("splitter på komma, trimmer, dropper tomme", () => {
    expect(parseTags(" BI , Dashboards ,, Realtid ")).toEqual(["BI", "Dashboards", "Realtid"]);
  });
  test("dubletter (case-ufølsomt) fjernes, første stavning vinder", () => {
    expect(parseTags("AI, ai, Ai")).toEqual(["AI"]);
  });
  test("tom streng → tom liste", () => {
    expect(parseTags("  ")).toEqual([]);
  });
});

describe("mergeTags", () => {
  test("nye lægges efter eksisterende, dubletter springes over", () => {
    expect(mergeTags(["BI", "AI"], ["ai", "Realtid"])).toEqual(["BI", "AI", "Realtid"]);
  });
  test("ikke-array eksisterende behandles som tom", () => {
    expect(mergeTags(undefined, ["X"])).toEqual(["X"]);
    expect(mergeTags("skidt", ["X"])).toEqual(["X"]);
  });
  test("ikke-streng-elementer i eksisterende filtreres fra", () => {
    expect(mergeTags(["OK", 7, null], ["Ny"])).toEqual(["OK", "Ny"]);
  });
});

describe("primaryDocRef", () => {
  test("flest ankre vinder", () => {
    const ref = primaryDocRef([
      { collection: "posts", slug: "a" },
      { collection: "posts", slug: "a" },
      { collection: "landing", slug: "home" },
    ]);
    expect(ref).toEqual({ collection: "posts", slug: "a" });
  });
  test("globals tæller ALDRIG som sidens dokument", () => {
    expect(primaryDocRef([{ collection: "globals", slug: "globals" }])).toBeNull();
  });
  test("tomme/halve ankre ignoreres; ingen kandidater → null", () => {
    expect(primaryDocRef([{ collection: "posts" }, { slug: "x" }, {}])).toBeNull();
  });
});
