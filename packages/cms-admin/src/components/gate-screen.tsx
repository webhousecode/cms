"use client";

import { useEffect } from "react";
import { Github, AlertTriangle } from "lucide-react";

/**
 * Full-page branded gate screen — same visual style as login/invite pages.
 * Used for: no access, connect GitHub, redirecting to correct site.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 200,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, hsl(0 0% 5%) 0%, hsl(0 0% 10%) 50%, hsl(35 20% 10%) 100%)",
      overflow: "hidden",
    }}>
      {/* Grid pattern */}
      <div style={{
        position: "absolute",
        inset: 0,
        backgroundImage: "radial-gradient(circle at 1px 1px, hsl(0 0% 20% / 0.3) 1px, transparent 0)",
        backgroundSize: "32px 32px",
        pointerEvents: "none",
      }} />
      {/* Glow */}
      <div style={{
        position: "absolute",
        top: "-20%",
        right: "-10%",
        width: "600px",
        height: "600px",
        borderRadius: "50%",
        background: "radial-gradient(circle, hsl(38 92% 50% / 0.06) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{
          width: "100%",
          maxWidth: "380px",
          padding: "2rem",
          background: "hsl(0 0% 8% / 0.8)",
          backdropFilter: "blur(12px)",
          border: "1px solid hsl(0 0% 18%)",
          borderRadius: "16px",
          boxShadow: "0 16px 64px rgba(0,0,0,0.4), 0 0 0 1px hsl(0 0% 15%)",
        }}>
          <div style={{ marginBottom: "1.75rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
            <img src="/webhouse.app-dark-icon.svg" alt="" style={{ width: "72px", height: "72px", marginBottom: "0.25rem" }} />
            <img src="/webhouse-wordmark-dark.svg" alt="webhouse.app" style={{ height: "28px", width: "auto" }} />
          </div>
          {children}
        </div>
        <p style={{ marginTop: "1.5rem", fontSize: "0.7rem", color: "hsl(0 0% 30%)", letterSpacing: "0.05em" }}>
          Powered by <span style={{ color: "hsl(38 80% 55%)", fontWeight: 500 }}>@webhouse/cms</span>
        </p>
      </div>
    </div>
  );
}

/** Gate: User has no team membership on any site */
export function NoAccessGate() {
  return (
    <Shell>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ margin: "0 0 12px", fontSize: "20px", fontWeight: 700, color: "#fafafa" }}>
          No access
        </h1>
        <p style={{ margin: "0 0 20px", fontSize: "14px", color: "hsl(0 0% 50%)", lineHeight: 1.6 }}>
          You don&apos;t have access to any sites yet.<br />
          Ask an administrator to invite you.
        </p>
        <a
          href="/api/auth/logout"
          style={{
            fontSize: "0.8rem",
            color: "hsl(38 80% 55%)",
            textDecoration: "none",
          }}
        >
          Sign out
        </a>
      </div>
    </Shell>
  );
}

/** Gate: GitHub-backed site requires OAuth token */
export function ConnectGitHubGate({ message, showButton = true }: { message?: string; showButton?: boolean } = {}) {
  return (
    <Shell>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ margin: "0 0 12px", fontSize: "20px", fontWeight: 700, color: "#fafafa" }}>
          {showButton ? "Connect GitHub" : "Waiting for setup"}
        </h1>
        <p style={{ margin: "0 0 24px", fontSize: "14px", color: "hsl(0 0% 50%)", lineHeight: 1.6 }}>
          {message ?? <>This site stores content on GitHub.<br />Connect your account to continue.</>}
        </p>
        {showButton && (
          <a
            href="/api/auth/github"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.6rem 1.5rem",
              borderRadius: "8px",
              background: "hsl(38 92% 50%)",
              color: "hsl(38 30% 10%)",
              fontSize: "0.875rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            <Github style={{ width: 16, height: 16 }} />
            Connect GitHub
          </a>
        )}
      </div>
    </Shell>
  );
}

/** Gate: Redirect user to a site they have access to (sets cookies client-side) */
export function GitHubErrorGate({ message }: { message: string }) {
  const isRateLimit = message.includes("403");
  const isBadToken = message.includes("401") || message.includes("bad token");

  function switchSite(siteId: string) {
    document.cookie = `cms-active-site=${encodeURIComponent(siteId)};path=/;max-age=31536000;samesite=lax`;
    window.location.href = "/admin";
  }

  return (
    <Shell>
      <div style={{ textAlign: "center", maxWidth: "420px" }}>
        <AlertTriangle style={{ width: "2.5rem", height: "2.5rem", color: "rgb(234 179 8)", margin: "0 auto 1rem" }} />
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.5rem" }}>
          {isRateLimit ? "GitHub API Rate Limited" : isBadToken ? "GitHub Token Expired" : "GitHub Connection Error"}
        </h1>
        <p style={{ fontSize: "0.85rem", color: "hsl(0 0% 55%)", lineHeight: 1.6, marginBottom: "1.5rem" }}>
          {isRateLimit
            ? "Too many requests to GitHub API. This resets automatically within a few minutes. You can switch to a local site in the meantime."
            : isBadToken
            ? "The GitHub access token has expired or been revoked. Reconnect GitHub in Site Settings, or switch to another site."
            : message}
        </p>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => switchSite("default")}
            style={{
              padding: "0.6rem 1.25rem", borderRadius: "8px",
              background: "var(--primary)", color: "var(--primary-foreground)",
              border: "none", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer",
            }}
          >
            Switch to local site
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "0.6rem 1.25rem", borderRadius: "8px",
              background: "transparent", color: "hsl(0 0% 70%)",
              border: "1px solid hsl(0 0% 25%)", fontSize: "0.85rem", cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      </div>
    </Shell>
  );
}

/**
 * Gate: Site has an invalid cms.config.ts (Zod validation failed).
 * Shows the errors and lets the user switch to another site so the
 * rest of the CMS remains fully usable while they fix the config.
 */
export function SiteConfigErrorGate({ siteName, errors }: { siteName: string; errors: string }) {
  function switchSite() {
    // Clear site/org cookies — next navigation will fall back to registry defaults
    document.cookie = "cms-active-site=;path=/;max-age=0;samesite=lax";
    document.cookie = "cms-active-org=;path=/;max-age=0;samesite=lax";
    window.location.href = "/admin";
  }

  return (
    <Shell>
      <div style={{ textAlign: "center" }}>
        <AlertTriangle style={{ width: "2.5rem", height: "2.5rem", color: "rgb(239 68 68)", margin: "0 auto 1rem" }} />
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.4rem", color: "#fafafa" }}>
          Site config error
        </h1>
        <p style={{ fontSize: "0.8rem", color: "hsl(0 0% 55%)", lineHeight: 1.5, marginBottom: "0.75rem" }}>
          <strong style={{ color: "hsl(0 0% 75%)" }}>&quot;{siteName}&quot;</strong> has an invalid{" "}
          <code style={{ fontSize: "0.75rem" }}>cms.config.ts</code> and cannot load.
          Fix the config below, then switch back to this site.
        </p>
        <pre style={{
          textAlign: "left", fontSize: "0.65rem", lineHeight: 1.6,
          background: "hsl(0 0% 5%)", border: "1px solid hsl(0 0% 18%)",
          borderRadius: "6px", padding: "0.6rem 0.75rem",
          color: "rgb(252 165 165)", maxHeight: "200px", overflowY: "auto",
          marginBottom: "1.25rem", whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}>
          {errors}
        </pre>
        <button
          type="button"
          onClick={switchSite}
          style={{
            padding: "0.55rem 1.25rem", borderRadius: "8px",
            background: "hsl(38 92% 50%)", color: "hsl(38 30% 10%)",
            border: "none", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer",
          }}
        >
          Switch to another site
        </button>
      </div>
    </Shell>
  );
}

export function SiteRedirectGate({ siteId, orgId }: { siteId: string; orgId: string }) {
  useEffect(() => {
    document.cookie = `cms-active-site=${encodeURIComponent(siteId)};path=/;max-age=31536000;samesite=lax`;
    document.cookie = `cms-active-org=${encodeURIComponent(orgId)};path=/;max-age=31536000;samesite=lax`;
    window.location.href = "/admin";
  }, [siteId, orgId]);

  return (
    <Shell>
      <div style={{ textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: "14px", color: "hsl(0 0% 50%)" }}>
          Redirecting to your site…
        </p>
      </div>
    </Shell>
  );
}
