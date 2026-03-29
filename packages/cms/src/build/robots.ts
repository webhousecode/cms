/**
 * F112 G01 — Smart robots.txt generator.
 *
 * Generates robots.txt with separate rules for traditional search engines,
 * AI search/retrieval bots, and AI training bots. Four strategies:
 *
 * - "maximum"     — allow all (default, best for AI visibility)
 * - "balanced"    — allow search bots, block training bots
 * - "restrictive" — block all AI bots
 * - "custom"      — user-defined rules
 */

export interface RobotsConfig {
  /** Strategy for AI crawler access. Default: "maximum" */
  strategy?: "maximum" | "balanced" | "restrictive" | "custom";
  /** Raw robots.txt lines for "custom" strategy */
  customRules?: string[];
  /** Paths to disallow for all bots (default: ["/admin/", "/api/"]) */
  disallowPaths?: string[];
}

// Known AI crawlers as of 2026
const SEARCH_BOTS = [
  "ChatGPT-User", "OAI-SearchBot",
  "Claude-SearchBot", "Claude-User",
  "PerplexityBot", "Amazonbot", "Applebot",
];

const TRAINING_BOTS = [
  "GPTBot", "ClaudeBot", "Google-Extended",
  "CCBot", "Meta-ExternalAgent", "Bytespider", "Applebot-Extended",
];

const TRADITIONAL_BOTS = ["Googlebot", "Bingbot"];

export function generateRobotsTxt(config: RobotsConfig, baseUrl: string): string {
  const strategy = config.strategy ?? "maximum";
  const disallow = config.disallowPaths ?? ["/admin/", "/api/"];
  const lines: string[] = [];

  lines.push(`# @webhouse/cms — AI-optimized robots.txt`);
  lines.push(`# Strategy: ${strategy}`);
  lines.push(`# Generated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push("");

  if (strategy === "custom") {
    if (config.customRules?.length) {
      lines.push(...config.customRules);
    }
  } else {
    // Traditional search engines — always allowed
    for (const bot of TRADITIONAL_BOTS) {
      lines.push(`User-agent: ${bot}`);
      lines.push("Allow: /");
      lines.push("");
    }

    if (strategy === "maximum") {
      lines.push("# AI search + training bots — all allowed (maximum visibility)");
      for (const bot of [...SEARCH_BOTS, ...TRAINING_BOTS]) {
        lines.push(`User-agent: ${bot}`);
        lines.push("Allow: /");
        lines.push("");
      }
    } else if (strategy === "balanced") {
      lines.push("# AI search/retrieval bots — ALLOW");
      for (const bot of SEARCH_BOTS) {
        lines.push(`User-agent: ${bot}`);
        lines.push("Allow: /");
        lines.push("");
      }
      lines.push("# AI training bots — BLOCK");
      for (const bot of TRAINING_BOTS) {
        lines.push(`User-agent: ${bot}`);
        lines.push("Disallow: /");
        lines.push("");
      }
    } else if (strategy === "restrictive") {
      lines.push("# AI bots — all blocked (restrictive)");
      for (const bot of [...SEARCH_BOTS, ...TRAINING_BOTS]) {
        lines.push(`User-agent: ${bot}`);
        lines.push("Disallow: /");
        lines.push("");
      }
    }

    // Default rule
    lines.push("# Default");
    lines.push("User-agent: *");
    lines.push("Allow: /");
    for (const p of disallow) {
      lines.push(`Disallow: ${p}`);
    }
  }

  lines.push("");
  lines.push(`Sitemap: ${baseUrl.replace(/\/$/, "")}/sitemap.xml`);
  lines.push("");

  return lines.join("\n");
}
