/**
 * F98 — Lighthouse unit tests.
 */
import { describe, it, expect } from "vitest";
import { scoreColor, SCORE_COLOR_MAP } from "../lighthouse/types";

describe("scoreColor", () => {
  it("green for 90-100", () => {
    expect(scoreColor(100)).toBe("green");
    expect(scoreColor(90)).toBe("green");
    expect(scoreColor(95)).toBe("green");
  });

  it("orange for 50-89", () => {
    expect(scoreColor(89)).toBe("orange");
    expect(scoreColor(50)).toBe("orange");
    expect(scoreColor(72)).toBe("orange");
  });

  it("red for 0-49", () => {
    expect(scoreColor(49)).toBe("red");
    expect(scoreColor(0)).toBe("red");
    expect(scoreColor(25)).toBe("red");
  });
});

describe("SCORE_COLOR_MAP", () => {
  it("has correct hex values", () => {
    expect(SCORE_COLOR_MAP.green).toBe("#0cce6b");
    expect(SCORE_COLOR_MAP.orange).toBe("#ffa400");
    expect(SCORE_COLOR_MAP.red).toBe("#ff4e42");
  });
});

describe("PSI response parsing", () => {
  // Mock a minimal PSI response structure
  const mockPsiResponse = {
    lighthouseResult: {
      finalUrl: "https://example.com",
      configSettings: { formFactor: "mobile" },
      categories: {
        performance: { score: 0.87 },
        accessibility: { score: 0.94 },
        seo: { score: 0.72 },
        "best-practices": { score: 1.0 },
      },
      audits: {
        "largest-contentful-paint": { numericValue: 2400, score: 0.7, title: "LCP", description: "Desc" },
        "cumulative-layout-shift": { numericValue: 0.05, score: 0.95, title: "CLS", description: "Desc" },
        "first-contentful-paint": { numericValue: 1200, score: 0.8, title: "FCP", description: "Desc" },
        "server-response-time": { numericValue: 350, score: 0.9, title: "TTFB", description: "Desc" },
        "render-blocking-resources": {
          score: 0.4, title: "Eliminate render-blocking resources",
          description: "Some [link](http://example.com) resources block.",
          details: { type: "opportunity", overallSavingsMs: 400 },
        },
      },
    },
    loadingExperience: {
      metrics: {
        LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2500, category: "AVERAGE" },
        CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 5, category: "FAST" },
      },
    },
  };

  it("extracts scores correctly", () => {
    const cats = mockPsiResponse.lighthouseResult.categories;
    expect(Math.round(cats.performance.score * 100)).toBe(87);
    expect(Math.round(cats.accessibility.score * 100)).toBe(94);
    expect(Math.round(cats.seo.score * 100)).toBe(72);
    expect(Math.round(cats["best-practices"].score * 100)).toBe(100);
  });

  it("extracts CWV from audits", () => {
    const audits = mockPsiResponse.lighthouseResult.audits;
    expect(audits["largest-contentful-paint"].numericValue).toBe(2400);
    expect(audits["cumulative-layout-shift"].numericValue).toBe(0.05);
  });

  it("identifies opportunities with savings", () => {
    const audit = mockPsiResponse.lighthouseResult.audits["render-blocking-resources"];
    expect(audit.details.type).toBe("opportunity");
    expect(audit.details.overallSavingsMs).toBe(400);
    expect(audit.score).toBeLessThan(1);
  });

  it("has CrUX field data", () => {
    const metrics = mockPsiResponse.loadingExperience.metrics;
    expect(metrics.LARGEST_CONTENTFUL_PAINT_MS.percentile).toBe(2500);
    expect(metrics.LARGEST_CONTENTFUL_PAINT_MS.category).toBe("AVERAGE");
  });
});
