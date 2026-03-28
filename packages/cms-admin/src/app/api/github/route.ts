import { NextRequest, NextResponse } from "next/server";
import { denyViewers } from "@/lib/require-role";

/**
 * GET /api/github?action=status|orgs|repos&org=...
 * Proxy GitHub API calls using the stored OAuth token.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("github-token")?.value;
  const action = request.nextUrl.searchParams.get("action") ?? "status";

  if (!token) {
    return NextResponse.json({ connected: false });
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  try {
    if (action === "status") {
      const res = await fetch("https://api.github.com/user", { headers });
      if (!res.ok) return NextResponse.json({ connected: false });
      const user = (await res.json()) as { login: string; avatar_url: string; name: string };
      return NextResponse.json({ connected: true, user: { login: user.login, avatar: user.avatar_url, name: user.name } });
    }

    if (action === "orgs") {
      // Get user's orgs + personal account
      const [userRes, orgsRes] = await Promise.all([
        fetch("https://api.github.com/user", { headers }),
        fetch("https://api.github.com/user/orgs?per_page=100", { headers }),
      ]);
      if (!userRes.ok) return NextResponse.json({ error: "Failed to fetch user" }, { status: 401 });

      const user = (await userRes.json()) as { login: string; avatar_url: string };
      const orgs = orgsRes.ok
        ? ((await orgsRes.json()) as Array<{ login: string; avatar_url: string }>)
        : [];

      return NextResponse.json({
        accounts: [
          { login: user.login, avatar: user.avatar_url, type: "user" },
          ...orgs.map((o) => ({ login: o.login, avatar: o.avatar_url, type: "org" })),
        ],
      });
    }

    if (action === "repos") {
      const org = request.nextUrl.searchParams.get("org");
      if (!org) return NextResponse.json({ error: "org param required" }, { status: 400 });

      // Check if it's the user's personal account or an org
      const userRes = await fetch("https://api.github.com/user", { headers });
      const user = (await userRes.json()) as { login: string };

      let url: string;
      if (org === user.login) {
        // Personal repos
        url = "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner";
      } else {
        // Org repos
        url = `https://api.github.com/orgs/${org}/repos?per_page=100&sort=updated`;
      }

      const reposRes = await fetch(url, { headers });
      if (!reposRes.ok) return NextResponse.json({ error: "Failed to fetch repos" }, { status: reposRes.status });

      const repos = (await reposRes.json()) as Array<{
        name: string;
        full_name: string;
        private: boolean;
        description: string | null;
        default_branch: string;
      }>;

      return NextResponse.json({
        repos: repos.map((r) => ({
          name: r.name,
          fullName: r.full_name,
          private: r.private,
          description: r.description,
          defaultBranch: r.default_branch,
        })),
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "GitHub API error" }, { status: 500 });
  }
}

/** POST /api/github — Create repo or seed content */
export async function POST(request: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  const token = request.cookies.get("github-token")?.value;
  if (!token) return NextResponse.json({ error: "Not connected to GitHub" }, { status: 401 });

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };

  const body = (await request.json()) as {
    action: "create-repo";
    org: string;
    name: string;
    private?: boolean;
    description?: string;
  };

  if (body.action === "create-repo") {
    if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });

    // Determine if personal or org
    const userRes = await fetch("https://api.github.com/user", { headers });
    const user = (await userRes.json()) as { login: string };
    const isPersonal = body.org === user.login;

    const url = isPersonal
      ? "https://api.github.com/user/repos"
      : `https://api.github.com/orgs/${body.org}/repos`;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: body.name,
        private: body.private ?? true,
        description: body.description ?? "",
        auto_init: true,
      }),
    });

    if (!res.ok) {
      const err = (await res.json()) as { message?: string };
      return NextResponse.json({ error: err.message ?? `Failed (${res.status})` }, { status: res.status });
    }

    const repo = (await res.json()) as { name: string; full_name: string; default_branch: string; private: boolean };
    const repoUrl = `https://api.github.com/repos/${repo.full_name}`;

    // ── Seed files into the repo ──────────────────────────────

    const siteName = body.name.replace(/[-_]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

    const seedFiles: Record<string, string> = {
      "cms.config.ts": `import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  collections: [
    defineCollection({
      name: "pages",
      label: "Pages",
      fields: [
        { name: "title", type: "text", required: true },
        { name: "description", type: "textarea" },
        { name: "content", type: "richtext" },
      ],
    }),
  ],
  storage: {
    adapter: "github",
    github: {
      owner: "${body.org}",
      repo: "${body.name}",
      branch: "${repo.default_branch}",
      contentDir: "content",
      token: "oauth",
    },
  },
});
`,
      ".gitignore": `# CMS per-site data (AI keys, user data — never committed)
_data/
.mcp.json

# dotenv environment variable files
.env
.env.*
!.env.example

# Dependency directories
node_modules/

# Build output
.next/
out/
dist/
build/

# OS
.DS_Store
Thumbs.db

# Editor
.vscode/
.idea/
*.swp
*.swo

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
`,
      ".env.example": `# ${siteName}
# Copy to .env.local and fill in values

# Site URL (used for preview links and OG tags)
# NEXT_PUBLIC_SITE_URL=https://example.com

# AI keys (optional — can also be set via CMS Admin → Settings → AI)
# ANTHROPIC_API_KEY=
# OPENAI_API_KEY=
`,
      ".nvmrc": "22\n",
      "content/.gitkeep": "",
      "README.md": `# ${siteName}

Content-managed site powered by [**@webhouse/cms**](https://github.com/webhousecode/cms) — the AI-native, developer-first CMS engine.

## Getting started

### 1. Install dependencies

\`\`\`bash
npm install @webhouse/cms
\`\`\`

Or scaffold a full project from scratch:

\`\`\`bash
npm create @webhouse/cms my-site
\`\`\`

### 2. Define your schema

Edit \`cms.config.ts\` to add collections, fields, blocks, and locales:

\`\`\`typescript
import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  collections: [
    defineCollection({
      name: 'pages',
      label: 'Pages',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'content', type: 'richtext' },
      ],
    }),
  ],
});
\`\`\`

### 3. Manage content

Open **[webhouse.app](https://webhouse.app)** (CMS Admin) and select this site — or run the admin locally:

\`\`\`bash
npx @webhouse/cms-cli dev
\`\`\`

### 4. Use the CLI

\`\`\`bash
npx @webhouse/cms-cli build       # Build static output
npx @webhouse/cms-cli ai run      # Run AI agents
npx @webhouse/cms-cli ai translate # Translate content
\`\`\`

## Project structure

\`\`\`
cms.config.ts      # Collection schemas and CMS configuration
content/           # Content JSON files (managed by CMS admin)
_data/             # Per-site data: AI keys, user prefs (git-ignored)
.env.example       # Environment variable template
\`\`\`

## Resources

- **CMS Admin** — [webhouse.app](https://webhouse.app) or \`localhost:3010/admin\`
- **Documentation** — [github.com/webhousecode/cms](https://github.com/webhousecode/cms)
- **npm** — [@webhouse/cms](https://www.npmjs.com/package/@webhouse/cms) · [@webhouse/cms-cli](https://www.npmjs.com/package/@webhouse/cms-cli)

---

Built with [@webhouse/cms](https://github.com/webhousecode/cms) — AI-native content management for developers.
`,
    };

    // Seed files sequentially (each commit must finish before the next)
    for (const [filePath, content] of Object.entries(seedFiles)) {
      const putRes = await fetch(`${repoUrl}/contents/${filePath}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          message: filePath === "cms.config.ts" ? "chore: initialize CMS site" : `chore: add ${filePath}`,
          content: Buffer.from(content).toString("base64"),
          branch: repo.default_branch,
        }),
      });
      if (!putRes.ok) {
        const putErr = await putRes.json().catch(() => ({})) as { message?: string };
        console.error(`[create-repo] Failed to seed ${filePath}:`, putErr.message ?? putRes.status);
        // Continue seeding other files — non-fatal
      }
    }

    return NextResponse.json({
      ok: true,
      repo: { name: repo.name, fullName: repo.full_name, defaultBranch: repo.default_branch, private: repo.private },
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

/** DELETE /api/github — Disconnect GitHub (clear token cookie) */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("github-token");
  return response;
}
