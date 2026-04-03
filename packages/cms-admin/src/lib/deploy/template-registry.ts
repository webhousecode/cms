/**
 * F119 — Template Registry.
 *
 * Defines available site templates and provides utilities for
 * fetching template files from GitHub.
 */

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: "blog" | "landing" | "agency" | "portfolio" | "boilerplate" | "other";
  tags: string[];
  /** Path relative to monorepo root */
  githubPath: string;
  /** Whether template includes seed content */
  hasContent: boolean;
}

export const TEMPLATES: TemplateDefinition[] = [
  {
    id: "blog",
    name: "Blog",
    description: "A clean blog with posts, categories, and rich text editing.",
    category: "blog",
    tags: ["blog", "minimal", "content"],
    githubPath: "examples/blog",
    hasContent: true,
  },
  {
    id: "landing",
    name: "Landing Page",
    description: "Marketing landing page with hero, features, and call-to-action blocks.",
    category: "landing",
    tags: ["landing", "marketing", "blocks"],
    githubPath: "examples/landing",
    hasContent: true,
  },
  {
    id: "static/agency",
    name: "Agency",
    description: "Dark, modern agency template with case studies and team sections.",
    category: "agency",
    tags: ["agency", "dark", "case-studies"],
    githubPath: "examples/static/agency",
    hasContent: true,
  },
  {
    id: "static/freelancer",
    name: "Freelancer",
    description: "Minimal freelancer portfolio with projects and about page.",
    category: "portfolio",
    tags: ["freelancer", "minimal", "portfolio"],
    githubPath: "examples/static/freelancer",
    hasContent: true,
  },
  {
    id: "static/portfolio",
    name: "Portfolio",
    description: "Creative portfolio with full-bleed images and project grid.",
    category: "portfolio",
    tags: ["portfolio", "creative", "images"],
    githubPath: "examples/static/portfolio",
    hasContent: true,
  },
  {
    id: "static/portfolio-squared",
    name: "Portfolio Squared",
    description: "Grid-based portfolio with square image thumbnails.",
    category: "portfolio",
    tags: ["portfolio", "grid", "gallery"],
    githubPath: "examples/static/portfolio-squared",
    hasContent: true,
  },
  {
    id: "static/boutique",
    name: "Boutique",
    description: "Elegant boutique template for fashion and lifestyle brands.",
    category: "other",
    tags: ["boutique", "fashion", "elegant"],
    githubPath: "examples/static/boutique",
    hasContent: true,
  },
  {
    id: "static/studio",
    name: "Studio",
    description: "Creative studio template with project showcases.",
    category: "agency",
    tags: ["studio", "creative", "design"],
    githubPath: "examples/static/studio",
    hasContent: true,
  },
  {
    id: "static/bridgeberg",
    name: "Bridgeberg",
    description: "Corporate consulting template with services and timeline.",
    category: "other",
    tags: ["corporate", "consulting", "professional"],
    githubPath: "examples/static/bridgeberg",
    hasContent: true,
  },
  {
    id: "static/cmsdemo",
    name: "CMS Demo",
    description: "Full demo site showcasing all CMS features. Ships as Docker default.",
    category: "other",
    tags: ["demo", "default", "all-features"],
    githubPath: "examples/static/cmsdemo",
    hasContent: true,
  },
  {
    id: "static-boilerplate",
    name: "Static Boilerplate",
    description: "Minimal static site starter — HTML output with build pipeline.",
    category: "boilerplate",
    tags: ["boilerplate", "static", "starter"],
    githubPath: "examples/static-boilerplate",
    hasContent: false,
  },
  {
    id: "nextjs-boilerplate",
    name: "Next.js Boilerplate",
    description: "Next.js App Router with CMS helpers, SEO, and Fly.io deploy.",
    category: "boilerplate",
    tags: ["nextjs", "ssr", "boilerplate"],
    githubPath: "examples/nextjs-boilerplate",
    hasContent: false,
  },
];

/**
 * Get screenshot URL for a template.
 * In dev, reads from local examples/ directory.
 * In production/Docker, falls back to GitHub raw content.
 */
export function getTemplateScreenshotUrl(templateId: string): string {
  // GitHub raw content URL (always works, no auth needed for public repos)
  const template = TEMPLATES.find((t) => t.id === templateId);
  if (!template) return "";
  return `https://raw.githubusercontent.com/webhousecode/cms/main/${template.githubPath}/screenshot.png`;
}

/**
 * Fetch a template's files from GitHub as a tar.gz archive.
 * Extracts only the relevant subdirectory.
 */
export async function fetchTemplateFromGitHub(
  templateId: string,
): Promise<{ files: Map<string, Buffer>; error?: string }> {
  const template = TEMPLATES.find((t) => t.id === templateId);
  if (!template) {
    return { files: new Map(), error: `Template "${templateId}" not found` };
  }

  try {
    // Use GitHub API to get the directory tree
    const apiUrl = `https://api.github.com/repos/webhousecode/cms/contents/${template.githubPath}?ref=main`;
    const files = new Map<string, Buffer>();
    await fetchDirectoryRecursive(apiUrl, "", files);
    return { files };
  } catch (err) {
    return {
      files: new Map(),
      error: err instanceof Error ? err.message : "Failed to fetch template",
    };
  }
}

async function fetchDirectoryRecursive(
  apiUrl: string,
  prefix: string,
  files: Map<string, Buffer>,
): Promise<void> {
  const res = await fetch(apiUrl, {
    headers: { Accept: "application/vnd.github.v3+json" },
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);

  const entries = (await res.json()) as Array<{
    name: string;
    type: "file" | "dir";
    download_url: string | null;
    url: string;
  }>;

  for (const entry of entries) {
    const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.type === "dir") {
      await fetchDirectoryRecursive(entry.url, entryPath, files);
    } else if (entry.download_url) {
      const fileRes = await fetch(entry.download_url);
      if (fileRes.ok) {
        files.set(entryPath, Buffer.from(await fileRes.arrayBuffer()));
      }
    }
  }
}
