import { useState } from "react";
import { useLocation } from "wouter";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Logo } from "@/components/Logo";
import { QrScanner } from "@/components/QrScanner";
import { ApiError, ping } from "@/api/client";
import { setServerUrl } from "@/lib/prefs";
import { consumePairingDeepLink } from "@/lib/pairing-flow";
import { parseQrPayload } from "@/lib/qr";

/**
 * First-launch screen.
 *
 * Primary path: "Scan pairing QR" opens a live camera scanner that
 * auto-detects QR codes. The QR from desktop CMS encodes both server
 * URL and pairing token, so one scan → logged in.
 *
 * Fallback: type the CMS server URL manually → Login screen.
 */
export function Onboarding() {
  const [, setLocation] = useLocation();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

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

  async function handleQrScanned(data: string) {
    setShowScanner(false);
    setError(null);

    const payload = parseQrPayload(data);
    if (payload.pairingToken && payload.serverUrl) {
      // QR contains both server + token → full pairing in one go
      setLoading(true);
      try {
        await consumePairingDeepLink(data);
        setLocation("/home");
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    } else if (data.startsWith("http://") || data.startsWith("https://")) {
      // Plain URL — set it as server URL and go to login
      setUrl(data);
      setError("Scanned a URL but not a pairing QR. Tap Connect to use it as server URL.");
    } else {
      setError(`Scanned code is not a webhouse.app pairing QR: "${data.slice(0, 50)}..."`);
    }
  }

  if (showScanner) {
    return (
      <QrScanner
        onScan={handleQrScanned}
        onClose={() => setShowScanner(false)}
      />
    );
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
          {/* Primary path — live QR scanner */}
          <Button onClick={() => setShowScanner(true)} loading={loading}>
            Scan pairing QR
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
            onChange={(e) => { setUrl(e.target.value); setError(null); }}
            onClear={() => { setUrl(""); setError(null); }}
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
