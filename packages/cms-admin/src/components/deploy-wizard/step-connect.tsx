"use client";

import { useState } from "react";
import { CheckCircle, Loader2, AlertCircle, ExternalLink } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import type { WizardState } from "./deploy-wizard";

interface Props {
  flyToken: string;
  flyOrg: string;
  onUpdate: (partial: Partial<WizardState>) => void;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.4rem 0.6rem",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--background)",
  color: "var(--foreground)",
  fontSize: "0.8rem",
  fontFamily: "monospace",
};

export function StepConnect({ flyToken, flyOrg, onUpdate }: Props) {
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<Array<{ slug: string; name: string }>>([]);

  async function handleVerify() {
    if (!flyToken) return;
    setVerifying(true);
    setError(null);
    setVerified(false);

    try {
      const res = await fetch("https://api.fly.io/graphql", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${flyToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `{ organizations { nodes { slug name type } } }`,
        }),
      });

      if (!res.ok) {
        throw new Error(`Token verification failed (HTTP ${res.status})`);
      }

      const data = await res.json();
      const orgNodes = data.data?.organizations?.nodes ?? [];

      if (orgNodes.length === 0) {
        throw new Error("No organizations found for this token");
      }

      setOrgs(orgNodes);
      // Auto-select "personal" org if available, otherwise first org
      const personalOrg = orgNodes.find((o: { slug: string }) => o.slug === "personal");
      onUpdate({ flyOrg: personalOrg?.slug ?? orgNodes[0].slug });
      setVerified(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div>
      <SectionHeading>Connect to Fly.io</SectionHeading>
      <p style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "1.5rem" }}>
        Enter your Fly.io API token to deploy directly. Your token is used only for this deploy session and is never stored.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: "28rem" }}>
        {/* Token input */}
        <div>
          <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--muted-foreground)", display: "block", marginBottom: "0.3rem" }}>
            API Token
          </label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="password"
              value={flyToken}
              onChange={(e) => {
                onUpdate({ flyToken: e.target.value, flyOrg: "" });
                setVerified(false);
                setError(null);
              }}
              placeholder="fo1_..."
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={handleVerify}
              disabled={!flyToken || verifying}
              style={{
                padding: "0.4rem 0.8rem",
                borderRadius: 6,
                border: "none",
                background: flyToken ? "#F7BB2E" : "var(--muted)",
                color: flyToken ? "#0D0D0D" : "var(--muted-foreground)",
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: flyToken && !verifying ? "pointer" : "not-allowed",
                whiteSpace: "nowrap",
              }}
            >
              {verifying ? (
                <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} />
              ) : "Verify"}
            </button>
          </div>
          <a
            href="https://fly.io/dashboard/personal/tokens"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: "0.68rem", color: "var(--muted-foreground)", display: "inline-flex", alignItems: "center", gap: "0.25rem", marginTop: "0.35rem" }}
          >
            Get a token at fly.io/dashboard
            <ExternalLink style={{ width: 10, height: 10 }} />
          </a>
        </div>

        {/* Verification result */}
        {verified && (
          <div style={{
            padding: "0.75rem 1rem",
            borderRadius: 8,
            background: "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.2)",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}>
            <CheckCircle style={{ width: 16, height: 16, color: "#22c55e", flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: "0.8rem", fontWeight: 500 }}>Token verified</div>
              <div style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>
                Organization: {flyOrg}
                {orgs.length > 1 && ` (${orgs.length} available)`}
              </div>
            </div>
          </div>
        )}

        {/* Org selector (if multiple orgs) */}
        {verified && orgs.length > 1 && (
          <div>
            <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--muted-foreground)", display: "block", marginBottom: "0.3rem" }}>
              Organization
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {orgs.map((org) => (
                <button
                  key={org.slug}
                  onClick={() => onUpdate({ flyOrg: org.slug })}
                  type="button"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.5rem 0.75rem",
                    borderRadius: 6,
                    border: flyOrg === org.slug ? "2px solid #F7BB2E" : "1px solid var(--border)",
                    background: flyOrg === org.slug ? "rgba(247, 187, 46, 0.05)" : "transparent",
                    color: "var(--foreground)",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{org.name}</span>
                  <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>({org.slug})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding: "0.75rem 1rem",
            borderRadius: 8,
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}>
            <AlertCircle style={{ width: 16, height: 16, color: "#ef4444", flexShrink: 0 }} />
            <span style={{ fontSize: "0.78rem", color: "#ef4444" }}>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
