/**
 * F98 — Unified Lighthouse audit runner.
 *
 * PSI API for remote URLs (always available).
 * Falls back gracefully — no optional deps needed.
 */
import { runPsiAudit } from "./psi-engine";
import { appendResult } from "./history";
import type { LighthouseResult } from "./types";

export async function runAudit(
  url: string,
  options?: {
    strategy?: "mobile" | "desktop";
    apiKey?: string;
    save?: boolean;
  },
): Promise<LighthouseResult> {
  const strategy = options?.strategy ?? "mobile";
  const isLocalhost = url.includes("localhost") || url.includes("127.0.0.1");

  if (isLocalhost) {
    throw new Error("Cannot audit localhost URLs — PSI API requires a public URL. Deploy your site first, then scan the production URL.");
  }

  const result = await runPsiAudit(url, strategy, options?.apiKey);

  if (options?.save !== false) {
    await appendResult(result);
  }

  return result;
}

/** Check which engines are available */
export function getAvailableEngines(): { psi: boolean; local: boolean } {
  return { psi: true, local: false };
}
