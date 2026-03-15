/**
 * Media Adapter Factory — returns the correct MediaAdapter for the active site.
 *
 * Usage in any API route:
 *   const adapter = await getMediaAdapter();
 *   const files = await adapter.listMedia();
 *
 * The caller never needs to know if it's filesystem, GitHub, or Supabase.
 */
export { type MediaAdapter, type MediaFileInfo, type MediaType, type InteractiveMeta } from "./types";

import type { MediaAdapter } from "./types";
import { FilesystemMediaAdapter } from "./filesystem";
import { GitHubMediaAdapter } from "./github";
import { getGitHubMediaClient } from "../github-media";
import { getActiveSitePaths } from "../site-paths";

/**
 * Get the appropriate MediaAdapter for the currently active site.
 * Detects adapter type from site registry and returns the right implementation.
 */
export async function getMediaAdapter(): Promise<MediaAdapter> {
  // Try GitHub first
  const gh = await getGitHubMediaClient();
  if (gh) {
    const { client, site } = gh;
    const ghConfig = site.github!;
    return new GitHubMediaAdapter(
      client,
      ghConfig.owner,
      ghConfig.repo,
      ghConfig.branch ?? "main",
    );
  }

  // TODO: Supabase adapter
  // const supabase = await getSupabaseMediaClient();
  // if (supabase) return new SupabaseMediaAdapter(supabase);

  // Default: local filesystem
  const paths = await getActiveSitePaths();
  return new FilesystemMediaAdapter(paths.uploadDir, paths.dataDir);
}
