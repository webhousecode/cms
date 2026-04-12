/**
 * F126 Phase 3 — Resolve the active build profile from config.
 *
 * When profiles[] is set, picks the named profile (or default).
 * When profiles[] is absent, synthesizes a profile from the root
 * command/outDir/env/timeout fields (Phase 1 compatibility).
 */
import type { BuildConfig, BuildProfile, DockerConfig } from "@webhouse/cms";
import { resolveDockerConfig } from "./docker-presets";

/** A resolved profile — always has command + outDir. */
export interface ResolvedProfile {
  name: string;
  command: string;
  outDir: string;
  workingDir?: string;
  /** Resolved Docker config (presets expanded). */
  docker?: DockerConfig;
  env?: Record<string, string>;
  timeout?: number;
  description?: string;
  previewUrl?: string;
}

/**
 * Resolve which build profile to use.
 *
 * Priority:
 * 1. Named profile (if profileName matches a profiles[] entry)
 * 2. Default profile (if defaultProfile is set)
 * 3. First profile in profiles[]
 * 4. Root-level command/outDir (Phase 1 compat — synthesized as "default")
 * 5. null (no custom build command configured)
 */
export function resolveProfile(
  build: BuildConfig | undefined,
  profileName?: string,
): ResolvedProfile | null {
  if (!build) return null;

  // If profiles are configured, use them
  if (build.profiles && build.profiles.length > 0) {
    let profile: BuildProfile | undefined;

    if (profileName) {
      profile = build.profiles.find((p) => p.name === profileName);
    }
    if (!profile && build.defaultProfile) {
      profile = build.profiles.find((p) => p.name === build.defaultProfile);
    }
    if (!profile) {
      profile = build.profiles[0];
    }

    if (profile) {
      return {
        name: profile.name,
        command: profile.command,
        outDir: profile.outDir,
        workingDir: profile.workingDir ?? build.workingDir,
        env: { ...build.env, ...profile.env },
        timeout: profile.timeout ?? build.timeout,
        description: profile.description,
        previewUrl: profile.previewUrl,
        docker: resolveDockerConfig(profile.docker ?? build.docker),
      };
    }
  }

  // Fall back to root-level command (Phase 1 compat)
  if (build.command) {
    return {
      name: "default",
      command: build.command,
      outDir: build.outDir ?? "dist",
      workingDir: build.workingDir,
      env: build.env,
      timeout: build.timeout,
      description: undefined,
      previewUrl: undefined,
      docker: resolveDockerConfig(build.docker),
    };
  }

  return null;
}

/**
 * List all available profile names for a build config.
 * Returns empty array if no custom build is configured.
 */
export function listProfiles(
  build: BuildConfig | undefined,
): { name: string; description?: string; isDefault: boolean }[] {
  if (!build) return [];

  if (build.profiles && build.profiles.length > 0) {
    const defaultName =
      build.defaultProfile ?? build.profiles[0]?.name ?? "";
    return build.profiles.map((p) => ({
      name: p.name,
      description: p.description,
      isDefault: p.name === defaultName,
    }));
  }

  if (build.command) {
    return [{ name: "default", description: undefined, isDefault: true }];
  }

  return [];
}
