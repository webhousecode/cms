/**
 * F126 Phase 4 — Built-in Docker image presets for common frameworks.
 *
 * Usage in cms.config.ts:
 *   build: { command: 'php artisan build', docker: 'laravel' }
 *   // expands to { image: 'php:8.3-cli', workdir: '/workspace' }
 */
import type { DockerConfig } from "@webhouse/cms";

export const DOCKER_PRESETS: Record<string, DockerConfig> = {
  php: { image: "php:8.3-cli", workdir: "/workspace" },
  laravel: { image: "php:8.3-cli", workdir: "/workspace" },
  python: { image: "python:3.12-slim", workdir: "/workspace" },
  django: { image: "python:3.12-slim", workdir: "/workspace" },
  ruby: { image: "ruby:3.3", workdir: "/workspace" },
  rails: { image: "ruby:3.3", workdir: "/workspace" },
  go: { image: "golang:1.22", workdir: "/workspace" },
  hugo: { image: "klakegg/hugo:0.111.3-ext-alpine", workdir: "/workspace" },
  node: { image: "node:22-alpine", workdir: "/workspace" },
  dotnet: { image: "mcr.microsoft.com/dotnet/sdk:8.0", workdir: "/workspace" },
};

/**
 * Resolve a docker config — string presets get expanded, objects pass through.
 */
export function resolveDockerConfig(
  docker: DockerConfig | string | undefined,
): DockerConfig | undefined {
  if (!docker) return undefined;
  if (typeof docker === "string") {
    const preset = DOCKER_PRESETS[docker];
    if (!preset) {
      throw new Error(
        `Unknown Docker preset "${docker}". Available: ${Object.keys(DOCKER_PRESETS).join(", ")}`,
      );
    }
    return { ...preset };
  }
  return docker;
}
