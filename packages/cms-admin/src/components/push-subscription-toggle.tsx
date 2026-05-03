/**
 * "Enable browser notifications" toggle for the admin UI.
 *
 * Drops into Site Settings → Deploy. On enable:
 *   1. Asks the OS for Notification permission
 *   2. Registers the service worker (idempotent)
 *   3. Calls pushManager.subscribe with the server's VAPID public key
 *   4. POSTs the subscription to /api/admin/push/register
 *
 * On disable:
 *   - Calls pushManager.getSubscription().unsubscribe()
 *   - We leave the server-side row in place so the user can re-enable
 *     without re-prompting (push-store dedups on next register call).
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";

type State = "idle" | "loading" | "enabled" | "disabled" | "blocked" | "unsupported" | "no-vapid" | "error";

export function PushSubscriptionToggle(): React.ReactNode {
  const [state, setState] = useState<State>("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Probe initial state on mount
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (typeof window === "undefined") return;
        if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
          if (!cancelled) setState("unsupported");
          return;
        }
        if (Notification.permission === "denied") {
          if (!cancelled) setState("blocked");
          return;
        }
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (!cancelled) setState(sub ? "enabled" : "disabled");
      } catch (e) {
        if (!cancelled) {
          setErrMsg(e instanceof Error ? e.message : String(e));
          setState("error");
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const enable = useCallback(async () => {
    setState("loading"); setErrMsg(null);
    try {
      // 1. VAPID public key
      const keyRes = await fetch("/api/admin/push/vapid-public-key");
      if (keyRes.status === 503) {
        const data = await keyRes.json();
        setErrMsg(data.error ?? "VAPID key not configured");
        setState("no-vapid");
        return;
      }
      if (!keyRes.ok) throw new Error(`vapid-public-key ${keyRes.status}`);
      const { publicKey } = await keyRes.json() as { publicKey: string };

      // 2. Permission
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "blocked" : "disabled");
        return;
      }

      // 3. Service worker
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      // 4. Subscribe — applicationServerKey accepts BufferSource; pass
      // the underlying ArrayBuffer so TypeScript's strict ArrayBufferLike
      // check is satisfied (SharedArrayBuffer would fail).
      const keyBytes = urlBase64ToUint8Array(publicKey);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes.buffer.slice(keyBytes.byteOffset, keyBytes.byteOffset + keyBytes.byteLength) as ArrayBuffer,
      });

      // 5. Register on server
      const reqBody = { subscription: sub.toJSON() };
      const regRes = await fetch("/api/admin/push/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      if (!regRes.ok) throw new Error(`register ${regRes.status}: ${await regRes.text()}`);

      setState("enabled");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }, []);

  const disable = useCallback(async () => {
    setState("loading"); setErrMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      setState("disabled");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }, []);

  // ── Rendering ──
  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
    padding: "0.75rem",
    border: "1px solid var(--border)",
    borderRadius: "6px",
  };
  const headerStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", fontWeight: 500 };
  const descStyle: React.CSSProperties = { fontSize: "0.7rem", color: "var(--muted-foreground)", lineHeight: 1.4 };

  if (state === "unsupported") {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}><BellOff size={14} /> Browser notifications</div>
        <div style={descStyle}>Your browser doesn&apos;t support web push (no Notification API or PushManager). Try Chrome/Firefox/Safari 16+.</div>
      </div>
    );
  }
  if (state === "blocked") {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}><BellOff size={14} /> Browser notifications</div>
        <div style={descStyle}>You blocked notifications for this site. To re-enable: click the lock icon in the address bar → Site settings → Notifications → Allow, then reload.</div>
      </div>
    );
  }
  if (state === "no-vapid") {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}><BellOff size={14} /> Browser notifications</div>
        <div style={descStyle}>Server is missing VAPID keys. Run <code>npx web-push generate-vapid-keys</code> and set <code>VAPID_PUBLIC_KEY</code>, <code>VAPID_PRIVATE_KEY</code>, and <code>VAPID_SUBJECT</code> as Fly secrets, then redeploy cms-admin.</div>
        {errMsg && <div style={{ ...descStyle, color: "var(--destructive)" }}>{errMsg}</div>}
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
        <div style={headerStyle}>
          {state === "enabled" ? <Bell size={14} style={{ color: "var(--primary)" }} /> : <BellOff size={14} />}
          Browser notifications
          {state === "enabled" && <span style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", background: "color-mix(in srgb, var(--primary) 20%, transparent)", color: "var(--primary)", borderRadius: "999px" }}>ON</span>}
        </div>
        <button
          onClick={state === "enabled" ? disable : enable}
          disabled={state === "loading"}
          style={{
            padding: "0.3rem 0.75rem", borderRadius: "5px",
            border: "1px solid var(--border)",
            background: state === "enabled" ? "transparent" : "var(--primary)",
            color: state === "enabled" ? "var(--foreground)" : "var(--primary-foreground, #fff)",
            fontSize: "0.75rem", fontWeight: 500, cursor: state === "loading" ? "wait" : "pointer",
            opacity: state === "loading" ? 0.6 : 1,
            display: "inline-flex", alignItems: "center", gap: "0.35rem",
          }}
        >
          {state === "loading" && <Loader2 size={12} className="spin" />}
          {state === "enabled" ? "Disable" : "Enable"}
        </button>
      </div>
      <div style={descStyle}>
        Get a native OS notification when your site finishes deploying — even when this tab is closed.
      </div>
      {errMsg && <div style={{ ...descStyle, color: "var(--destructive)" }}>{errMsg}</div>}
    </div>
  );
}

/**
 * Convert a base64 VAPID public key to the Uint8Array format
 * `pushManager.subscribe()` requires.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
