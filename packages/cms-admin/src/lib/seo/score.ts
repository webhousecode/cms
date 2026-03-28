/**
 * F97 — SEO Score Calculator
 *
 * Evaluates a document's SEO health against 13 rules.
 * Returns a 0-100 score with per-rule pass/warn/fail details.
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
): SeoScoreResult {
  const details: SeoScoreDetail[] = [];
  const content = stripToText(String(doc.data.content ?? doc.data.body ?? ""));
  const title = String(doc.data.title ?? "");
  const keywords = seo.keywords ?? [];

  // 1. Meta title length (30-60 chars)
  const mt = seo.metaTitle ?? "";
  if (!mt) {
    details.push({ rule: "meta-title", label: "Meta title", status: "fail", message: "Meta title is missing. Write a title for search results (30-60 characters)." });
  } else if (mt.length < 30) {
    details.push({ rule: "meta-title", label: "Meta title", status: "warn", message: `Meta title is too short (${mt.length} characters). Add more words to reach 30-60 characters.` });
  } else if (mt.length > 60) {
    details.push({ rule: "meta-title", label: "Meta title", status: "warn", message: `Meta title is too long (${mt.length} characters). Google cuts off after 60. Shorten it.` });
  } else {
    details.push({ rule: "meta-title", label: "Meta title", status: "pass", message: `Meta title length is good (${mt.length}/60 characters)` });
  }

  // 2. Meta description length (120-160 chars)
  const md = seo.metaDescription ?? "";
  if (!md) {
    details.push({ rule: "meta-desc", label: "Meta description", status: "fail", message: "Meta description is missing. Write a description for search results (120-160 characters)." });
  } else if (md.length < 120) {
    details.push({ rule: "meta-desc", label: "Meta description", status: "warn", message: `Meta description is too short (${md.length} characters). Add ${120 - md.length} more characters to reach 120.` });
  } else if (md.length > 160) {
    details.push({ rule: "meta-desc", label: "Meta description", status: "warn", message: `Meta description is too long (${md.length} characters). Google cuts off after 160. Remove ${md.length - 160} characters.` });
  } else {
    details.push({ rule: "meta-desc", label: "Meta description", status: "pass", message: `Meta description length is good (${md.length}/160 characters)` });
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
