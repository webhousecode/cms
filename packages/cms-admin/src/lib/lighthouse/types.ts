/**
 * F98 — Lighthouse Audit types.
 */

export interface LighthouseScore {
  performance: number;
  accessibility: number;
  seo: number;
  bestPractices: number;
}

export interface LighthouseResult {
  url: string;
  timestamp: string;
  strategy: "mobile" | "desktop";
  scores: LighthouseScore;
  coreWebVitals?: {
    lcp: number;    // Largest Contentful Paint (ms)
    cls: number;    // Cumulative Layout Shift
    inp: number;    // Interaction to Next Paint (ms)
    fcp: number;    // First Contentful Paint (ms)
    ttfb: number;   // Time to First Byte (ms)
  };
  opportunities: LighthouseOpportunity[];
  diagnostics: LighthouseDiagnostic[];
  fieldData?: CruxFieldData;
  engine: "psi" | "lighthouse-local";
}

export interface LighthouseOpportunity {
  id: string;
  title: string;
  description: string;
  savingsMs?: number;
  savingsBytes?: number;
  score: number | null;
}

export interface LighthouseDiagnostic {
  id: string;
  title: string;
  description: string;
  displayValue?: string;
}

export interface CruxFieldData {
  lcp?: { p75: number; category: "FAST" | "AVERAGE" | "SLOW" };
  cls?: { p75: number; category: "FAST" | "AVERAGE" | "SLOW" };
  inp?: { p75: number; category: "FAST" | "AVERAGE" | "SLOW" };
}

export interface ScoreHistoryEntry {
  timestamp: string;
  url: string;
  strategy: "mobile" | "desktop";
  scores: LighthouseScore;
  engine: "psi" | "lighthouse-local";
}

/** Score color thresholds (Google's official) */
export function scoreColor(score: number): "green" | "orange" | "red" {
  if (score >= 90) return "green";
  if (score >= 50) return "orange";
  return "red";
}

export const SCORE_COLOR_MAP = {
  green: "#0cce6b",
  orange: "#ffa400",
  red: "#ff4e42",
} as const;
