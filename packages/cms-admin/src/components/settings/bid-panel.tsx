"use client";

/**
 * F199.2 — Broberg ID on Account → Security.
 *
 * Connecting is a full-page trip to id.broberg.ai and back; the callback binds
 * BID's `sub` to the signed-in user. Hidden entirely when the server has no BID
 * configuration (ship dark).
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export function BidPanel() {
  const params = useSearchParams();
  const [state, setState] = useState<{ configured: boolean; linked: boolean } | null>(null);
  const [error, setError] = useState("");
  const [going, setGoing] = useState(false);
  const justLinked = params.get("bid") === "linked";

  useEffect(() => {
    fetch("/api/auth/bid/status", { credentials: "same-origin" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        setState((await r.json()) as { configured: boolean; linked: boolean });
      })
      .catch(() => setError("Could not load Broberg ID status"));
  }, []);

  if (!state?.configured && !error) return null;

  return (
    <div data-testid="account-bid-panel" className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3
            className="text-muted-foreground dark:text-white"
            style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", margin: 0 }}
          >
            Broberg ID
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sign in with your Broberg ID account — the same login across broberg.ai services.
          </p>
        </div>
        {state && (
          <span data-testid="account-bid-status" className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
            {state.linked ? "CONNECTED" : "NOT CONNECTED"}
          </span>
        )}
      </div>

      {justLinked && state?.linked && (
        <p className="text-xs" style={{ color: "var(--primary)" }}>Broberg ID is connected. You can now sign in with it.</p>
      )}
      {error && <p className="text-xs" style={{ color: "var(--destructive)" }}>{error}</p>}

      {state && !state.linked && (
        <a
          data-testid="account-bid-connect"
          href={`/api/auth/bid/login?link=1&returnTo=${encodeURIComponent("/admin/account?tab=security")}`}
          onClick={() => setGoing(true)}
          className="inline-block text-xs px-3 py-1.5 rounded-md border border-border bg-card text-foreground hover:bg-accent active:opacity-70 transition-colors"
          style={{ cursor: going ? "wait" : "pointer", textDecoration: "none" }}
        >
          {going ? "Opening Broberg ID…" : "Connect Broberg ID"}
        </a>
      )}
    </div>
  );
}
