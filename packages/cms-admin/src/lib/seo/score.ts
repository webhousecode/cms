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

export function calculateSeoScore(
  doc: { slug: string; data: Record<string, unknown> },
  seo: SeoFields,
): SeoScoreResult {
  const details: SeoScoreDetail[] = [];
  const content = stripToText(String(doc.data.content ?? doc.data.body ?? ""));
  const title = String(doc.data.title ?? "");
  const keywords = seo.keywords ?? [];

  // 1. Meta title length (30-60 chars)
  const mt = seo.metaTitle ?? "";
  if (!mt) {
    details.push({ rule: "meta-title", label: "Meta title", status: "fail", message: "Missing — add a meta title (30-60 chars)" });
  } else if (mt.length < 30) {
    details.push({ rule: "meta-title", label: "Meta title", status: "warn", message: `Too short: ${mt.length} chars (aim for 30-60)` });
  } else if (mt.length > 60) {
    details.push({ rule: "meta-title", label: "Meta title", status: "warn", message: `Too long: ${mt.length} chars (max 60, gets truncated)` });
  } else {
    details.push({ rule: "meta-title", label: "Meta title", status: "pass", message: `${mt.length} chars` });
  }

  // 2. Meta description length (120-160 chars)
  const md = seo.metaDescription ?? "";
  if (!md) {
    details.push({ rule: "meta-desc", label: "Meta description", status: "fail", message: "Missing — add a meta description (120-160 chars)" });
  } else if (md.length < 120) {
    details.push({ rule: "meta-desc", label: "Meta description", status: "warn", message: `Short: ${md.length} chars (aim for 120-160)` });
  } else if (md.length > 160) {
    details.push({ rule: "meta-desc", label: "Meta description", status: "warn", message: `Too long: ${md.length} chars (max 160, gets truncated)` });
  } else {
    details.push({ rule: "meta-desc", label: "Meta description", status: "pass", message: `${md.length} chars` });
  }

  // 3. Keyword in meta title
  if (keywords.length > 0 && mt) {
    if (keywordInText(mt, keywords)) {
      details.push({ rule: "keyword-title", label: "Keyword in title", status: "pass", message: "Primary keyword found in meta title" });
    } else {
      details.push({ rule: "keyword-title", label: "Keyword in title", status: "warn", message: "Primary keyword not in meta title" });
    }
  }

  // 4. Keyword in meta description
  if (keywords.length > 0 && md) {
    if (keywordInText(md, keywords)) {
      details.push({ rule: "keyword-desc", label: "Keyword in description", status: "pass", message: "Primary keyword found in meta description" });
    } else {
      details.push({ rule: "keyword-desc", label: "Keyword in description", status: "warn", message: "Primary keyword not in meta description" });
    }
  }

  // 5. Content length (min 300 words)
  const wc = wordCount(content);
  if (wc < 100) {
    details.push({ rule: "content-length", label: "Content length", status: "fail", message: `Only ${wc} words (minimum 300 for SEO)` });
  } else if (wc < 300) {
    details.push({ rule: "content-length", label: "Content length", status: "warn", message: `${wc} words (aim for 300+)` });
  } else {
    details.push({ rule: "content-length", label: "Content length", status: "pass", message: `${wc} words` });
  }

  // 6. Heading structure (has H2s)
  const rawContent = String(doc.data.content ?? doc.data.body ?? "");
  const hasH2 = /#{2}\s|<h2/i.test(rawContent);
  if (hasH2) {
    details.push({ rule: "headings", label: "Heading structure", status: "pass", message: "Content has H2 headings" });
  } else if (wc > 200) {
    details.push({ rule: "headings", label: "Heading structure", status: "warn", message: "Long content without H2 headings — add structure" });
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
    details.push({ rule: "img-alt", label: "Image alt text", status: "warn", message: `${totalMissing}/${totalImgs} image${totalMissing > 1 ? "s" : ""} missing alt text` });
  } else {
    details.push({ rule: "img-alt", label: "Image alt text", status: "pass", message: `All ${totalImgs} images have alt text` });
  }

  // 8. OG image
  if (seo.ogImage) {
    details.push({ rule: "og-image", label: "Social image", status: "pass", message: "OG image set" });
  } else {
    details.push({ rule: "og-image", label: "Social image", status: "warn", message: "No OG image — social shares will lack a preview" });
  }

  // 9. Keyword in URL slug
  if (keywords.length > 0) {
    const slugLower = doc.slug.toLowerCase();
    if (keywords.some((k) => slugLower.includes(k.toLowerCase().replace(/\s+/g, "-")))) {
      details.push({ rule: "keyword-slug", label: "Keyword in URL", status: "pass", message: "Keyword found in URL slug" });
    } else {
      details.push({ rule: "keyword-slug", label: "Keyword in URL", status: "warn", message: "Primary keyword not in URL slug" });
    }
  }

  // 10. Internal links
  const hasInternalLinks = /\]\(\/|href=["']\//.test(rawContent);
  if (hasInternalLinks) {
    details.push({ rule: "internal-links", label: "Internal links", status: "pass", message: "Content has internal links" });
  } else if (wc > 200) {
    details.push({ rule: "internal-links", label: "Internal links", status: "warn", message: "No internal links found — add links to related content" });
  }

  // 11. Document has title
  if (title) {
    details.push({ rule: "title", label: "Page title", status: "pass", message: "Document has a title" });
  } else {
    details.push({ rule: "title", label: "Page title", status: "fail", message: "Document is missing a title" });
  }

  // Calculate score
  const total = details.length;
  if (total === 0) return { score: 0, details };

  const weights = { pass: 1, warn: 0.5, fail: 0 };
  const scored = details.reduce((sum, d) => sum + weights[d.status], 0);
  const score = Math.round((scored / total) * 100);

  return { score, details };
}
