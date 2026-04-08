import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { unlockBiometricJwt } from "@/lib/bridge";
import { setJwt } from "@/lib/prefs";

/**
 * Biometric unlock screen. Shown on subsequent launches when the user
 * has stored their JWT in the keychain via FaceID/TouchID.
 */
export function Biometric() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void attemptUnlock();
  }, []);

  async function attemptUnlock() {
    setError(null);
    const jwt = await unlockBiometricJwt();
    if (jwt) {
      await setJwt(jwt);
      setLocation("/home");
    } else {
      setError("Biometric unlock failed. Try again or sign in with email.");
    }
  }

  return (
    <Screen className="px-6">
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <div className="text-6xl">🔒</div>
        <h1 className="text-xl font-semibold">Unlock webhouse.app</h1>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Button onClick={attemptUnlock}>Unlock with biometrics</Button>
          <Button variant="ghost" onClick={() => setLocation("/login")}>
            Sign in with email
          </Button>
        </div>
      </div>
    </Screen>
  );
}
