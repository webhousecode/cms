"use client";

import { useEffect } from "react";
import { Github } from "lucide-react";

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
