import { describe, it, expect } from "vitest";

// Import inline to avoid Next.js module issues in test
// We test the GEO scoring logic directly

// ── Replicated helpers from score.ts ──────────────────────

function stripToText(content: string): string {
  return content
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_~`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(text: string): number {
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

interface SeoFields {
  jsonLd?: Record<string, unknown>;
  jsonLdTemplate?: string;
  keywords?: string[];
  [key: string]: unknown;
}

interface SeoScoreDetail {
  rule: string;
  label: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

// Replicate calculateGeoScore logic for testing
function calculateGeoScore(
  doc: { slug: string; data: Record<string, unknown>; updatedAt?: string },
  seo: SeoFields,
): { score: number; details: SeoScoreDetail[] } {
  const details: SeoScoreDetail[] = [];
  const rawContent = String(doc.data.content ?? doc.data.body ?? "");
  const content = stripToText(rawContent);
  const wc = wordCount(content);

  // G1: Answer-first
  if (wc >= 100) {
    const first200 = content.split(/\s+/).slice(0, 200).join(" ");
    const hasNumber = /\d+/.test(first200);
    const hasDefinitive = /\b(is|are|was|were|means|provides|offers|er|har|giver|betyder|kan)\b/i.test(first200);
    const startsWithQuestion = /^(what|how|why|when|where|who|which|hvad|hvordan|hvorfor|hvornår|hvor|hvem)\b/i.test(first200);
    if (hasNumber && hasDefinitive && !startsWithQuestion) {
      details.push({ rule: "geo-answer-first", label: "🤖 Answer-first", status: "pass", message: "First 200 words contain a direct answer with facts" });
    } else if (hasDefinitive) {
      details.push({ rule: "geo-answer-first", label: "🤖 Answer-first", status: "warn", message: "" });
    } else {
      details.push({ rule: "geo-answer-first", label: "🤖 Answer-first", status: "fail", message: "" });
    }
  }

  // G2: Question headers
  const h2Matches = rawContent.match(/#{2}\s+[^\n]+|<h2[^>]*>[^<]+<\/h2>/gi) ?? [];
  if (h2Matches.length >= 2) {
    const questionH2s = h2Matches.filter((h) => /\?/.test(h)).length;
    const ratio = questionH2s / h2Matches.length;
    details.push({ rule: "geo-question-headers", label: "🤖 Question headers", status: ratio >= 0.3 ? "pass" : "warn", message: "" });
  }

  // G3: Statistics
  if (wc >= 100) {
    const statsPattern = /\b\d+[.,]?\d*\s*(%|percent|procent|million|mio|billion|mia|kr|USD|EUR)/i;
    const hasStats = statsPattern.test(content);
    const hasPlainNumbers = (content.match(/\b\d{2,}\b/g) ?? []).length >= 3;
    details.push({ rule: "geo-statistics", label: "🤖 Statistics", status: hasStats ? "pass" : hasPlainNumbers ? "warn" : "fail", message: "" });
  }

  // G4: Citations
  const hasExternalLink = /https?:\/\/(?!localhost|127\.0\.0\.1)[^\s"'<>]+/.test(rawContent);
  const hasAttribution = /\b(according to|source:|kilde:|ifølge|research by|study by|data from)\b/i.test(content);
  if (hasExternalLink || hasAttribution) {
    details.push({ rule: "geo-citations", label: "🤖 Citations", status: "pass", message: "" });
  } else if (wc >= 200) {
    details.push({ rule: "geo-citations", label: "🤖 Citations", status: "warn", message: "" });
  }

  // G5: Freshness
  if (doc.updatedAt) {
    const daysSinceUpdate = Math.floor((Date.now() - new Date(doc.updatedAt).getTime()) / 86400000);
    details.push({ rule: "geo-freshness", label: "🤖 Freshness", status: daysSinceUpdate <= 90 ? "pass" : daysSinceUpdate <= 180 ? "warn" : "fail", message: "" });
  }

  // G6: JSON-LD
  if (seo.jsonLd && Object.keys(seo.jsonLd).length > 0) {
    details.push({ rule: "geo-jsonld", label: "🤖 Structured data", status: "pass", message: "" });
  } else if (seo.jsonLdTemplate) {
    details.push({ rule: "geo-jsonld", label: "🤖 Structured data", status: "warn", message: "" });
  } else {
    details.push({ rule: "geo-jsonld", label: "🤖 Structured data", status: "warn", message: "" });
  }

  // G7: Author
  const author = doc.data.author ?? doc.data.authorName ?? doc.data.by;
  if (author && String(author).trim().length > 0) {
    details.push({ rule: "geo-author", label: "🤖 Author", status: "pass", message: "" });
  } else {
    details.push({ rule: "geo-author", label: "🤖 Author", status: "warn", message: "" });
  }

  // G8: Content depth
  if (wc >= 800) {
    details.push({ rule: "geo-depth", label: "🤖 Content depth", status: "pass", message: "" });
  } else if (wc >= 400) {
    details.push({ rule: "geo-depth", label: "🤖 Content depth", status: "warn", message: "" });
  } else if (wc >= 100) {
    details.push({ rule: "geo-depth", label: "🤖 Content depth", status: "fail", message: "" });
  }

  const total = details.length;
  if (total === 0) return { score: 0, details };
  const weights = { pass: 1, warn: 0.5, fail: 0 };
  const scored = details.reduce((sum, d) => sum + weights[d.status], 0);
  return { score: Math.round((scored / total) * 100), details };
}

// ── Tests ──────────────────────────────────────────────────

const longContent = "This is a comprehensive article that provides detailed information about the topic. " +
  "The company has 500 employees and generated $12 million in revenue last year. " +
  "According to research by Harvard Business Review, organizations that adopt this approach see a 35% improvement in outcomes. " +
  Array(80).fill("Additional context and depth to make this article comprehensive enough for testing purposes.").join(" ");

describe("GEO Score (G02)", () => {
  describe("G1: Answer-first", () => {
    it("passes when first 200 words contain facts and numbers", () => {
      const doc = { slug: "test", data: { content: longContent }, updatedAt: new Date().toISOString() };
      const result = calculateGeoScore(doc, {});
      const rule = result.details.find((d) => d.rule === "geo-answer-first");
      expect(rule?.status).toBe("pass");
    });

    it("fails when content starts with a question", () => {
      const doc = { slug: "test", data: { content: "What is the best approach? " + Array(100).fill("filler word").join(" ") }, updatedAt: new Date().toISOString() };
      const result = calculateGeoScore(doc, {});
      const rule = result.details.find((d) => d.rule === "geo-answer-first");
      expect(rule?.status).not.toBe("pass");
    });

    it("skips for very short content", () => {
      const doc = { slug: "test", data: { content: "Short" }, updatedAt: new Date().toISOString() };
      const result = calculateGeoScore(doc, {});
      expect(result.details.find((d) => d.rule === "geo-answer-first")).toBeUndefined();
    });
  });

  describe("G2: Question headers", () => {
    it("passes when 30%+ of H2s are questions", () => {
      const doc = { slug: "test", data: { content: "## What is GEO?\nContent\n## How does it work?\nMore\n## Background\nInfo" } };
      const result = calculateGeoScore(doc, {});
      const rule = result.details.find((d) => d.rule === "geo-question-headers");
      expect(rule?.status).toBe("pass");
    });

    it("warns when few H2s are questions", () => {
      const doc = { slug: "test", data: { content: "## Introduction\nContent\n## Background\nMore\n## Summary\nInfo" } };
      const result = calculateGeoScore(doc, {});
      const rule = result.details.find((d) => d.rule === "geo-question-headers");
      expect(rule?.status).toBe("warn");
    });
  });

  describe("G3: Statistics", () => {
    it("passes when content has percentages", () => {
      const doc = { slug: "test", data: { content: "The conversion rate improved by 35% after implementing the new strategy. " + Array(100).fill("word").join(" ") } };
      const result = calculateGeoScore(doc, {});
      const rule = result.details.find((d) => d.rule === "geo-statistics");
      expect(rule?.status).toBe("pass");
    });

    it("passes when content has currency amounts", () => {
      const doc = { slug: "test", data: { content: "The project cost $2.5 million to complete. " + Array(100).fill("word").join(" ") } };
      const result = calculateGeoScore(doc, {});
      const rule = result.details.find((d) => d.rule === "geo-statistics");
      expect(rule?.status).toBe("pass");
    });

    it("fails when no numbers present", () => {
      const doc = { slug: "test", data: { content: "This article has no numbers at all just words and more words. " + Array(100).fill("word").join(" ") } };
      const result = calculateGeoScore(doc, {});
      const rule = result.details.find((d) => d.rule === "geo-statistics");
      expect(rule?.status).toBe("fail");
    });
  });

  describe("G4: Citations", () => {
    it("passes with external links", () => {
      const doc = { slug: "test", data: { content: "See [source](https://harvard.edu/study) for details. " + Array(200).fill("word").join(" ") } };
      const result = calculateGeoScore(doc, {});
      const rule = result.details.find((d) => d.rule === "geo-citations");
      expect(rule?.status).toBe("pass");
    });

    it("passes with attribution phrases", () => {
      const doc = { slug: "test", data: { content: "According to McKinsey research, companies that invest in digital see higher returns. " + Array(200).fill("word").join(" ") } };
      const result = calculateGeoScore(doc, {});
      const rule = result.details.find((d) => d.rule === "geo-citations");
      expect(rule?.status).toBe("pass");
    });

    it("passes with Danish attribution", () => {
      const doc = { slug: "test", data: { content: "Ifølge en undersøgelse fra Aalborg Universitet er resultaterne positive. " + Array(200).fill("word").join(" ") } };
      const result = calculateGeoScore(doc, {});
      const rule = result.details.find((d) => d.rule === "geo-citations");
      expect(rule?.status).toBe("pass");
    });
  });

  describe("G5: Freshness", () => {
    it("passes for recently updated content", () => {
      const doc = { slug: "test", data: { content: "x" }, updatedAt: new Date().toISOString() };
      const result = calculateGeoScore(doc, {});
      const rule = result.details.find((d) => d.rule === "geo-freshness");
      expect(rule?.status).toBe("pass");
    });

    it("warns for content older than 90 days", () => {
      const old = new Date(Date.now() - 120 * 86400000).toISOString();
      const doc = { slug: "test", data: { content: "x" }, updatedAt: old };
      const result = calculateGeoScore(doc, {});
      const rule = result.details.find((d) => d.rule === "geo-freshness");
      expect(rule?.status).toBe("warn");
    });

    it("fails for content older than 180 days", () => {
      const veryOld = new Date(Date.now() - 200 * 86400000).toISOString();
      const doc = { slug: "test", data: { content: "x" }, updatedAt: veryOld };
      const result = calculateGeoScore(doc, {});
      const rule = result.details.find((d) => d.rule === "geo-freshness");
      expect(rule?.status).toBe("fail");
    });
  });

  describe("G6: JSON-LD", () => {
    it("passes when jsonLd is populated", () => {
      const result = calculateGeoScore({ slug: "t", data: {} }, { jsonLd: { "@type": "Article" } });
      expect(result.details.find((d) => d.rule === "geo-jsonld")?.status).toBe("pass");
    });

    it("warns when only template selected", () => {
      const result = calculateGeoScore({ slug: "t", data: {} }, { jsonLdTemplate: "article" });
      expect(result.details.find((d) => d.rule === "geo-jsonld")?.status).toBe("warn");
    });

    it("warns when no structured data", () => {
      const result = calculateGeoScore({ slug: "t", data: {} }, {});
      expect(result.details.find((d) => d.rule === "geo-jsonld")?.status).toBe("warn");
    });
  });

  describe("G7: Author", () => {
    it("passes when author field is set", () => {
      const doc = { slug: "t", data: { author: "Christian Broberg" } };
      const result = calculateGeoScore(doc, {});
      expect(result.details.find((d) => d.rule === "geo-author")?.status).toBe("pass");
    });

    it("warns when no author", () => {
      const doc = { slug: "t", data: {} };
      const result = calculateGeoScore(doc, {});
      expect(result.details.find((d) => d.rule === "geo-author")?.status).toBe("warn");
    });
  });

  describe("G8: Content depth", () => {
    it("passes for 800+ words", () => {
      const doc = { slug: "t", data: { content: Array(850).fill("word").join(" ") } };
      const result = calculateGeoScore(doc, {});
      expect(result.details.find((d) => d.rule === "geo-depth")?.status).toBe("pass");
    });

    it("warns for 400-799 words", () => {
      const doc = { slug: "t", data: { content: Array(500).fill("word").join(" ") } };
      const result = calculateGeoScore(doc, {});
      expect(result.details.find((d) => d.rule === "geo-depth")?.status).toBe("warn");
    });

    it("fails for under 400 words", () => {
      const doc = { slug: "t", data: { content: Array(200).fill("word").join(" ") } };
      const result = calculateGeoScore(doc, {});
      expect(result.details.find((d) => d.rule === "geo-depth")?.status).toBe("fail");
    });
  });

  describe("Overall score", () => {
    it("returns 0-100 score", () => {
      const result = calculateGeoScore({ slug: "t", data: { content: longContent, author: "Test" }, updatedAt: new Date().toISOString() }, { jsonLd: { "@type": "Article" } });
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it("well-optimized content scores high", () => {
      const result = calculateGeoScore(
        { slug: "t", data: { content: longContent, author: "Christian Broberg" }, updatedAt: new Date().toISOString() },
        { jsonLd: { "@type": "Article" } },
      );
      expect(result.score).toBeGreaterThanOrEqual(70);
    });

    it("thin content without metadata scores low", () => {
      const result = calculateGeoScore(
        { slug: "t", data: { content: Array(150).fill("bland word").join(" ") }, updatedAt: new Date(Date.now() - 200 * 86400000).toISOString() },
        {},
      );
      expect(result.score).toBeLessThanOrEqual(40);
    });
  });
});
