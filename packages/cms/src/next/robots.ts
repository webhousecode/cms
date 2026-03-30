/**
 * F121 — Next.js robots.txt handler from CMS GEO strategies (F112).
 *
 * Returns a factory function compatible with Next.js app/robots.ts.
 * Reuses the same bot lists and strategy logic as the static build pipeline.
 */

// Known AI crawlers — same lists as packages/cms/src/build/robots.ts
const SEARCH_BOTS = [
  'ChatGPT-User', 'OAI-SearchBot',
  'Claude-SearchBot', 'Claude-User',
  'PerplexityBot', 'Amazonbot', 'Applebot',
];

const TRAINING_BOTS = [
  'GPTBot', 'ClaudeBot', 'Google-Extended',
  'CCBot', 'Meta-ExternalAgent', 'Bytespider', 'Applebot-Extended',
];

const TRADITIONAL_BOTS = ['Googlebot', 'Bingbot'];

interface RobotsRule {
  userAgent: string | string[];
  allow?: string | string[];
  disallow?: string | string[];
}

interface RobotsResult {
  rules: RobotsRule[];
  sitemap?: string;
}

/**
 * Create a Next.js robots.ts handler with CMS AI crawler strategies.
 *
 * @example
 * ```ts
 * // app/robots.ts
 * import { cmsRobots } from '@webhouse/cms/next';
 * export default cmsRobots({ baseUrl: 'https://example.com', strategy: 'maximum' });
 * ```
 */
export function cmsRobots(options: {
  /** Site base URL (for Sitemap directive) */
  baseUrl: string;
  /** AI crawler strategy. Default: "maximum" */
  strategy?: 'maximum' | 'balanced' | 'restrictive' | 'custom';
  /** Raw rules for "custom" strategy */
  customRules?: RobotsRule[];
  /** Paths to disallow for all bots. Default: ["/admin/", "/api/"] */
  disallowPaths?: string[];
}): () => RobotsResult {
  return function robots(): RobotsResult {
    const strategy = options.strategy ?? 'maximum';
    const disallow = options.disallowPaths ?? ['/admin/', '/api/'];
    const base = options.baseUrl.replace(/\/$/, '');
    const rules: RobotsRule[] = [];

    if (strategy === 'custom' && options.customRules) {
      rules.push(...options.customRules);
    } else {
      // Traditional search engines — always allowed
      for (const bot of TRADITIONAL_BOTS) {
        rules.push({ userAgent: bot, allow: '/' });
      }

      if (strategy === 'maximum') {
        // Allow all AI bots
        for (const bot of [...SEARCH_BOTS, ...TRAINING_BOTS]) {
          rules.push({ userAgent: bot, allow: '/' });
        }
      } else if (strategy === 'balanced') {
        // Allow search bots, block training bots
        for (const bot of SEARCH_BOTS) {
          rules.push({ userAgent: bot, allow: '/' });
        }
        for (const bot of TRAINING_BOTS) {
          rules.push({ userAgent: bot, disallow: '/' });
        }
      } else if (strategy === 'restrictive') {
        // Block all AI bots
        for (const bot of [...SEARCH_BOTS, ...TRAINING_BOTS]) {
          rules.push({ userAgent: bot, disallow: '/' });
        }
      }

      // Default wildcard rule
      rules.push({
        userAgent: '*',
        allow: '/',
        disallow: disallow,
      });
    }

    return {
      rules,
      sitemap: `${base}/sitemap.xml`,
    };
  };
}
