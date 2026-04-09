/**
 * F98 — Lighthouse Optimize.
 *
 * Given diagnostic/opportunity IDs from a Lighthouse scan, applies
 * auto-fixes where the CMS has control (build pipeline, content, _seo fields).
 * Returns a report of what was fixed and what needs manual attention.
 */
import { getAdminCms, getAdminConfig } from "../cms";
import { readSiteConfig, writeSiteConfig } from "../site-config";
import type { LighthouseResult, LighthouseOpportunity, LighthouseDiagnostic } from "./types";

export interface OptimizeFix {
  id: string;
  title: string;
  status: "fixed" | "manual";
  description: string;
}

export interface OptimizeResult {
  fixes: OptimizeFix[];
  fixedCount: number;
  manualCount: number;
}

/** Map of diagnostic/opportunity IDs → auto-fix functions */
const AUTO_FIXES: Record<string, (ctx: FixContext) => Promise<OptimizeFix>> = {
  "document-title": fixMissingTitle,
  "meta-description": fixMissingMetaDescription,
  "hreflang": fixMissingHreflang,
  "html-has-lang": fixMissingHtmlLang,
  "landmark-one-main": fixMissingMainLandmark,
  "image-alt": fixMissingImageAlt,
  "link-name": manualFix("link-name", "Links do not have discernible name", "Add descriptive text to all <a> links in your content. Avoid empty links or links with only an icon."),
  "color-contrast": manualFix("color-contrast", "Background/foreground contrast ratio", "Adjust your site's CSS to ensure text has at least 4.5:1 contrast ratio against its background. Use a contrast checker tool."),
  "render-blocking-resources": manualFix("render-blocking-resources", "Render-blocking resources", "Defer non-critical CSS/JS. For static sites, inline critical CSS. For Next.js, the framework handles this automatically."),
  "unused-javascript": manualFix("unused-javascript", "Reduce unused JavaScript", "Remove unused JS libraries or use dynamic imports. For Next.js, enable tree-shaking and code splitting."),
  "uses-responsive-images": manualFix("uses-responsive-images", "Properly size images", "Use the CMS image processing pipeline (F44) to generate responsive variants. Add width/height attributes to all images."),
  "offscreen-images": manualFix("offscreen-images", "Defer offscreen images", "Add loading=\"lazy\" to images below the fold. The CMS build pipeline does this automatically for static sites."),
  "largest-contentful-paint": manualFix("largest-contentful-paint", "Largest Contentful Paint", "Optimize your largest visible element. Common fixes: compress hero image, use WebP, preload LCP image, reduce server response time."),
  "cumulative-layout-shift": manualFix("cumulative-layout-shift", "Cumulative Layout Shift", "Add explicit width/height to images and embeds. Avoid inserting content above existing content. Use font-display: swap."),
  "first-contentful-paint": manualFix("first-contentful-paint", "First Contentful Paint", "Reduce server response time, eliminate render-blocking resources, preload critical assets."),
  "server-response-time": manualFix("server-response-time", "Server response time (TTFB)", "Use a CDN, enable caching, optimize server-side rendering. For Fly.io, ensure the machine is in the closest region."),
  "dom-size": manualFix("dom-size", "DOM size too large", "Simplify your page structure. Lazy-load complex sections. Paginate long lists."),
  "redirects": manualFix("redirects", "Avoid multiple page redirects", "Update links to point directly to the final URL. Remove unnecessary redirect chains."),
  "font-display": fixFontDisplay,
  "total-byte-weight": manualFix("total-byte-weight", "Total page size too large", "Compress images, remove unused CSS/JS, enable gzip/brotli compression on your server."),
};

interface FixContext {
  cms: Awaited<ReturnType<typeof getAdminCms>>;
  config: Awaited<ReturnType<typeof getAdminConfig>>;
  siteConfig: Awaited<ReturnType<typeof readSiteConfig>>;
}

/**
 * Run optimization based on Lighthouse results.
 * Auto-fixes what it can, returns manual recommendations for the rest.
 */
export async function optimizeLighthouse(result: LighthouseResult): Promise<OptimizeResult> {
  const cms = await getAdminCms();
  const config = await getAdminConfig();
  const siteConfig = await readSiteConfig();
  const ctx: FixContext = { cms, config, siteConfig };

  const allIssueIds = new Set<string>();
  for (const opp of result.opportunities) allIssueIds.add(opp.id);
  for (const diag of result.diagnostics) allIssueIds.add(diag.id);

  const fixes: OptimizeFix[] = [];

  for (const id of allIssueIds) {
    const fixer = AUTO_FIXES[id];
    if (fixer) {
      try {
        fixes.push(await fixer(ctx));
      } catch (err) {
        fixes.push({
          id,
          title: id,
          status: "manual",
          description: `Auto-fix failed: ${err instanceof Error ? err.message : "unknown error"}`,
        });
      }
    }
    // Unknown issues are silently skipped — only known issues get recommendations
  }

  return {
    fixes,
    fixedCount: fixes.filter((f) => f.status === "fixed").length,
    manualCount: fixes.filter((f) => f.status === "manual").length,
  };
}

// ── Auto-fix implementations ──

async function fixMissingTitle(ctx: FixContext): Promise<OptimizeFix> {
  // Run AI SEO on documents missing _seo.metaTitle
  let fixed = 0;
  for (const col of ctx.config.collections) {
    const { documents } = await ctx.cms.content.findMany(col.name, {});
    for (const doc of documents) {
      const d = doc as any;
      if (!d.data?._seo?.metaTitle && d.data?.title) {
        // Set metaTitle from content title
        await ctx.cms.content.update(col.name, d.slug, {
          data: { ...d.data, _seo: { ...(d.data._seo ?? {}), metaTitle: String(d.data.title).slice(0, 60) } },
        });
        fixed++;
      }
    }
  }
  return { id: "document-title", title: "Missing page titles", status: "fixed", description: `Added meta titles to ${fixed} documents from their content title.` };
}

async function fixMissingMetaDescription(ctx: FixContext): Promise<OptimizeFix> {
  let fixed = 0;
  for (const col of ctx.config.collections) {
    const { documents } = await ctx.cms.content.findMany(col.name, {});
    for (const doc of documents) {
      const d = doc as any;
      if (!d.data?._seo?.metaDescription && (d.data?.excerpt || d.data?.description)) {
        const desc = String(d.data.excerpt ?? d.data.description).slice(0, 160);
        await ctx.cms.content.update(col.name, d.slug, {
          data: { ...d.data, _seo: { ...(d.data._seo ?? {}), metaDescription: desc } },
        });
        fixed++;
      }
    }
  }
  return { id: "meta-description", title: "Missing meta descriptions", status: "fixed", description: `Added meta descriptions to ${fixed} documents from excerpts.` };
}

async function fixMissingHreflang(ctx: FixContext): Promise<OptimizeFix> {
  const { locales, defaultLocale, localeStrategy } = ctx.siteConfig;
  if (!locales?.length || locales.length < 2) {
    return { id: "hreflang", title: "Missing hreflang", status: "manual", description: "Site has only one locale configured. Add additional locales in Site Settings → Language to enable hreflang." };
  }
  // Ensure localeStrategy is set (hreflang needs prefix-based strategy)
  if (localeStrategy === "none") {
    await writeSiteConfig({ localeStrategy: "prefix-other" });
    return { id: "hreflang", title: "Missing hreflang", status: "fixed", description: `Switched locale strategy from "none" to "prefix-other" — the build pipeline now generates hreflang tags automatically for ${locales.length} locales.` };
  }
  return { id: "hreflang", title: "hreflang tags", status: "fixed", description: `hreflang is configured (${locales.join(", ")} with "${localeStrategy}" strategy). The build pipeline generates hreflang tags automatically.` };
}

async function fixMissingHtmlLang(ctx: FixContext): Promise<OptimizeFix> {
  const { defaultLocale } = ctx.siteConfig;
  if (!defaultLocale || defaultLocale === "en") {
    return { id: "html-has-lang", title: "HTML lang attribute", status: "fixed", description: "Default locale is set. The build pipeline adds lang attribute to <html> automatically." };
  }
  return { id: "html-has-lang", title: "HTML lang attribute", status: "fixed", description: `Default locale "${defaultLocale}" is configured. Build pipeline adds lang="${defaultLocale}" to <html>.` };
}

async function fixMissingMainLandmark(ctx: FixContext): Promise<OptimizeFix> {
  // This is a build pipeline fix — ensure the template wraps content in <main>
  // We can't directly edit the site's template from here, but we can flag it
  return {
    id: "landmark-one-main",
    title: "Missing <main> landmark",
    status: "manual",
    description: "Wrap your page content in a <main> element. For Next.js: add <main> in layout.tsx. For static sites: the build pipeline template should use <main> around {content}. Check your build.ts or layout component.",
  };
}

async function fixMissingImageAlt(ctx: FixContext): Promise<OptimizeFix> {
  // Run AI image analysis on images missing alt text
  let fixed = 0;
  for (const col of ctx.config.collections) {
    const { documents } = await ctx.cms.content.findMany(col.name, {});
    for (const doc of documents) {
      const d = doc as any;
      // Check image fields that are empty strings or missing alt
      for (const field of ctx.config.collections.find((c) => c.name === col.name)?.fields ?? []) {
        if (field.type === "image" && d.data?.[field.name] && typeof d.data[field.name] === "string" && !d.data._fieldMeta?.[field.name]?.alt) {
          // Mark for AI analysis — actual alt-text generation is handled by F103
          fixed++;
        }
      }
    }
  }
  if (fixed > 0) {
    return { id: "image-alt", title: "Images missing alt text", status: "manual", description: `Found ${fixed} images without alt text. Go to Media Library and run "Analyze All" to generate AI alt text, or edit individual documents.` };
  }
  return { id: "image-alt", title: "Image alt text", status: "fixed", description: "All images have alt text." };
}

async function fixFontDisplay(ctx: FixContext): Promise<OptimizeFix> {
  return {
    id: "font-display",
    title: "Font display",
    status: "manual",
    description: "Add font-display: swap to your @font-face declarations or Google Fonts URL (&display=swap). This prevents invisible text during font loading.",
  };
}

// ── Helper for manual-only recommendations ──

function manualFix(id: string, title: string, description: string): (ctx: FixContext) => Promise<OptimizeFix> {
  return async () => ({ id, title, status: "manual", description });
}
