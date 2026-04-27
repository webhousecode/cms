import { exchangePairingToken, ApiError } from "@/api/client";
import { upsertServer, setLastUserEmail } from "@/lib/prefs";
import { parseQrPayload } from "@/lib/qr";

export async function consumePairingDeepLink(rawUrl: string): Promise<{
  email: string;
  serverUrl: string;
}> {
  const payload = parseQrPayload(rawUrl);
  if (!payload.pairingToken || !payload.serverUrl) {
    throw new Error("This QR code is not a webhouse.app pairing link");
  }

  // Add/update server in list (no JWT yet) so client can reach it during exchange
  await upsertServer(payload.serverUrl, null);

  try {
    const result = await exchangePairingToken(payload.pairingToken, payload.serverUrl);
    // Update server entry with JWT + user info
    await upsertServer(payload.serverUrl, result.jwt, {
      name: new URL(payload.serverUrl).hostname,
      email: result.user.email,
    });
    await setLastUserEmail(result.user.email);
    return { email: result.user.email, serverUrl: payload.serverUrl };
  } catch (err) {
    const message = err instanceof ApiError ? err.message : (err as Error).message;
    throw new Error(`Pairing failed: ${message}`);
  }
}
