import { exchangePairingToken, ApiError } from "@/api/client";
import { setJwt, setLastUserEmail, setServerUrl } from "@/lib/prefs";
import { parseQrPayload } from "@/lib/qr";

/**
 * One-shot QR pairing flow.
 *
 * The QR (issued by /api/mobile/pair) encodes a `webhouseapp://login?...`
 * URL containing BOTH the server URL and the pairing token. So a brand-new
 * install can scan a QR and skip the onboarding "type your server URL" step
 * entirely — same UX as scanning a WiFi QR code.
 *
 * Returns the user email on success or throws on failure.
 */
export async function consumePairingDeepLink(rawUrl: string): Promise<{
  email: string;
  serverUrl: string;
}> {
  const payload = parseQrPayload(rawUrl);
  if (!payload.pairingToken || !payload.serverUrl) {
    throw new Error("This QR code is not a webhouse.app pairing link");
  }

  // Persist the server URL FIRST so the API client can find it on retry
  await setServerUrl(payload.serverUrl);

  try {
    const result = await exchangePairingToken(payload.pairingToken, payload.serverUrl);
    await setJwt(result.jwt);
    await setLastUserEmail(result.user.email);
    return { email: result.user.email, serverUrl: payload.serverUrl };
  } catch (err) {
    const message = err instanceof ApiError ? err.message : (err as Error).message;
    throw new Error(`Pairing failed: ${message}`);
  }
}
