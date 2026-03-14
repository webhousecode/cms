import { NextRequest, NextResponse } from "next/server";

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

/** DELETE /api/github — Disconnect GitHub (clear token cookie) */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("github-token");
  return response;
}
