import { useState } from "react";
import { useLocation } from "wouter";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { ping, ApiError } from "@/api/client";
import { setServerUrl } from "@/lib/prefs";

/**
 * First-launch screen. User enters their CMS server URL.
 * We validate by hitting GET /api/mobile/ping before storing.
 *
 * Phase 1 stub — UI is functional but visual design will be refined later.
 */
export function Onboarding() {
  const [, setLocation] = useLocation();
  const [url, setUrl] = useState("https://localhost:3010");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleConnect() {
    setError(null);
    setLoading(true);
    try {
      // Normalize: ensure https:// prefix, strip trailing slash
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

  return (
    <Screen className="px-6">
      <div className="flex flex-1 flex-col justify-center gap-8 py-12">
        <header className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight">webhouse.app</h1>
          <p className="mt-2 text-sm text-white/60">
            Connect to your CMS server to get started
          </p>
        </header>

        <div className="flex flex-col gap-4">
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
          <Button onClick={handleConnect} loading={loading}>
            Connect
          </Button>
        </div>

        <p className="text-center text-xs text-white/40">
          Don't have a CMS yet? Visit{" "}
          <span className="text-brand-gold">webhouse.app</span> to get one.
        </p>
      </div>
    </Screen>
  );
}
