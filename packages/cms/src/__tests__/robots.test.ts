import { describe, it, expect } from "vitest";

// ── Inline implementation for TDD ──────────────────────────

interface RobotsConfig {
  strategy?: "maximum" | "balanced" | "restrictive" | "custom";
  customRules?: string[];
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

function generateRobotsTxt(config: RobotsConfig, baseUrl: string): string {
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
      // Allow ALL bots
      lines.push("# AI search + training bots — all allowed (maximum visibility)");
      for (const bot of [...SEARCH_BOTS, ...TRAINING_BOTS]) {
        lines.push(`User-agent: ${bot}`);
        lines.push("Allow: /");
        lines.push("");
      }
    } else if (strategy === "balanced") {
      // Allow search bots, block training bots
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
      // Block all AI bots
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

// ── Tests ──────────────────────────────────────────────────

describe("robots.txt Generator (G01)", () => {
  const baseUrl = "https://example.com";

  describe("strategy: maximum", () => {
    it("allows all bots including training bots", () => {
      const txt = generateRobotsTxt({ strategy: "maximum" }, baseUrl);
      expect(txt).toContain("Strategy: maximum");
      expect(txt).toContain("User-agent: GPTBot\nAllow: /");
      expect(txt).toContain("User-agent: ClaudeBot\nAllow: /");
      expect(txt).toContain("User-agent: ChatGPT-User\nAllow: /");
      expect(txt).toContain("User-agent: Googlebot\nAllow: /");
      expect(txt).not.toContain("Disallow: /\n");
    });

    it("is the default strategy", () => {
      const txt = generateRobotsTxt({}, baseUrl);
      expect(txt).toContain("Strategy: maximum");
    });
  });

  describe("strategy: balanced", () => {
    it("allows search bots, blocks training bots", () => {
      const txt = generateRobotsTxt({ strategy: "balanced" }, baseUrl);
      expect(txt).toContain("Strategy: balanced");
      // Search bots allowed
      expect(txt).toContain("User-agent: ChatGPT-User\nAllow: /");
      expect(txt).toContain("User-agent: Claude-SearchBot\nAllow: /");
      expect(txt).toContain("User-agent: PerplexityBot\nAllow: /");
      // Training bots blocked
      expect(txt).toContain("User-agent: GPTBot\nDisallow: /");
      expect(txt).toContain("User-agent: ClaudeBot\nDisallow: /");
      expect(txt).toContain("User-agent: CCBot\nDisallow: /");
    });
  });

  describe("strategy: restrictive", () => {
    it("blocks all AI bots", () => {
      const txt = generateRobotsTxt({ strategy: "restrictive" }, baseUrl);
      expect(txt).toContain("Strategy: restrictive");
      expect(txt).toContain("User-agent: ChatGPT-User\nDisallow: /");
      expect(txt).toContain("User-agent: GPTBot\nDisallow: /");
      expect(txt).toContain("User-agent: ClaudeBot\nDisallow: /");
      expect(txt).toContain("User-agent: PerplexityBot\nDisallow: /");
      // Traditional bots still allowed
      expect(txt).toContain("User-agent: Googlebot\nAllow: /");
    });
  });

  describe("strategy: custom", () => {
    it("uses custom rules verbatim", () => {
      const txt = generateRobotsTxt({
        strategy: "custom",
        customRules: ["User-agent: *", "Disallow: /private/", "Allow: /public/"],
      }, baseUrl);
      expect(txt).toContain("User-agent: *");
      expect(txt).toContain("Disallow: /private/");
      expect(txt).toContain("Allow: /public/");
      // Should NOT include auto-generated bot rules
      expect(txt).not.toContain("User-agent: GPTBot");
    });

    it("handles empty custom rules", () => {
      const txt = generateRobotsTxt({ strategy: "custom", customRules: [] }, baseUrl);
      expect(txt).toContain("Sitemap:");
    });
  });

  describe("common behavior", () => {
    it("includes sitemap URL", () => {
      const txt = generateRobotsTxt({}, baseUrl);
      expect(txt).toContain("Sitemap: https://example.com/sitemap.xml");
    });

    it("strips trailing slash from baseUrl", () => {
      const txt = generateRobotsTxt({}, "https://example.com/");
      expect(txt).toContain("Sitemap: https://example.com/sitemap.xml");
    });

    it("disallows /admin/ and /api/ by default", () => {
      const txt = generateRobotsTxt({ strategy: "maximum" }, baseUrl);
      expect(txt).toContain("Disallow: /admin/");
      expect(txt).toContain("Disallow: /api/");
    });

    it("merges custom disallowPaths", () => {
      const txt = generateRobotsTxt({ strategy: "maximum", disallowPaths: ["/admin/", "/api/", "/private/", "/staging/"] }, baseUrl);
      expect(txt).toContain("Disallow: /private/");
      expect(txt).toContain("Disallow: /staging/");
    });

    it("includes all known AI crawlers", () => {
      const txt = generateRobotsTxt({ strategy: "maximum" }, baseUrl);
      for (const bot of [...SEARCH_BOTS, ...TRAINING_BOTS, ...TRADITIONAL_BOTS]) {
        expect(txt).toContain(`User-agent: ${bot}`);
      }
    });
  });
});
