/**
 * GitHub Media Client — reads/writes media files via GitHub Contents API.
 *
 * Used by Media Manager and Interactives Manager for GitHub-backed sites.
 * Designed for speed: parallel fetches, minimal roundtrips, no local cache.
 */
import { cookies } from "next/headers";
import { findSite, getDefaultSite, loadRegistry } from "./site-registry";
import type { SiteEntry } from "./site-registry";

// ─── Types ──────────────────────────────────────────────────

export interface GitHubMediaFile {
  name: string;
  path: string;       // repo path, e.g. "public/images/photo.jpg"
  sha: string;
  size: number;
  downloadUrl: string;
  type: "file" | "dir";
}

interface GitHubContentsEntry {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: "file" | "dir";
  download_url: string | null;
}

interface GitHubPutResponse {
  content: { sha: string; path: string };
}

// ─── Core client ────────────────────────────────────────────

export class GitHubMediaClient {
  constructor(
    private owner: string,
    private repo: string,
    private branch: string,
    private token: string,
  ) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    };
  }

  private url(repoPath: string): string {
    return `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${repoPath}`;
  }

  /**
   * List all files in a directory (non-recursive).
   * Returns empty array if directory doesn't exist.
   */
  async listDir(dirPath: string): Promise<GitHubMediaFile[]> {
    const url = `${this.url(dirPath)}?ref=${this.branch}`;
    const res = await fetch(url, { headers: this.headers(), cache: "no-store" });

    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`GitHub listDir ${dirPath}: ${res.status}`);

    const entries = (await res.json()) as GitHubContentsEntry[];
    if (!Array.isArray(entries)) return [];

    return entries.map((e) => ({
      name: e.name,
      path: e.path,
      sha: e.sha,
      size: e.size,
      downloadUrl: e.download_url ?? "",
      type: e.type as "file" | "dir",
    }));
  }

  /**
   * List all files in a directory recursively (one level of subdirs).
   * Fetches subdirectories in parallel for speed.
   */
  async listDirRecursive(dirPath: string): Promise<GitHubMediaFile[]> {
    const entries = await this.listDir(dirPath);
    const files = entries.filter((e) => e.type === "file");
    const dirs = entries.filter((e) => e.type === "dir");

    if (dirs.length === 0) return files;

    // Fetch all subdirectories in parallel
    const subResults = await Promise.all(
      dirs.map((d) => this.listDir(d.path)),
    );

    for (const subFiles of subResults) {
      files.push(...subFiles.filter((e) => e.type === "file"));
    }

    return files;
  }

  /**
   * Get a single file's content (decoded from base64).
   */
  async getFile(filePath: string): Promise<{ content: string; sha: string } | null> {
    const url = `${this.url(filePath)}?ref=${this.branch}`;
    const res = await fetch(url, { headers: this.headers(), cache: "no-store" });

    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub getFile ${filePath}: ${res.status}`);

    const data = (await res.json()) as { content: string; sha: string };
    const content = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8");
    return { content, sha: data.sha };
  }

  /**
   * Get a single file's raw binary content.
   */
  async getFileRaw(filePath: string): Promise<{ buffer: Buffer; sha: string } | null> {
    const url = `${this.url(filePath)}?ref=${this.branch}`;
    const res = await fetch(url, { headers: this.headers(), cache: "no-store" });

    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub getFileRaw ${filePath}: ${res.status}`);

    const data = (await res.json()) as { content: string; sha: string };
    const buffer = Buffer.from(data.content.replace(/\n/g, ""), "base64");
    return { buffer, sha: data.sha };
  }

  /**
   * Create or update a file. If sha is provided, it's an update.
   */
  async putFile(
    filePath: string,
    content: Buffer | string,
    message: string,
    sha?: string,
  ): Promise<{ sha: string; path: string }> {
    const b64 = typeof content === "string"
      ? Buffer.from(content, "utf-8").toString("base64")
      : content.toString("base64");

    const body: Record<string, unknown> = {
      message,
      content: b64,
      branch: this.branch,
    };
    if (sha) body.sha = sha;

    const res = await fetch(this.url(filePath), {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`GitHub putFile ${filePath}: ${res.status} ${text}`);
    }

    const data = (await res.json()) as GitHubPutResponse;
    return { sha: data.content.sha, path: data.content.path };
  }

  /**
   * Delete a file. Requires the file's SHA.
   */
  async deleteFile(filePath: string, sha: string, message: string): Promise<void> {
    const res = await fetch(this.url(filePath), {
      method: "DELETE",
      headers: this.headers(),
      body: JSON.stringify({ message, sha, branch: this.branch }),
    });

    if (res.status === 404) return; // Already gone
    if (!res.ok) throw new Error(`GitHub deleteFile ${filePath}: ${res.status}`);
  }
}

// ─── Factory: get client for active site ────────────────────

/**
 * Returns a GitHubMediaClient for the active site, or null if the site
 * isn't a GitHub-backed site.
 */
export async function getGitHubMediaClient(): Promise<{
  client: GitHubMediaClient;
  site: SiteEntry;
} | null> {
  const registry = await loadRegistry();
  if (!registry) return null;

  let orgId: string;
  let siteId: string;
  try {
    const cookieStore = await cookies();
    orgId = cookieStore.get("cms-active-org")?.value ?? registry.defaultOrgId;
    siteId = cookieStore.get("cms-active-site")?.value ?? registry.defaultSiteId;
  } catch {
    orgId = registry.defaultOrgId;
    siteId = registry.defaultSiteId;
  }

  const site = findSite(registry, orgId, siteId);
  const resolvedSite = site ?? getDefaultSite(registry)?.site;
  if (!resolvedSite || resolvedSite.adapter !== "github") return null;

  const gh = resolvedSite.github;
  if (!gh) return null;

  // Resolve token
  let token: string;
  if (gh.token === "oauth") {
    const cookieStore = await cookies();
    const t = cookieStore.get("github-token")?.value;
    if (!t) throw new Error("GitHub not connected — connect via Sites → Settings");
    token = t;
  } else if (gh.token.startsWith("env:")) {
    const envVar = gh.token.slice(4);
    token = process.env[envVar] ?? "";
    if (!token) throw new Error(`Environment variable "${envVar}" not set`);
  } else {
    token = gh.token;
  }

  const client = new GitHubMediaClient(
    gh.owner,
    gh.repo,
    gh.branch ?? "main",
    token,
  );

  return { client, site: resolvedSite };
}
