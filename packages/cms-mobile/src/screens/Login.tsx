import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { Logo } from "@/components/Logo";
import { QrScanner } from "@/components/QrScanner";
import { ApiError, exchangePairingToken } from "@/api/client";
import { setJwt, setLastUserEmail } from "@/lib/prefs";
import { onDeepLink } from "@/lib/bridge";
import { parseQrPayload } from "@/lib/qr";

/**
 * Login screen — shown when user has a stored server URL but no JWT
 * (i.e. after sign-out). Only offers QR pairing since:
 *   1. BYO server model means email/password needs a server URL context
 *   2. Most admins use 2FA anyway, so password login is blocked
 *   3. QR pairing is the canonical auth flow for mobile
 */
export function Login() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

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

  async function handleQrScanned(data: string) {
    setShowScanner(false);
    const payload = parseQrPayload(data);
    if (payload.pairingToken) {
      await handlePairingToken(payload.pairingToken);
    } else {
      setError("Scanned code is not a webhouse.app pairing QR");
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
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <Logo size={64} withWordmark />
        <h1 className="text-2xl font-semibold">Sign in</h1>

        <p className="text-sm text-white/60 text-center max-w-[280px]">
          Go to{" "}
          <span className="text-brand-gold">Account Preferences</span>
          {" "}and select the{" "}
          <span className="text-brand-gold">Mobile</span>
          {" "}tab, then scan the QR code displayed there.
        </p>

        <Button
          onClick={() => setShowScanner(true)}
          loading={loading}
          className="w-full max-w-[280px]"
        >
          Scan pairing QR
        </Button>

        {error && (
          <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300 max-w-[280px] text-center">
            {error}
          </p>
        )}
      </div>
    </Screen>
  );
}
