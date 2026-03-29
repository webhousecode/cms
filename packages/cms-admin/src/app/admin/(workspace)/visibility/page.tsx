"use client";

import { ActionBar, ActionBarBreadcrumb } from "@/components/action-bar";
import { Eye } from "lucide-react";

export default function VisibilityPage() {
  return (
    <>
      <ActionBar>
        <ActionBarBreadcrumb items={["Tools", "Visibility"]} />
      </ActionBar>
      <div style={{ padding: "2rem", maxWidth: "64rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
          <Eye style={{ width: 24, height: 24, color: "#F7BB2E" }} />
          <div>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>Visibility</h1>
            <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: 0 }}>
              SEO + GEO — how visible is your site in search engines and AI platforms
            </p>
          </div>
        </div>

        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem",
          marginBottom: "2rem",
        }}>
          {/* SEO Score Card */}
          <div style={{
            padding: "1.25rem", borderRadius: "10px",
            border: "1px solid var(--border)", background: "var(--card)",
          }}>
            <p style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted-foreground)", marginBottom: "0.5rem" }}>
              SEO Score
            </p>
            <p style={{ fontSize: "2rem", fontWeight: 700, color: "var(--foreground)", margin: 0 }}>—</p>
            <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", marginTop: "0.25rem" }}>
              Search engine visibility
            </p>
          </div>

          {/* GEO Score Card */}
          <div style={{
            padding: "1.25rem", borderRadius: "10px",
            border: "1px solid var(--border)", background: "var(--card)",
          }}>
            <p style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted-foreground)", marginBottom: "0.5rem" }}>
              GEO Score
            </p>
            <p style={{ fontSize: "2rem", fontWeight: 700, color: "var(--foreground)", margin: 0 }}>—</p>
            <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", marginTop: "0.25rem" }}>
              AI platform citation readiness
            </p>
          </div>
        </div>

        <div style={{
          padding: "2rem", borderRadius: "10px",
          border: "1px solid var(--border)", background: "var(--card)",
          textAlign: "center",
        }}>
          <Eye style={{ width: 40, height: 40, color: "var(--muted-foreground)", margin: "0 auto 1rem" }} />
          <p style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Visibility Monitor coming soon</p>
          <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", maxWidth: "400px", margin: "0 auto" }}>
            Track how your brand appears in ChatGPT, Claude, Perplexity, and Google AI Overviews.
            Monitor search engine indexing, AI citation rates, and competitor visibility.
          </p>
        </div>
      </div>
    </>
  );
}
