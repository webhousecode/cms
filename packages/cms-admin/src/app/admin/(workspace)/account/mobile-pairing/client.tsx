"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface PairingResponse {
  sessionId: string;
  expiresAt: number;
  deepLink: string;
  qrDataUrl: string;
  serverUrl: string;
}

/**
 * Client component for /admin/account/mobile-pairing.
 *
 * Calls POST /api/mobile/pair to mint a one-time pairing token + QR,
 * displays it, counts down to expiry, and offers a "Generate new code"
 * button. The QR encodes a webhouseapp:// deep link the mobile app
 * understands.
 */
export function MobilePairingClient() {
  const [data, setData] = useState<PairingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const generate = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/mobile/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as PairingResponse;
      setData(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Generate on mount — ref guards against React StrictMode double-fire
  const generatedRef = useRef(false);
  useEffect(() => {
    if (generatedRef.current) return;
    generatedRef.current = true;
    void generate();
  }, [generate]);

  // Countdown
  useEffect(() => {
    if (!data) return;
    const tick = () => {
      const left = Math.max(0, Math.floor((data.expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [data]);

  const expired = data && secondsLeft === 0;

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center gap-4">
        {data && !expired ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.qrDataUrl}
              alt="Mobile pairing QR code"
              width={260}
              height={260}
              className="rounded-lg"
            />
            <p className="text-xs font-mono bg-muted rounded px-2 py-1 text-muted-foreground break-all text-center max-w-[260px]">
              {data.serverUrl}
            </p>
            <p className="text-sm text-muted-foreground">
              Expires in <span className="font-mono">{secondsLeft}s</span>
            </p>
          </>
        ) : loading ? (
          <div className="h-[260px] w-[260px] flex items-center justify-center text-muted-foreground">
            Generating...
          </div>
        ) : (
          <div className="h-[260px] w-[260px] flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <p>QR code expired</p>
          </div>
        )}

        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 active:scale-[0.98] transition disabled:opacity-50"
        >
          {expired ? "Generate new code" : "Refresh"}
        </button>
      </div>

      <details className="text-sm text-muted-foreground">
        <summary className="cursor-pointer hover:text-foreground">
          How to use this
        </summary>
        <ol className="mt-3 ml-5 list-decimal space-y-2">
          <li>Open the webhouse.app app on your phone</li>
          <li>Tap <strong>Sign in</strong> → <strong>QR code</strong></li>
          <li>Tap <strong>Scan QR with camera</strong> and point it at this code</li>
          <li>You're in — biometric unlock works on the next launch</li>
        </ol>
        {data && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs">Developer: deep link URL</summary>
            <code className="mt-2 block break-all rounded bg-muted p-2 text-xs">
              {data.deepLink}
            </code>
            <p className="mt-2 text-xs">
              On the iOS simulator (no camera), open this URL via:
            </p>
            <code className="mt-1 block break-all rounded bg-muted p-2 text-xs">
              xcrun simctl openurl booted &quot;{data.deepLink}&quot;
            </code>
          </details>
        )}
      </details>
    </div>
  );
}
