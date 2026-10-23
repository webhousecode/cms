import { translate, type Dict } from "@broberg/i18n";
import enLibText from "@/i18n/messages/en/libText.json";

/**
 * F97 + F112 — SEO & GEO Score Calculator
 *
 * SEO: 13 classic rules for search engine visibility.
 * GEO: 8 rules for AI/generative engine citation-friendliness.
 * Combined "Visibility Score" weights both equally.
 */

/**
 * F211.2 — rule texts follow the ADMIN language. score.ts is synchronous and runs
 * in the browser (SEO panel) and on the server, so the caller passes its own
 * translator: useT() on the client, await getServerTSafe() on the server.
 * Without one, the texts are English (the catalog's source language).
 */
export type ScoreTranslator = (key: string, vars?: Record<string, string | number>) => string;

const englishT: ScoreTranslator = (key, vars) =>
  translate({ en: { libText: enLibText } } as Record<string, Dict>, "en", key, vars);

export interface SeoFields {
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string[];
  ogImage?: string;
  ogTitle?: string;
  ogDescription?: string;
  canonical?: string;
  robots?: string;
  score?: number;
  scoreDetails?: SeoScoreDetail[];
  lastOptimized?: string;
  /** JSON-LD structured data output */
  jsonLd?: Record<string, unknown>;
  /** Selected JSON-LD template ID */
  jsonLdTemplate?: string;
  /** User-filled values for the JSON-LD template fields */
  jsonLdValues?: Record<string, string>;
}

export interface SeoScoreDetail {
  rule: string;
  label: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

export interface SeoScoreResult {
  score: number;
  details: SeoScoreDetail[];
}

export interface GeoScoreResult {
  score: number;
  details: SeoScoreDetail[];
}

export interface VisibilityScoreResult {
  seo: SeoScoreResult;
  geo: GeoScoreResult;
  combined: number; // (seo × 0.5) + (geo × 0.5)
}

/** Extract plain text from markdown/HTML content */
function stripToText(content: string): string {
  return content
    .replace(/<[^>]+>/g, " ")          // strip HTML tags
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")  // strip markdown images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // markdown links → text
    .replace(/[#*_~`>]/g, "")          // strip markdown formatting
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(text: string): number {
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

function keywordInText(text: string, keywords: string[]): boolean {
  if (!keywords.length || !text) return false;
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

/**
 * Simplified readability score (0-100).
 * Based on average sentence length and average word length.
 * Language-agnostic approach since content can be Danish or English.
 */
export function calculateReadability(text: string): number {
  const clean = text.trim();
  if (!clean) return 0;

  // Count sentences: split on . ! ? followed by space or end of string
  const sentences = clean.split(/[.!?](?:\s|$)/).filter((s) => s.trim().length > 0);
  const sentenceCount = Math.max(sentences.length, 1);

  // Count words
  const words = clean.split(/\s+/).filter((w) => w.length > 0);
  const wordsCount = words.length;
  if (wordsCount === 0) return 0;

  // Count syllables: approximate by counting vowel groups per word
  const vowelPattern = /[aeiouyæøå]+/gi;
  let totalSyllables = 0;
  for (const word of words) {
    const matches = word.match(vowelPattern);
    totalSyllables += matches ? Math.max(matches.length, 1) : 1;
  }

  // Flesch Reading Ease
  const avgSentenceLen = wordsCount / sentenceCount;
  const avgSyllablesPerWord = totalSyllables / wordsCount;
  const score = 206.835 - 1.015 * avgSentenceLen - 84.6 * avgSyllablesPerWord;

  // Clamp to 0-100
  return Math.round(Math.max(0, Math.min(100, score)));
}

export function calculateSeoScore(
  doc: { slug: string; data: Record<string, unknown> },
  seo: SeoFields,
  allTitles?: string[],
  locale?: string,
  t?: ScoreTranslator,
): SeoScoreResult {
  const tr = t ?? englishT;
  const details: SeoScoreDetail[] = [];
  const content = stripToText(String(doc.data.content ?? doc.data.body ?? ""));
  const title = String(doc.data.title ?? "");
  const keywords = seo.keywords ?? [];

  // Locale-aware character limits
  const { getSeoLimits } = require("@/lib/ai/locale-prompt");
  const limits = getSeoLimits(locale ?? "en");

  // 1. Meta title length
  const mt = seo.metaTitle ?? "";
  if (!mt) {
    details.push({ rule: "meta-title", label: tr("libText.seoScore.labelMetaTitle"), status: "fail", message: tr("libText.seoScore.metaTitleMissing", { min: limits.titleMin, max: limits.titleMax }) });
  } else if (mt.length < limits.titleMin) {
    details.push({ rule: "meta-title", label: tr("libText.seoScore.labelMetaTitle"), status: "warn", message: tr("libText.seoScore.metaTitleShort", { len: mt.length, min: limits.titleMin, max: limits.titleMax }) });
  } else if (mt.length > limits.titleMax) {
    details.push({ rule: "meta-title", label: tr("libText.seoScore.labelMetaTitle"), status: "warn", message: tr("libText.seoScore.metaTitleLong", { len: mt.length, max: limits.titleMax }) });
  } else {
    details.push({ rule: "meta-title", label: tr("libText.seoScore.labelMetaTitle"), status: "pass", message: tr("libText.seoScore.metaTitleGood", { len: mt.length, max: limits.titleMax }) });
  }

  // 2. Meta description length
  const md = seo.metaDescription ?? "";
  if (!md) {
    details.push({ rule: "meta-desc", label: tr("libText.seoScore.labelMetaDesc"), status: "fail", message: tr("libText.seoScore.metaDescMissing", { min: limits.descMin, max: limits.descMax }) });
  } else if (md.length < limits.descMin) {
    details.push({ rule: "meta-desc", label: tr("libText.seoScore.labelMetaDesc"), status: "warn", message: tr("libText.seoScore.metaDescShort", { len: md.length, add: limits.descMin - md.length, min: limits.descMin }) });
  } else if (md.length > limits.descMax) {
    details.push({ rule: "meta-desc", label: tr("libText.seoScore.labelMetaDesc"), status: "warn", message: tr("libText.seoScore.metaDescLong", { len: md.length, max: limits.descMax, remove: md.length - limits.descMax }) });
  } else {
    details.push({ rule: "meta-desc", label: tr("libText.seoScore.labelMetaDesc"), status: "pass", message: tr("libText.seoScore.metaDescGood", { len: md.length, max: limits.descMax }) });
  }

  // 3. Keyword in meta title
  if (keywords.length > 0 && mt) {
    if (keywordInText(mt, keywords)) {
      details.push({ rule: "keyword-title", label: tr("libText.seoScore.labelKeywordTitle"), status: "pass", message: tr("libText.seoScore.keywordInTitle", { keyword: keywords[0] }) });
    } else {
      details.push({ rule: "keyword-title", label: tr("libText.seoScore.labelKeywordTitle"), status: "warn", message: tr("libText.seoScore.keywordNotInTitle", { keyword: keywords[0] }) });
    }
  }

  // 4. Keyword in meta description
  if (keywords.length > 0 && md) {
    if (keywordInText(md, keywords)) {
      details.push({ rule: "keyword-desc", label: tr("libText.seoScore.labelKeywordDesc"), status: "pass", message: tr("libText.seoScore.keywordInDesc", { keyword: keywords[0] }) });
    } else {
      details.push({ rule: "keyword-desc", label: tr("libText.seoScore.labelKeywordDesc"), status: "warn", message: tr("libText.seoScore.keywordNotInDesc", { keyword: keywords[0] }) });
    }
  }

  // 5. Content length (min 300 words)
  const wc = wordCount(content);
  if (wc < 100) {
    details.push({ rule: "content-length", label: tr("libText.seoScore.labelContentLength"), status: "fail", message: tr("libText.seoScore.contentTooThin", { wc }) });
  } else if (wc < 300) {
    details.push({ rule: "content-length", label: tr("libText.seoScore.labelContentLength"), status: "warn", message: tr("libText.seoScore.contentShort", { wc, more: 300 - wc }) });
  } else {
    details.push({ rule: "content-length", label: tr("libText.seoScore.labelContentLength"), status: "pass", message: tr("libText.seoScore.contentGood", { wc }) });
  }

  // 6. Heading structure (has H2s)
  const rawContent = String(doc.data.content ?? doc.data.body ?? "");
  const hasH2 = /#{2}\s|<h2/i.test(rawContent);
  if (hasH2) {
    details.push({ rule: "headings", label: tr("libText.seoScore.labelHeadings"), status: "pass", message: tr("libText.seoScore.headingsGood") });
  } else if (wc > 200) {
    details.push({ rule: "headings", label: tr("libText.seoScore.labelHeadings"), status: "warn", message: tr("libText.seoScore.headingsMissing") });
  }

  // 7. Images have alt text
  const imgMatches = rawContent.match(/!\[([^\]]*)\]/g) ?? [];
  const imgsWithoutAlt = imgMatches.filter((m) => m === "![]").length;
  const htmlImgs = rawContent.match(/<img[^>]*>/gi) ?? [];
  const htmlImgsWithoutAlt = htmlImgs.filter((m) => !m.includes("alt=") || /alt=["']\s*["']/i.test(m)).length;
  const totalMissing = imgsWithoutAlt + htmlImgsWithoutAlt;
  const totalImgs = imgMatches.length + htmlImgs.length;
  if (totalImgs === 0) {
    // No images — not a fail, just skip
  } else if (totalMissing > 0) {
    details.push({ rule: "img-alt", label: tr("libText.seoScore.labelImgAlt"), status: "warn", message: tr("libText.seoScore.imgAltMissing", { missing: totalMissing, total: totalImgs }) });
  } else {
    details.push({ rule: "img-alt", label: tr("libText.seoScore.labelImgAlt"), status: "pass", message: tr("libText.seoScore.imgAltGood", { total: totalImgs }) });
  }

  // 8. OG image
  if (seo.ogImage) {
    details.push({ rule: "og-image", label: tr("libText.seoScore.labelOgImage"), status: "pass", message: tr("libText.seoScore.ogImageSet") });
  } else {
    details.push({ rule: "og-image", label: tr("libText.seoScore.labelOgImage"), status: "warn", message: tr("libText.seoScore.ogImageMissing") });
  }

  // 9. Keyword in URL slug
  if (keywords.length > 0) {
    const slugLower = doc.slug.toLowerCase();
    if (keywords.some((k) => slugLower.includes(k.toLowerCase().replace(/\s+/g, "-")))) {
      details.push({ rule: "keyword-slug", label: tr("libText.seoScore.labelKeywordSlug"), status: "pass", message: tr("libText.seoScore.keywordInSlug", { keyword: keywords[0] }) });
    } else {
      details.push({ rule: "keyword-slug", label: tr("libText.seoScore.labelKeywordSlug"), status: "warn", message: tr("libText.seoScore.keywordNotInSlug", { keyword: keywords[0], slug: doc.slug }) });
    }
  }

  // 10. Internal links
  const hasInternalLinks = /\]\(\/|href=["']\//.test(rawContent);
  if (hasInternalLinks) {
    details.push({ rule: "internal-links", label: tr("libText.seoScore.labelInternalLinks"), status: "pass", message: tr("libText.seoScore.internalLinksGood") });
  } else if (wc > 200) {
    details.push({ rule: "internal-links", label: tr("libText.seoScore.labelInternalLinks"), status: "warn", message: tr("libText.seoScore.internalLinksMissing") });
  }

  // 11. Document has title
  if (title) {
    details.push({ rule: "title", label: tr("libText.seoScore.labelTitle"), status: "pass", message: tr("libText.seoScore.titleGood") });
  } else {
    details.push({ rule: "title", label: tr("libText.seoScore.labelTitle"), status: "fail", message: tr("libText.seoScore.titleMissing") });
  }

  // 12. Readability (only if 100+ words)
  if (wc >= 100) {
    const readability = calculateReadability(content);
    if (readability >= 60) {
      details.push({ rule: "readability", label: tr("libText.seoScore.labelReadability"), status: "pass", message: tr("libText.seoScore.readabilityEasy", { score: readability }) });
    } else if (readability >= 30) {
      details.push({ rule: "readability", label: tr("libText.seoScore.labelReadability"), status: "warn", message: tr("libText.seoScore.readabilityMedium", { score: readability }) });
    } else {
      details.push({ rule: "readability", label: tr("libText.seoScore.labelReadability"), status: "fail", message: tr("libText.seoScore.readabilityHard", { score: readability }) });
    }
  }

  // 13. Unique title
  if (allTitles && mt) {
    const mtLower = mt.toLowerCase();
    const duplicates = allTitles.filter((t) => t.toLowerCase() === mtLower).length;
    if (duplicates > 1) {
      details.push({ rule: "duplicate-title", label: tr("libText.seoScore.labelUniqueTitle"), status: "warn", message: tr("libText.seoScore.titleDuplicate", { title: mt, count: duplicates }) });
    } else {
      details.push({ rule: "duplicate-title", label: tr("libText.seoScore.labelUniqueTitle"), status: "pass", message: tr("libText.seoScore.titleUnique") });
    }
  }

  // Calculate score
  const total = details.length;
  if (total === 0) return { score: 0, details };

  const weights = { pass: 1, warn: 0.5, fail: 0 };
  const scored = details.reduce((sum, d) => sum + weights[d.status], 0);
  const score = Math.round((scored / total) * 100);

  return { score, details };
}

// ── GEO Score (F112 G02) ───────────────────────────────────

/**
 * Calculate GEO score — 8 rules for AI/generative engine visibility.
 * These check how citation-friendly the content is for AI platforms.
 */
export function calculateGeoScore(
  doc: { slug: string; data: Record<string, unknown>; updatedAt?: string },
  seo: SeoFields,
  t?: ScoreTranslator,
): GeoScoreResult {
  const tr = t ?? englishT;
  const details: SeoScoreDetail[] = [];
  const rawContent = String(doc.data.content ?? doc.data.body ?? "");
  const content = stripToText(rawContent);
  const wc = wordCount(content);

  // G1: Answer-first — first 200 words should contain a direct answer
  if (wc >= 100) {
    const first200 = content.split(/\s+/).slice(0, 200).join(" ");
    // Heuristic: first paragraph contains a fact (number, percentage, or definitive statement)
    const hasNumber = /\d+/.test(first200);
    const hasDefinitive = /\b(is|are|was|were|means|provides|offers|er|har|giver|betyder|kan)\b/i.test(first200);
    const startsWithQuestion = /^(what|how|why|when|where|who|which|hvad|hvordan|hvorfor|hvornår|hvor|hvem)\b/i.test(first200);

    if (hasNumber && hasDefinitive && !startsWithQuestion) {
      details.push({ rule: "geo-answer-first", label: tr("libText.seoScore.labelGeoAnswerFirst"), status: "pass", message: tr("libText.seoScore.geoAnswerFirstPass") });
    } else if (hasDefinitive) {
      details.push({ rule: "geo-answer-first", label: tr("libText.seoScore.labelGeoAnswerFirst"), status: "warn", message: tr("libText.seoScore.geoAnswerFirstWarn") });
    } else {
      details.push({ rule: "geo-answer-first", label: tr("libText.seoScore.labelGeoAnswerFirst"), status: "fail", message: tr("libText.seoScore.geoAnswerFirstFail") });
    }
  }

  // G2: Question headers — at least 30% of H2s should be questions
  const h2Matches = rawContent.match(/#{2}\s+[^\n]+|<h2[^>]*>[^<]+<\/h2>/gi) ?? [];
  if (h2Matches.length >= 2) {
    const questionH2s = h2Matches.filter((h) => /\?/.test(h)).length;
    const ratio = questionH2s / h2Matches.length;
    if (ratio >= 0.3) {
      details.push({ rule: "geo-question-headers", label: tr("libText.seoScore.labelGeoQuestionHeaders"), status: "pass", message: tr("libText.seoScore.geoQuestionHeadersPass", { questions: questionH2s, total: h2Matches.length, pct: Math.round(ratio * 100) }) });
    } else {
      details.push({ rule: "geo-question-headers", label: tr("libText.seoScore.labelGeoQuestionHeaders"), status: "warn", message: tr("libText.seoScore.geoQuestionHeadersWarn", { questions: questionH2s, total: h2Matches.length }) });
    }
  }

  // G3: Statistics present — content contains numbers/percentages/data
  if (wc >= 100) {
    const statsPattern = /\b\d+[.,]?\d*\s*(%|percent|procent|million|mio|billion|mia|kr|USD|EUR)/i;
    const hasStats = statsPattern.test(content);
    const hasPlainNumbers = (content.match(/\b\d{2,}\b/g) ?? []).length >= 3;
    if (hasStats) {
      details.push({ rule: "geo-statistics", label: tr("libText.seoScore.labelGeoStatistics"), status: "pass", message: tr("libText.seoScore.geoStatisticsPass") });
    } else if (hasPlainNumbers) {
      details.push({ rule: "geo-statistics", label: tr("libText.seoScore.labelGeoStatistics"), status: "warn", message: tr("libText.seoScore.geoStatisticsWarn") });
    } else {
      details.push({ rule: "geo-statistics", label: tr("libText.seoScore.labelGeoStatistics"), status: "fail", message: tr("libText.seoScore.geoStatisticsFail") });
    }
  }

  // G4: Citations/sources — references external sources
  const hasExternalLink = /https?:\/\/(?!localhost|127\.0\.0\.1)[^\s"'<>]+/.test(rawContent);
  const hasAttribution = /\b(according to|source:|kilde:|ifølge|research by|study by|data from)\b/i.test(content);
  if (hasExternalLink || hasAttribution) {
    details.push({ rule: "geo-citations", label: tr("libText.seoScore.labelGeoCitations"), status: "pass", message: tr("libText.seoScore.geoCitationsPass") });
  } else if (wc >= 200) {
    details.push({ rule: "geo-citations", label: tr("libText.seoScore.labelGeoCitations"), status: "warn", message: tr("libText.seoScore.geoCitationsWarn") });
  }

  // G5: Content freshness — updated within 90 days
  if (doc.updatedAt) {
    const daysSinceUpdate = Math.floor((Date.now() - new Date(doc.updatedAt).getTime()) / 86400000);
    if (daysSinceUpdate <= 90) {
      details.push({ rule: "geo-freshness", label: tr("libText.seoScore.labelGeoFreshness"), status: "pass", message: tr("libText.seoScore.geoFreshnessPass", { days: daysSinceUpdate }) });
    } else if (daysSinceUpdate <= 180) {
      details.push({ rule: "geo-freshness", label: tr("libText.seoScore.labelGeoFreshness"), status: "warn", message: tr("libText.seoScore.geoFreshnessWarn", { days: daysSinceUpdate }) });
    } else {
      details.push({ rule: "geo-freshness", label: tr("libText.seoScore.labelGeoFreshness"), status: "fail", message: tr("libText.seoScore.geoFreshnessFail", { days: daysSinceUpdate }) });
    }
  }

  // G6: JSON-LD configured — structured data helps AI understand content
  if (seo.jsonLd && Object.keys(seo.jsonLd).length > 0) {
    details.push({ rule: "geo-jsonld", label: tr("libText.seoScore.labelGeoJsonLd"), status: "pass", message: tr("libText.seoScore.geoJsonLdPass") });
  } else if (seo.jsonLdTemplate) {
    details.push({ rule: "geo-jsonld", label: tr("libText.seoScore.labelGeoJsonLd"), status: "warn", message: tr("libText.seoScore.geoJsonLdPartial") });
  } else {
    details.push({ rule: "geo-jsonld", label: tr("libText.seoScore.labelGeoJsonLd"), status: "warn", message: tr("libText.seoScore.geoJsonLdMissing") });
  }

  // G7: Author attribution — E-E-A-T signal
  const author = doc.data.author ?? doc.data.authorName ?? doc.data.by;
  if (author && String(author).trim().length > 0) {
    details.push({ rule: "geo-author", label: tr("libText.seoScore.labelGeoAuthor"), status: "pass", message: tr("libText.seoScore.geoAuthorPass", { author: String(author) }) });
  } else {
    details.push({ rule: "geo-author", label: tr("libText.seoScore.labelGeoAuthor"), status: "warn", message: tr("libText.seoScore.geoAuthorMissing") });
  }

  // G8: Content depth — AI prefers comprehensive content
  if (wc >= 800) {
    details.push({ rule: "geo-depth", label: tr("libText.seoScore.labelGeoDepth"), status: "pass", message: tr("libText.seoScore.geoDepthPass", { wc }) });
  } else if (wc >= 400) {
    details.push({ rule: "geo-depth", label: tr("libText.seoScore.labelGeoDepth"), status: "warn", message: tr("libText.seoScore.geoDepthWarn", { wc }) });
  } else if (wc >= 100) {
    details.push({ rule: "geo-depth", label: tr("libText.seoScore.labelGeoDepth"), status: "fail", message: tr("libText.seoScore.geoDepthFail", { wc }) });
  }

  // Calculate score
  const total = details.length;
  if (total === 0) return { score: 0, details };

  const weights = { pass: 1, warn: 0.5, fail: 0 };
  const scored = details.reduce((sum, d) => sum + weights[d.status], 0);
  const score = Math.round((scored / total) * 100);

  return { score, details };
}

/**
 * Calculate combined Visibility Score — SEO + GEO weighted equally.
 */
export function calculateVisibilityScore(
  doc: { slug: string; data: Record<string, unknown>; updatedAt?: string },
  seo: SeoFields,
  allTitles?: string[],
  locale?: string,
  t?: ScoreTranslator,
): VisibilityScoreResult {
  const seoResult = calculateSeoScore(doc, seo, allTitles, locale, t);
  const geoResult = calculateGeoScore(doc, seo, t);
  const combined = Math.round((seoResult.score * 0.5) + (geoResult.score * 0.5));
  return { seo: seoResult, geo: geoResult, combined };
}
