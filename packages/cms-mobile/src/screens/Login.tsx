import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { ApiError, exchangePairingToken, loginWithPassword } from "@/api/client";
import { setJwt, setLastUserEmail } from "@/lib/prefs";
import { onDeepLink } from "@/lib/bridge";
import { parseQrPayload, scanQrFromCamera, scanQrFromPhotoLibrary } from "@/lib/qr";

/**
 * Login screen with two paths:
 *  1. QR — primary. Scans desktop CMS pairing QR and exchanges for JWT.
 *  2. Email/password — fallback against /api/mobile/login.
 *
 * Also listens for `webhouseapp://login?token=...` deep links so the iOS
 * sim can be auto-logged-in via `xcrun simctl openurl`.
 */
export function Login() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<"qr" | "email">("qr");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Subscribe to deep links so the sim auto-login script works.
  useEffect(() => {
    const off = onDeepLink((url) => {
      const payload = parseQrPayload(url);
      if (payload.pairingToken) {
        void handlePairingToken(payload.pairingToken);
      }
    });
    return off;
  }, []);

  async function handlePairingToken(token: string) {
    setError(null);
    setLoading(true);
    try {
      const result = await exchangePairingToken(token);
      await setJwt(result.jwt);
      await setLastUserEmail(result.user.email);
      setLocation("/home");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleScanCamera() {
    const payload = await scanQrFromCamera();
    if (payload?.pairingToken) {
      void handlePairingToken(payload.pairingToken);
    } else if (payload) {
      setError("Scanned code is not a webhouse.app pairing QR");
    }
  }

  async function handleScanPhoto() {
    const payload = await scanQrFromPhotoLibrary();
    if (payload?.pairingToken) {
      void handlePairingToken(payload.pairingToken);
    } else if (payload) {
      setError("Selected image does not contain a webhouse.app pairing QR");
    }
  }

  async function handleEmailLogin() {
    setError(null);
    setLoading(true);
    try {
      const result = await loginWithPassword(email, password);
      await setJwt(result.jwt);
      await setLastUserEmail(result.user.email);
      setLocation("/home");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen className="px-6">
      <div className="flex flex-1 flex-col gap-6 py-10">
        <h1 className="text-2xl font-semibold">Sign in</h1>

        {/* Tab switcher */}
        <div className="flex gap-2 rounded-xl bg-brand-darkSoft p-1">
          <button
            onClick={() => setTab("qr")}
            className={`flex-1 rounded-lg py-2 text-sm font-medium ${
              tab === "qr" ? "bg-brand-gold text-brand-dark" : "text-white/60"
            }`}
          >
            QR code
          </button>
          <button
            onClick={() => setTab("email")}
            className={`flex-1 rounded-lg py-2 text-sm font-medium ${
              tab === "email" ? "bg-brand-gold text-brand-dark" : "text-white/60"
            }`}
          >
            Email
          </button>
        </div>

        {tab === "qr" ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-white/60">
              Open your CMS in a browser, go to{" "}
              <span className="text-brand-gold">Account → Pair mobile device</span>
              , and scan the QR code shown there.
            </p>
            <Button onClick={handleScanCamera} loading={loading}>
              Scan QR with camera
            </Button>
            <Button variant="secondary" onClick={handleScanPhoto}>
              Choose from photos
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Input
              label="Email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button onClick={handleEmailLogin} loading={loading}>
              Sign in
            </Button>
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>
        )}
      </div>
    </Screen>
  );
}
