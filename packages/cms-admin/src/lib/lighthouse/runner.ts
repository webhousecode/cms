/**
 * F98 — Unified Lighthouse audit runner.
 *
 * PSI API for remote URLs (always available).
 * Falls back gracefully — no optional deps needed.
 */
import { runPsiAudit } from "./psi-engine";
import { appendResult } from "./history";
import type { LighthouseResult } from "./types";

/**
 * Default PSI API key provided by webhouse.app.
 * Restricted to pagespeedonline.googleapis.com only — no other APIs.
 * 25K scans/day shared across all CMS instances without their own key.
 */
const DEFAULT_PSI_KEY = "AIzaSyCaSLSeT9STPaE4sFWngpsQTS3loN_l1U4";

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

  const apiKey = options?.apiKey || DEFAULT_PSI_KEY;
  const result = await runPsiAudit(url, strategy, apiKey);

  if (options?.save !== false) {
    await appendResult(result);
  }

  return result;
}

/** Check which engines are available */
export function getAvailableEngines(): { psi: boolean; local: boolean } {
  return { psi: true, local: false };
}
