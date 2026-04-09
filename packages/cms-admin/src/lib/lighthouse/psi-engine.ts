/**
 * F98 — Google PageSpeed Insights API engine.
 *
 * Cloud-based Lighthouse — works for any public URL.
 * Free: 25,000 requests/day (no key needed, key removes rate limits).
 */
import type { LighthouseResult, LighthouseOpportunity, LighthouseDiagnostic, CruxFieldData } from "./types";

const PSI_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export async function runPsiAudit(
  url: string,
  strategy: "mobile" | "desktop" = "mobile",
  apiKey?: string,
): Promise<LighthouseResult> {
  const params = new URLSearchParams({ url, strategy });
  for (const cat of ["performance", "accessibility", "seo", "best-practices"]) {
    params.append("category", cat);
  }
  if (apiKey) params.set("key", apiKey);

  const res = await fetch(`${PSI_URL}?${params}`, {
    headers: { "User-Agent": "webhouse.app-cms/1.0 (Lighthouse Audit)" },
  });

  if (!res.ok) {
    if (res.status === 429) {
      throw new Error("Daily quota exceeded — add your own PageSpeed Insights API key below to get 25,000 free scans per day.");
    }
    if (res.status === 400) {
      throw new Error("Invalid URL — make sure the site is publicly accessible (not localhost).");
    }
    if (res.status === 500 || res.status === 503) {
      throw new Error("Google PageSpeed Insights is temporarily unavailable. Try again in a few minutes.");
    }
    throw new Error(`PageSpeed Insights returned an error (${res.status}). Check that the URL is correct and the site is online.`);
  }

  const data = await res.json();
  return parsePsiResponse(data, strategy, url);
}

function parsePsiResponse(data: any, strategy: "mobile" | "desktop", requestUrl?: string): LighthouseResult {
  const lhr = data.lighthouseResult;
  if (!lhr) throw new Error("Invalid PSI response: missing lighthouseResult");

  const categories = lhr.categories ?? {};
  const audits = lhr.audits ?? {};

  // Scores
  const scores = {
    performance: Math.round((categories.performance?.score ?? 0) * 100),
    accessibility: Math.round((categories.accessibility?.score ?? 0) * 100),
    seo: Math.round((categories.seo?.score ?? 0) * 100),
    bestPractices: Math.round((categories["best-practices"]?.score ?? 0) * 100),
  };

  // Core Web Vitals
  const coreWebVitals = {
    lcp: extractMetricMs(audits["largest-contentful-paint"]),
    cls: extractMetricValue(audits["cumulative-layout-shift"]),
    inp: extractMetricMs(audits["interaction-to-next-paint"] ?? audits["max-potential-fid"]),
    fcp: extractMetricMs(audits["first-contentful-paint"]),
    ttfb: extractMetricMs(audits["server-response-time"]),
  };

  // Opportunities (performance improvements)
  const opportunities: LighthouseOpportunity[] = [];
  for (const [id, audit] of Object.entries(audits) as [string, any][]) {
    if (audit.details?.type === "opportunity" && audit.score !== null && audit.score < 1) {
      opportunities.push({
        id,
        title: audit.title ?? id,
        description: stripMarkdownLinks(audit.description ?? ""),
        savingsMs: audit.details.overallSavingsMs,
        savingsBytes: audit.details.overallSavingsBytes,
        score: audit.score,
      });
    }
  }
  opportunities.sort((a, b) => (a.score ?? 1) - (b.score ?? 1));

  // Diagnostics
  const diagnostics: LighthouseDiagnostic[] = [];
  const diagIds = [
    "dom-size", "total-byte-weight", "mainthread-work-breakdown",
    "bootup-time", "network-requests", "network-rtt", "network-server-latency",
    "uses-long-cache-ttl", "font-display", "critical-request-chains",
  ];
  for (const id of diagIds) {
    const audit = audits[id];
    if (audit && audit.score !== null && audit.score < 1) {
      diagnostics.push({
        id,
        title: audit.title ?? id,
        description: stripMarkdownLinks(audit.description ?? ""),
        displayValue: audit.displayValue,
      });
    }
  }

  // CrUX field data
  let fieldData: CruxFieldData | undefined;
  const le = data.loadingExperience;
  if (le?.metrics) {
    fieldData = {};
    if (le.metrics.LARGEST_CONTENTFUL_PAINT_MS) {
      fieldData.lcp = {
        p75: le.metrics.LARGEST_CONTENTFUL_PAINT_MS.percentile,
        category: le.metrics.LARGEST_CONTENTFUL_PAINT_MS.category,
      };
    }
    if (le.metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE) {
      fieldData.cls = {
        p75: le.metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100,
        category: le.metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE.category,
      };
    }
    if (le.metrics.INTERACTION_TO_NEXT_PAINT) {
      fieldData.inp = {
        p75: le.metrics.INTERACTION_TO_NEXT_PAINT.percentile,
        category: le.metrics.INTERACTION_TO_NEXT_PAINT.category,
      };
    }
  }

  return {
    url: lhr.finalUrl ?? requestUrl ?? "",
    timestamp: new Date().toISOString(),
    strategy,
    scores,
    coreWebVitals,
    opportunities,
    diagnostics,
    fieldData,
    engine: "psi",
  };
}

function extractMetricMs(audit: any): number {
  if (!audit) return 0;
  return audit.numericValue ?? 0;
}

function extractMetricValue(audit: any): number {
  if (!audit) return 0;
  return audit.numericValue ?? 0;
}

function stripMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}
