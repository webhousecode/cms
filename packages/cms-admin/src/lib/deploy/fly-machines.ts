/**
 * F119 — Fly.io presets for the deploy wizard.
 *
 * The API client itself is FlyClient from @broberg/deploy-core (F200).
 * This file only holds the presets, because a client component imports them.
 */

/**
 * Fly.io region presets. Default: arn (Stockholm).
 */
export const FLY_REGIONS = [
  { value: "arn", label: "Stockholm, SE (arn)" },
  { value: "fra", label: "Frankfurt, DE (fra)" },
  { value: "lhr", label: "London, UK (lhr)" },
  { value: "ams", label: "Amsterdam, NL (ams)" },
  { value: "cdg", label: "Paris, FR (cdg)" },
  { value: "iad", label: "Virginia, US (iad)" },
  { value: "sjc", label: "San Jose, US (sjc)" },
  { value: "nrt", label: "Tokyo, JP (nrt)" },
  { value: "syd", label: "Sydney, AU (syd)" },
  { value: "sin", label: "Singapore (sin)" },
] as const;

/**
 * VM size presets for the wizard.
 */
export const FLY_VM_SIZES = [
  { value: "shared-cpu-1x-256", label: "Shared 1x — 256 MB", cpuKind: "shared", cpus: 1, memoryMb: 256 },
  { value: "shared-cpu-1x-512", label: "Shared 1x — 512 MB", cpuKind: "shared", cpus: 1, memoryMb: 512 },
  { value: "shared-cpu-2x-1024", label: "Shared 2x — 1 GB", cpuKind: "shared", cpus: 2, memoryMb: 1024 },
  { value: "performance-1x-2048", label: "Performance 1x — 2 GB", cpuKind: "performance", cpus: 1, memoryMb: 2048 },
] as const;
