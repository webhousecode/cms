/**
 * F97 + F112 — SEO & GEO Score Calculator
 *
 * SEO: 13 classic rules for search engine visibility.
 * GEO: 8 rules for AI/generative engine citation-friendliness.
 * Combined "Visibility Score" weights both equally.
 */

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
): SeoScoreResult {
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
    details.push({ rule: "meta-title", label: "Meta title", status: "fail", message: `Meta title is missing. Write a title for search results (${limits.titleMin}-${limits.titleMax} characters).` });
  } else if (mt.length < limits.titleMin) {
    details.push({ rule: "meta-title", label: "Meta title", status: "warn", message: `Meta title is too short (${mt.length} characters). Add more words to reach ${limits.titleMin}-${limits.titleMax} characters.` });
  } else if (mt.length > limits.titleMax) {
    details.push({ rule: "meta-title", label: "Meta title", status: "warn", message: `Meta title is too long (${mt.length} characters). Google cuts off after ${limits.titleMax}. Shorten it.` });
  } else {
    details.push({ rule: "meta-title", label: "Meta title", status: "pass", message: `Meta title length is good (${mt.length}/${limits.titleMax} characters)` });
  }

  // 2. Meta description length
  const md = seo.metaDescription ?? "";
  if (!md) {
    details.push({ rule: "meta-desc", label: "Meta description", status: "fail", message: `Meta description is missing. Write a description for search results (${limits.descMin}-${limits.descMax} characters).` });
  } else if (md.length < limits.descMin) {
    details.push({ rule: "meta-desc", label: "Meta description", status: "warn", message: `Meta description is too short (${md.length} characters). Add ${limits.descMin - md.length} more characters to reach ${limits.descMin}.` });
  } else if (md.length > limits.descMax) {
    details.push({ rule: "meta-desc", label: "Meta description", status: "warn", message: `Meta description is too long (${md.length} characters). Google cuts off after ${limits.descMax}. Remove ${md.length - limits.descMax} characters.` });
  } else {
    details.push({ rule: "meta-desc", label: "Meta description", status: "pass", message: `Meta description length is good (${md.length}/${limits.descMax} characters)` });
  }

  // 3. Keyword in meta title
  if (keywords.length > 0 && mt) {
    if (keywordInText(mt, keywords)) {
      details.push({ rule: "keyword-title", label: "Keyword in title", status: "pass", message: `Keyword "${keywords[0]}" found in meta title` });
    } else {
      details.push({ rule: "keyword-title", label: "Keyword in title", status: "warn", message: `Add the keyword "${keywords[0]}" to the meta title field above.` });
    }
  }

  // 4. Keyword in meta description
  if (keywords.length > 0 && md) {
    if (keywordInText(md, keywords)) {
      details.push({ rule: "keyword-desc", label: "Keyword in description", status: "pass", message: `Keyword "${keywords[0]}" found in meta description` });
    } else {
      details.push({ rule: "keyword-desc", label: "Keyword in description", status: "warn", message: `Add the keyword "${keywords[0]}" to the meta description field above.` });
    }
  }

  // 5. Content length (min 300 words)
  const wc = wordCount(content);
  if (wc < 100) {
    details.push({ rule: "content-length", label: "Content length", status: "fail", message: `Content is only ${wc} words. Write at least 300 words for search engines to index properly.` });
  } else if (wc < 300) {
    details.push({ rule: "content-length", label: "Content length", status: "warn", message: `Content is ${wc} words. Write ${300 - wc} more words to reach 300 (recommended minimum).` });
  } else {
    details.push({ rule: "content-length", label: "Content length", status: "pass", message: `Content is ${wc} words (300+ is good)` });
  }

  // 6. Heading structure (has H2s)
  const rawContent = String(doc.data.content ?? doc.data.body ?? "");
  const hasH2 = /#{2}\s|<h2/i.test(rawContent);
  if (hasH2) {
    details.push({ rule: "headings", label: "Heading structure", status: "pass", message: "Content uses H2 headings for structure" });
  } else if (wc > 200) {
    details.push({ rule: "headings", label: "Heading structure", status: "warn", message: "Content has no H2 headings. Break up the text with ## subheadings." });
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
    details.push({ rule: "img-alt", label: "Image alt text", status: "warn", message: `${totalMissing} of ${totalImgs} images are missing alt text. Edit each image and add a description.` });
  } else {
    details.push({ rule: "img-alt", label: "Image alt text", status: "pass", message: `All ${totalImgs} images have alt text` });
  }

  // 8. OG image
  if (seo.ogImage) {
    details.push({ rule: "og-image", label: "Social image", status: "pass", message: "Social sharing image (OG) is set" });
  } else {
    details.push({ rule: "og-image", label: "Social image", status: "warn", message: "No social image set. Add an image in the \"Social image (OG)\" field above — it shows when someone shares this page on Facebook/LinkedIn." });
  }

  // 9. Keyword in URL slug
  if (keywords.length > 0) {
    const slugLower = doc.slug.toLowerCase();
    if (keywords.some((k) => slugLower.includes(k.toLowerCase().replace(/\s+/g, "-")))) {
      details.push({ rule: "keyword-slug", label: "Keyword in URL", status: "pass", message: `Keyword "${keywords[0]}" found in the URL` });
    } else {
      details.push({ rule: "keyword-slug", label: "Keyword in URL", status: "warn", message: `The keyword "${keywords[0]}" is not in the URL slug (${doc.slug}). Consider renaming the slug in Properties.` });
    }
  }

  // 10. Internal links
  const hasInternalLinks = /\]\(\/|href=["']\//.test(rawContent);
  if (hasInternalLinks) {
    details.push({ rule: "internal-links", label: "Internal links", status: "pass", message: "Content links to other pages on the site" });
  } else if (wc > 200) {
    details.push({ rule: "internal-links", label: "Internal links", status: "warn", message: "No internal links. Add links to other pages on your site (e.g. related posts) to improve SEO." });
  }

  // 11. Document has title
  if (title) {
    details.push({ rule: "title", label: "Page title", status: "pass", message: "Page has a title" });
  } else {
    details.push({ rule: "title", label: "Page title", status: "fail", message: "Page has no title. Fill in the Title field at the top of the editor." });
  }

  // 12. Readability (only if 100+ words)
  if (wc >= 100) {
    const readability = calculateReadability(content);
    if (readability >= 60) {
      details.push({ rule: "readability", label: "Readability", status: "pass", message: `Readability score is ${readability}/100 — easy to read` });
    } else if (readability >= 30) {
      details.push({ rule: "readability", label: "Readability", status: "warn", message: `Readability score is ${readability}/100 — consider shorter sentences and simpler words` });
    } else {
      details.push({ rule: "readability", label: "Readability", status: "fail", message: `Readability score is ${readability}/100 — text is very hard to read. Use shorter sentences and simpler words.` });
    }
  }

  // 13. Unique title
  if (allTitles && mt) {
    const mtLower = mt.toLowerCase();
    const duplicates = allTitles.filter((t) => t.toLowerCase() === mtLower).length;
    if (duplicates > 1) {
      details.push({ rule: "duplicate-title", label: "Unique title", status: "warn", message: `Meta title "${mt}" is used by ${duplicates} documents. Each page should have a unique title.` });
    } else {
      details.push({ rule: "duplicate-title", label: "Unique title", status: "pass", message: "Meta title is unique across all documents" });
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
): GeoScoreResult {
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
      details.push({ rule: "geo-answer-first", label: "🤖 Answer-first", status: "pass", message: "First 200 words contain a direct answer with facts" });
    } else if (hasDefinitive) {
      details.push({ rule: "geo-answer-first", label: "🤖 Answer-first", status: "warn", message: "Opening is OK but could lead with a stronger factual answer. Add a number or statistic in the first paragraph." });
    } else {
      details.push({ rule: "geo-answer-first", label: "🤖 Answer-first", status: "fail", message: "Opening doesn't provide a direct answer. Restructure so the first paragraph answers the page's main question." });
    }
  }

  // G2: Question headers — at least 30% of H2s should be questions
  const h2Matches = rawContent.match(/#{2}\s+[^\n]+|<h2[^>]*>[^<]+<\/h2>/gi) ?? [];
  if (h2Matches.length >= 2) {
    const questionH2s = h2Matches.filter((h) => /\?/.test(h)).length;
    const ratio = questionH2s / h2Matches.length;
    if (ratio >= 0.3) {
      details.push({ rule: "geo-question-headers", label: "🤖 Question headers", status: "pass", message: `${questionH2s}/${h2Matches.length} headings are questions (${Math.round(ratio * 100)}% — AI platforms match these to user queries)` });
    } else {
      details.push({ rule: "geo-question-headers", label: "🤖 Question headers", status: "warn", message: `Only ${questionH2s}/${h2Matches.length} headings are questions. Rephrase some H2s as questions (e.g. "How does X work?") — AI platforms match these to queries.` });
    }
  }

  // G3: Statistics present — content contains numbers/percentages/data
  if (wc >= 100) {
    const statsPattern = /\b\d+[.,]?\d*\s*(%|percent|procent|million|mio|billion|mia|kr|USD|EUR)/i;
    const hasStats = statsPattern.test(content);
    const hasPlainNumbers = (content.match(/\b\d{2,}\b/g) ?? []).length >= 3;
    if (hasStats) {
      details.push({ rule: "geo-statistics", label: "🤖 Statistics", status: "pass", message: "Content includes specific statistics — AI platforms prefer citing data-backed claims" });
    } else if (hasPlainNumbers) {
      details.push({ rule: "geo-statistics", label: "🤖 Statistics", status: "warn", message: "Content has numbers but no clear statistics. Add percentages, costs, or measurable data points." });
    } else {
      details.push({ rule: "geo-statistics", label: "🤖 Statistics", status: "fail", message: "No statistics found. Add specific numbers, percentages, or data points — AI systems strongly prefer citable facts." });
    }
  }

  // G4: Citations/sources — references external sources
  const hasExternalLink = /https?:\/\/(?!localhost|127\.0\.0\.1)[^\s"'<>]+/.test(rawContent);
  const hasAttribution = /\b(according to|source:|kilde:|ifølge|research by|study by|data from)\b/i.test(content);
  if (hasExternalLink || hasAttribution) {
    details.push({ rule: "geo-citations", label: "🤖 Citations", status: "pass", message: "Content references external sources — adds credibility for AI citation" });
  } else if (wc >= 200) {
    details.push({ rule: "geo-citations", label: "🤖 Citations", status: "warn", message: "No external sources cited. Add references to research, data sources, or authoritative sites to boost AI trust." });
  }

  // G5: Content freshness — updated within 90 days
  if (doc.updatedAt) {
    const daysSinceUpdate = Math.floor((Date.now() - new Date(doc.updatedAt).getTime()) / 86400000);
    if (daysSinceUpdate <= 90) {
      details.push({ rule: "geo-freshness", label: "🤖 Freshness", status: "pass", message: `Updated ${daysSinceUpdate} days ago — AI platforms have strong recency bias` });
    } else if (daysSinceUpdate <= 180) {
      details.push({ rule: "geo-freshness", label: "🤖 Freshness", status: "warn", message: `Updated ${daysSinceUpdate} days ago. Content older than 90 days gets less AI citation. Refresh key facts.` });
    } else {
      details.push({ rule: "geo-freshness", label: "🤖 Freshness", status: "fail", message: `Updated ${daysSinceUpdate} days ago. Stale content is rarely cited by AI. Update with current information.` });
    }
  }

  // G6: JSON-LD configured — structured data helps AI understand content
  if (seo.jsonLd && Object.keys(seo.jsonLd).length > 0) {
    details.push({ rule: "geo-jsonld", label: "🤖 Structured data", status: "pass", message: "JSON-LD structured data is configured — helps AI systems understand page content" });
  } else if (seo.jsonLdTemplate) {
    details.push({ rule: "geo-jsonld", label: "🤖 Structured data", status: "warn", message: "JSON-LD template selected but not fully configured. Fill in the fields to help AI understand this content." });
  } else {
    details.push({ rule: "geo-jsonld", label: "🤖 Structured data", status: "warn", message: "No JSON-LD structured data. Select a template (Article, FAQ, HowTo) in the Advanced section to help AI categorize this content." });
  }

  // G7: Author attribution — E-E-A-T signal
  const author = doc.data.author ?? doc.data.authorName ?? doc.data.by;
  if (author && String(author).trim().length > 0) {
    details.push({ rule: "geo-author", label: "🤖 Author", status: "pass", message: `Author "${String(author)}" attributed — builds E-E-A-T trust signals for AI` });
  } else {
    details.push({ rule: "geo-author", label: "🤖 Author", status: "warn", message: "No author attributed. Add an author name — AI platforms trust content with clear authorship (E-E-A-T)." });
  }

  // G8: Content depth — AI prefers comprehensive content
  if (wc >= 800) {
    details.push({ rule: "geo-depth", label: "🤖 Content depth", status: "pass", message: `${wc} words — comprehensive enough for AI to cite as an authoritative source` });
  } else if (wc >= 400) {
    details.push({ rule: "geo-depth", label: "🤖 Content depth", status: "warn", message: `${wc} words — add more depth (800+ words) for AI platforms to consider this an authoritative source` });
  } else if (wc >= 100) {
    details.push({ rule: "geo-depth", label: "🤖 Content depth", status: "fail", message: `Only ${wc} words. AI platforms rarely cite thin content. Aim for 800+ words with comprehensive coverage.` });
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
): VisibilityScoreResult {
  const seoResult = calculateSeoScore(doc, seo, allTitles, locale);
  const geoResult = calculateGeoScore(doc, seo);
  const combined = Math.round((seoResult.score * 0.5) + (geoResult.score * 0.5));
  return { seo: seoResult, geo: geoResult, combined };
}
