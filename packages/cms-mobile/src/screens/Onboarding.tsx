import { useState } from "react";
import { useLocation } from "wouter";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Logo } from "@/components/Logo";
import { ApiError, ping } from "@/api/client";
import { setServerUrl } from "@/lib/prefs";
import { consumePairingDeepLink } from "@/lib/pairing-flow";
import { scanQrFromCamera, scanQrFromPhotoLibrary } from "@/lib/qr";

/**
 * First-launch screen.
 *
 * Two paths to get connected:
 *  1. Scan a pairing QR from the desktop CMS — gives URL + token in one go,
 *     skips this screen entirely (handled by App-level deep link listener).
 *  2. Type the CMS server URL manually, validate via /api/mobile/ping,
 *     then go to the Login screen for credentials.
 */
export function Onboarding() {
  const [, setLocation] = useLocation();
  const [url, setUrl] = useState("https://localhost:3010");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);

  async function handleConnect() {
    setError(null);
    setLoading(true);
    try {
      let normalized = url.trim();
      if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
        normalized = `https://${normalized}`;
      }
      normalized = normalized.replace(/\/$/, "");

      const result = await ping(normalized);
      if (result.product !== "webhouse-cms") {
        throw new Error("This server doesn't look like a webhouse.app CMS");
      }
      await setServerUrl(normalized);
      setLocation("/login");
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `Could not reach server: ${err.message}`
          : (err as Error).message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleScanFromQr(source: "camera" | "photo") {
    setError(null);
    setScanning(true);
    try {
      const payload =
        source === "camera"
          ? await scanQrFromCamera()
          : await scanQrFromPhotoLibrary();

      if (!payload) {
        // user cancelled — silent
        return;
      }
      if (!payload.pairingToken || !payload.serverUrl) {
        throw new Error("Scanned code is not a webhouse.app pairing QR");
      }
      await consumePairingDeepLink(payload.raw);
      setLocation("/home");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setScanning(false);
    }
  }

  return (
    <Screen className="px-6">
      <div className="flex flex-1 flex-col justify-between py-12">
        {/* Top: brand mark */}
        <header className="flex flex-col items-center gap-3 pt-8">
          <Logo size={96} withWordmark />
          <p className="mt-2 text-sm text-white/60 text-center">
            Connect to your CMS server to get started
          </p>
        </header>

        {/* Middle: actions */}
        <div className="flex flex-col gap-4">
          {/* Primary path — scan QR */}
          <Button onClick={() => handleScanFromQr("camera")} loading={scanning}>
            Scan pairing QR
          </Button>
          <Button variant="secondary" onClick={() => handleScanFromQr("photo")}>
            Choose QR from photos
          </Button>

          <div className="flex items-center gap-3 my-2">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs uppercase tracking-wider text-white/40">
              or enter URL
            </span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <Input
            label="CMS server URL"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="https://demo.webhouse.app"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            error={error ?? undefined}
          />
          <Button variant="secondary" onClick={handleConnect} loading={loading}>
            Connect
          </Button>
        </div>

        {/* Bottom: footer */}
        <p className="text-center text-xs text-white/40">
          Don't have a CMS yet? Visit{" "}
          <span className="text-brand-gold">webhouse.app</span> to get one.
        </p>
      </div>
    </Screen>
  );
}
