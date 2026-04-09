/**
 * F03 — WordPress Site Probe.
 *
 * Given just a URL, detect REST API availability, theme, page builder,
 * content counts, and custom post types. Works without authentication
 * on the ~90% of WP sites that have the REST API enabled (default since WP 4.7).
 */

export interface WpProbeResult {
  url: string;
  restApiAvailable: boolean;
  restApiUrl: string;
  wordpressVersion?: string;
  theme: { name: string; slug: string };
  pageBuilder: "gutenberg" | "elementor" | "divi" | "wpbakery" | "oxygen" | "beaver" | "none";
  contentCounts: {
    posts: number;
    pages: number;
    media: number;
    categories: number;
    tags: number;
    customPostTypes: Array<{ slug: string; name: string; count: number }>;
  };
  siteTitle?: string;
  siteDescription?: string;
  language?: string;
  error?: string;
}

/**
 * Probe a WordPress site — detect capabilities and content inventory.
 * Only requires the site URL. Takes ~2-5 seconds.
 */
export async function probeWpSite(rawUrl: string): Promise<WpProbeResult> {
  const url = rawUrl.replace(/\/+$/, "");
  const result: WpProbeResult = {
    url,
    restApiAvailable: false,
    restApiUrl: "",
    theme: { name: "Unknown", slug: "" },
    pageBuilder: "none",
    contentCounts: {
      posts: 0,
      pages: 0,
      media: 0,
      categories: 0,
      tags: 0,
      customPostTypes: [],
    },
  };

  // ── 1. Detect REST API ──
  try {
    const apiRes = await fetchWithTimeout(`${url}/wp-json/`, 8000);
    if (apiRes.ok) {
      const data = await apiRes.json();
      result.restApiAvailable = true;
      result.restApiUrl = `${url}/wp-json/wp/v2`;
      result.siteTitle = data.name;
      result.siteDescription = data.description;
      // WP version from generator tag in namespaces
      if (data.namespaces?.includes("wp/v2")) {
        result.wordpressVersion = "4.7+";
      }
    }
  } catch {
    // REST API not available — try alternative path
    try {
      const altRes = await fetchWithTimeout(`${url}/?rest_route=/`, 5000);
      if (altRes.ok) {
        result.restApiAvailable = true;
        result.restApiUrl = `${url}/?rest_route=/wp/v2`;
      }
    } catch { /* no REST API */ }
  }

  // ── 2. Fetch homepage HTML for theme + builder detection ──
  try {
    const htmlRes = await fetchWithTimeout(url, 8000);
    const html = await htmlRes.text();

    // Theme detection from wp-content/themes/{slug}/
    const themeMatch = html.match(/wp-content\/themes\/([a-z0-9_-]+)\//i);
    if (themeMatch) {
      result.theme.slug = themeMatch[1];
      result.theme.name = themeMatch[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }

    // Page builder detection from HTML classes and scripts
    if (html.includes("elementor") || html.includes("wp-content/plugins/elementor")) {
      result.pageBuilder = "elementor";
    } else if (html.includes("et_pb_") || html.includes("wp-content/plugins/divi-builder")) {
      result.pageBuilder = "divi";
    } else if (html.includes("vc_row") || html.includes("js_composer")) {
      result.pageBuilder = "wpbakery";
    } else if (html.includes("ct-section") || html.includes("oxygen-is-not-a-theme") || html.includes("oxy_")) {
      result.pageBuilder = "oxygen";
    } else if (html.includes("fl-builder") || html.includes("beaver-builder")) {
      result.pageBuilder = "beaver";
    } else if (html.includes("wp-block-") || html.includes("is-layout-")) {
      result.pageBuilder = "gutenberg";
    }

    // Language from <html lang="...">
    const langMatch = html.match(/<html[^>]*\slang="([^"]+)"/i);
    if (langMatch) result.language = langMatch[1];

    // WP version from meta generator
    const versionMatch = html.match(/<meta[^>]*name="generator"[^>]*content="WordPress\s*([\d.]+)"/i);
    if (versionMatch) result.wordpressVersion = versionMatch[1];
  } catch { /* homepage fetch failed */ }

  // ── 3. Count content via REST API ──
  if (result.restApiAvailable) {
    const api = result.restApiUrl;

    // Standard types
    result.contentCounts.posts = await getWpCount(`${api}/posts`);
    result.contentCounts.pages = await getWpCount(`${api}/pages`);
    result.contentCounts.media = await getWpCount(`${api}/media`);
    result.contentCounts.categories = await getWpCount(`${api}/categories`);
    result.contentCounts.tags = await getWpCount(`${api}/tags`);

    // Detect custom post types
    try {
      const typesRes = await fetchWithTimeout(`${api}/types`, 5000);
      if (typesRes.ok) {
        const types = await typesRes.json();
        for (const [slug, meta] of Object.entries(types) as [string, any][]) {
          // Skip built-in types
          if (["post", "page", "attachment", "revision", "nav_menu_item", "wp_block", "wp_template", "wp_template_part", "wp_navigation", "wp_font_family", "wp_font_face", "wp_global_styles"].includes(slug)) continue;
          // Check if this type has a REST endpoint
          const restBase = meta.rest_base ?? slug;
          const count = await getWpCount(`${api}/${restBase}`);
          if (count > 0) {
            result.contentCounts.customPostTypes.push({
              slug,
              name: meta.name ?? slug,
              count,
            });
          }
        }
      }
    } catch { /* types endpoint not available */ }
  }

  return result;
}

// ── Helpers ──

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "webhouse.app-cms/1.0 (WordPress Migration)" },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function getWpCount(endpoint: string): Promise<number> {
  try {
    const res = await fetchWithTimeout(`${endpoint}?per_page=1`, 5000);
    if (!res.ok) return 0;
    const total = res.headers.get("X-WP-Total");
    return total ? parseInt(total, 10) : 0;
  } catch {
    return 0;
  }
}
