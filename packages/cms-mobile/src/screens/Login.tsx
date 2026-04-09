import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Logo } from "@/components/Logo";
import { QrScanner } from "@/components/QrScanner";
import { ApiError, exchangePairingToken, loginWithPassword } from "@/api/client";
import { setJwt, setLastUserEmail } from "@/lib/prefs";
import { onDeepLink } from "@/lib/bridge";
import { parseQrPayload } from "@/lib/qr";

export function Login() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<"qr" | "email">("qr");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      <div className="flex flex-1 flex-col gap-6 py-10">
        <div className="flex flex-col items-center gap-3 pt-4 pb-2">
          <Logo size={64} withWordmark />
        </div>
        <h1 className="text-2xl font-semibold text-center">Sign in</h1>

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
              Go to{" "}
              <span className="text-brand-gold">Account Preferences</span>
              {" "}and select the{" "}
              <span className="text-brand-gold">Mobile</span>
              {" "}tab, and scan the QR code displayed there.
            </p>
            <Button onClick={() => setShowScanner(true)} loading={loading}>
              Scan QR with camera
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
